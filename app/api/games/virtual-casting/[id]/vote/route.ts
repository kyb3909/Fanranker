import { currentUser } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { z } from "zod"

// POST: Vote for a suggestion
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })
    }

    const { id: castingId } = await params
    const supabase = createServiceRoleClient()
    const body = await req.json()
    const VoteSchema = z.object({ suggestion_id: z.string().min(1) })
    const parsed = VoteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "추천 ID가 필요합니다." }, { status: 400 })
    }
    const { suggestion_id } = parsed.data

    // Verify suggestion belongs to this casting
    const { data: suggestion } = await supabase
      .from("virtual_casting_suggestions")
      .select("id, casting_id, vote_count")
      .eq("id", suggestion_id)
      .eq("casting_id", castingId)
      .single()

    if (!suggestion) {
      return NextResponse.json({ error: "추천을 찾을 수 없습니다." }, { status: 404 })
    }

    // Check if already voted
    const { data: existingVote } = await supabase
      .from("virtual_casting_votes")
      .select("id")
      .eq("suggestion_id", suggestion_id)
      .eq("user_id", user.id)
      .maybeSingle()

    if (existingVote) {
      // Remove vote (toggle)
      await supabase.from("virtual_casting_votes").delete().eq("id", existingVote.id)

      // Recount votes from source of truth (votes table) for atomic accuracy
      const { count: newSuggestionCount } = await supabase
        .from("virtual_casting_votes")
        .select("id", { count: "exact", head: true })
        .eq("suggestion_id", suggestion_id)

      const suggestionVoteCount = newSuggestionCount ?? 0
      await supabase
        .from("virtual_casting_suggestions")
        .update({ vote_count: suggestionVoteCount })
        .eq("id", suggestion_id)

      // Recount casting total
      const { count: newCastingCount } = await supabase
        .from("virtual_casting_votes")
        .select("id", { count: "exact", head: true })
        .eq("suggestion_id", suggestion_id)

      // Get all suggestion IDs for this casting to count total
      const { data: allSuggestions } = await supabase
        .from("virtual_casting_suggestions")
        .select("id")
        .eq("casting_id", castingId)

      if (allSuggestions) {
        const suggestionIds = allSuggestions.map((s) => s.id)
        const { count: totalCastingVotes } = await supabase
          .from("virtual_casting_votes")
          .select("id", { count: "exact", head: true })
          .in("suggestion_id", suggestionIds)

        await supabase
          .from("virtual_castings")
          .update({ vote_count: totalCastingVotes ?? 0 })
          .eq("id", castingId)
      }

      return NextResponse.json({ voted: false, vote_count: suggestionVoteCount })
    }

    // Add vote
    const { error: voteError } = await supabase.from("virtual_casting_votes").insert({
      suggestion_id,
      user_id: user.id,
    })

    if (voteError) {
      if (voteError.code === "23505") {
        return NextResponse.json({ error: "이미 투표했습니다." }, { status: 400 })
      }
      return NextResponse.json({ error: "투표에 실패했습니다." }, { status: 500 })
    }

    // Recount votes from source of truth for atomic accuracy
    const { count: newSuggestionCount } = await supabase
      .from("virtual_casting_votes")
      .select("id", { count: "exact", head: true })
      .eq("suggestion_id", suggestion_id)

    const suggestionVoteCount = newSuggestionCount ?? 0
    await supabase
      .from("virtual_casting_suggestions")
      .update({ vote_count: suggestionVoteCount })
      .eq("id", suggestion_id)

    // Recount casting total
    const { data: allSuggestions } = await supabase
      .from("virtual_casting_suggestions")
      .select("id")
      .eq("casting_id", castingId)

    if (allSuggestions) {
      const suggestionIds = allSuggestions.map((s) => s.id)
      const { count: totalCastingVotes } = await supabase
        .from("virtual_casting_votes")
        .select("id", { count: "exact", head: true })
        .in("suggestion_id", suggestionIds)

      await supabase
        .from("virtual_castings")
        .update({ vote_count: totalCastingVotes ?? 0 })
        .eq("id", castingId)
    }

    return NextResponse.json({ voted: true, vote_count: suggestionVoteCount })
  } catch {
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 })
  }
}

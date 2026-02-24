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

      // Decrement vote counts
      await supabase
        .from("virtual_casting_suggestions")
        .update({ vote_count: Math.max(0, suggestion.vote_count - 1) })
        .eq("id", suggestion_id)

      // Decrement casting total
      const { data: casting } = await supabase
        .from("virtual_castings")
        .select("vote_count")
        .eq("id", castingId)
        .single()

      if (casting) {
        await supabase
          .from("virtual_castings")
          .update({ vote_count: Math.max(0, casting.vote_count - 1) })
          .eq("id", castingId)
      }

      return NextResponse.json({ voted: false, vote_count: Math.max(0, suggestion.vote_count - 1) })
    }

    // Add vote
    const { error: voteError } = await supabase.from("virtual_casting_votes").insert({
      suggestion_id,
      user_id: user.id,
    })

    if (voteError) {
      return NextResponse.json({ error: "투표에 실패했습니다." }, { status: 500 })
    }

    // Increment vote counts
    await supabase
      .from("virtual_casting_suggestions")
      .update({ vote_count: suggestion.vote_count + 1 })
      .eq("id", suggestion_id)

    const { data: casting } = await supabase
      .from("virtual_castings")
      .select("vote_count")
      .eq("id", castingId)
      .single()

    if (casting) {
      await supabase
        .from("virtual_castings")
        .update({ vote_count: casting.vote_count + 1 })
        .eq("id", castingId)
    }

    return NextResponse.json({ voted: true, vote_count: suggestion.vote_count + 1 })
  } catch {
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 })
  }
}

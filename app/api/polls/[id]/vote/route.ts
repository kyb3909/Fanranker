import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiUnauthorized, apiBadRequest, checkRateLimit } from "@/lib/api-error"
import { z } from "zod"

const VoteSchema = z.object({
  optionKey: z.string().min(1),
  reason: z.string().trim().max(280).optional(),
})

/**
 * POST /api/polls/[id]/vote
 * 폴 투표(원탭) + 선택적 "왜?" 한 줄. 유저당 1표(재호출 시 갱신).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = checkRateLimit(request, "STANDARD")
    if (limited) return limited

    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const { id: pollId } = await params
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }
    const parsed = VoteSchema.safeParse(body)
    if (!parsed.success) return apiBadRequest("선택지(optionKey)가 필요합니다.")
    const { optionKey, reason } = parsed.data

    // Service Role — currentUser()로 user_id 검증했으므로 안전.
    const supabase = createServiceRoleClient()

    const { data: poll } = await supabase
      .from("polls")
      .select("id, options, is_active")
      .eq("id", pollId)
      .maybeSingle()
    if (!poll || !poll.is_active) return apiBadRequest("종료되었거나 없는 설문이에요.")

    const validKeys = ((poll.options as { key: string }[]) ?? []).map((o) => o.key)
    if (!validKeys.includes(optionKey)) return apiBadRequest("잘못된 선택지예요.")

    const { error: upsertErr } = await supabase.from("poll_votes").upsert(
      {
        poll_id: pollId,
        user_id: user.id,
        option_key: optionKey,
        reason: reason && reason.length > 0 ? reason : null,
      },
      { onConflict: "poll_id,user_id" }
    )
    if (upsertErr) return apiError("투표 저장 중 오류가 발생했습니다.", 500, upsertErr)

    const { data: votes } = await supabase
      .from("poll_votes")
      .select("option_key")
      .eq("poll_id", pollId)
    const results: Record<string, number> = {}
    for (const k of validKeys) results[k] = 0
    for (const v of votes ?? []) results[v.option_key] = (results[v.option_key] ?? 0) + 1

    return NextResponse.json({
      success: true,
      results,
      total: (votes ?? []).length,
      myVote: { optionKey, reason: reason ?? null },
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

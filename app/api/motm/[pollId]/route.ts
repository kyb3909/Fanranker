import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, checkRateLimit } from "@/lib/api-error"
import type { MotmOption } from "@/lib/motm/poll"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/motm/[pollId]
 * MoTM 폴 상세 — 후보 목록 + 집계 + (로그인 시) 내 픽. 비로그인도 결과 열람 가능
 * (콘텐츠 소비 — 투표만 로그인). 개인화(myKey) 포함이라 no-store.
 * 투표는 기존 POST /api/polls/[id]/vote 를 그대로 쓴다.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pollId: string }> }
) {
  try {
    const limited = checkRateLimit(request, "STANDARD")
    if (limited) return limited

    const { pollId } = await params
    if (!UUID_RE.test(pollId)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }

    const supabase = createServiceRoleClient()
    const { data: poll } = await supabase
      .from("polls")
      .select("id, question, options, is_active, closes_at")
      .eq("id", pollId)
      .eq("kind", "motm")
      .maybeSingle()
    if (!poll) return NextResponse.json({ error: "not_found" }, { status: 404 })

    const { data: votes } = await supabase
      .from("poll_votes")
      .select("option_key, user_id")
      .eq("poll_id", pollId)

    const options = (poll.options as MotmOption[]) ?? []
    const results: Record<string, number> = {}
    for (const o of options) results[o.key] = 0
    for (const v of votes ?? []) results[v.option_key] = (results[v.option_key] ?? 0) + 1

    const user = await currentUser().catch(() => null)
    const myKey = user
      ? ((votes ?? []).find((v) => v.user_id === user.id)?.option_key ?? null)
      : null

    const nowIso = new Date().toISOString()
    const res = NextResponse.json({
      pollId: String(poll.id),
      question: String(poll.question),
      options,
      results,
      total: (votes ?? []).length,
      myKey,
      closed: !poll.is_active || (poll.closes_at != null && poll.closes_at < nowIso),
      closesAt: poll.closes_at ?? null,
    })
    res.headers.set("Cache-Control", "no-store")
    return res
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

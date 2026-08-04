import { NextRequest, NextResponse } from "next/server"
import { requireStaffApi } from "@/lib/admin/roles"
import {
  summarizeNewsroomFunnel,
  type CandidateEventSnapshot,
  type CandidateSnapshot,
} from "@/lib/news/funnel-metrics"

export const dynamic = "force-dynamic"

const MAX_ROWS = 10_000

/** 뉴스룸 후보 원장 상태 — 구조 전환 전후의 생산량·소실·지연 비교용. */
export async function GET(request: NextRequest) {
  const auth = await requireStaffApi()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  const requestedHours = Number(request.nextUrl.searchParams.get("hours") ?? "24")
  const hours = Number.isFinite(requestedHours)
    ? Math.min(168, Math.max(1, Math.round(requestedHours)))
    : 24
  const since = new Date(Date.now() - hours * 3_600_000).toISOString()

  const [{ data: candidates, error: candidateError, count: candidateCount }, eventResult] =
    await Promise.all([
      supabase
        .from("news_candidates")
        .select("candidate_id, state, first_seen_at", { count: "exact" })
        .gte("first_seen_at", since)
        .order("first_seen_at", { ascending: false })
        .limit(MAX_ROWS),
      supabase
        .from("news_candidate_events")
        .select("candidate_id, to_state, actor, reason_code, created_at", { count: "exact" })
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(MAX_ROWS),
    ])

  if (candidateError || eventResult.error) {
    console.error("[admin2/newsroom-funnel] 원장 조회 실패", {
      candidates: candidateError?.message,
      events: eventResult.error?.message,
    })
    return NextResponse.json({ error: "뉴스룸 원장 조회 실패" }, { status: 500 })
  }

  const metrics = summarizeNewsroomFunnel(
    (candidates ?? []) as CandidateSnapshot[],
    (eventResult.data ?? []) as CandidateEventSnapshot[]
  )

  return NextResponse.json({
    ok: true,
    hours,
    since,
    ...metrics,
    truncated: (candidateCount ?? 0) > MAX_ROWS || (eventResult.count ?? 0) > MAX_ROWS,
    totals: { candidates: candidateCount ?? 0, events: eventResult.count ?? 0 },
  })
}

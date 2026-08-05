import { NextRequest, NextResponse } from "next/server"
import { requireStaffApi } from "@/lib/admin/roles"
import { ASSIGNMENT_PROMPT_VERSION } from "@/lib/news/assignment-desk"
import {
  summarizeAssignmentShadow,
  type AssignmentRowSnapshot,
  type CandidateOutcomeSnapshot,
  type InterestEventSnapshot,
} from "@/lib/news/assignment-metrics"

export const dynamic = "force-dynamic"

const MAX_ROWS = 10_000

/**
 * 어사인먼트 데스크 shadow 판정 대조 — 24/72시간(`?hours=`)으로 본다.
 *
 * 전환 판단에 쓰는 화면이므로 "판정이 몇 건 나왔나"보다 **어긋난 지점**을 먼저 본다:
 * `agreement.rejectPublishedRate`(shadow 가 버리자고 했는데 실제로 나간 비율)가 0 에
 * 가깝지 않으면 실집행 전환은 없다.
 *
 * `?promptVersion=` 없이 호출하면 현재 버전만 본다 — 프롬프트를 올린 뒤 옛 판정이
 * 섞여 변경 효과가 희석되는 걸 막는다. `all` 을 주면 전 버전을 함께 본다.
 */
export async function GET(request: NextRequest) {
  const auth = await requireStaffApi()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  const requestedHours = Number(request.nextUrl.searchParams.get("hours") ?? "24")
  const hours = Number.isFinite(requestedHours)
    ? Math.min(168, Math.max(1, Math.round(requestedHours)))
    : 24
  const since = new Date(Date.now() - hours * 3_600_000).toISOString()
  const promptVersion =
    request.nextUrl.searchParams.get("promptVersion") ?? ASSIGNMENT_PROMPT_VERSION

  let query = supabase
    .from("news_assignments")
    .select(
      "candidate_id, outcome, status, desk, risk, format, reason_codes, model, latency_ms, estimated_cost_usd, created_at",
      { count: "exact" }
    )
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(MAX_ROWS)
  if (promptVersion !== "all") query = query.eq("prompt_version", promptVersion)

  const { data: assignments, error: assignmentError, count } = await query
  if (assignmentError) {
    console.error("[admin2/assignment-shadow] 배정 원장 조회 실패", assignmentError.message)
    return NextResponse.json({ error: "배정 원장 조회 실패" }, { status: 500 })
  }

  const rows = (assignments ?? []) as AssignmentRowSnapshot[]
  const candidateIds = [...new Set(rows.map((row) => row.candidate_id))]
  if (candidateIds.length === 0) {
    return NextResponse.json({
      ok: true,
      hours,
      since,
      promptVersion,
      ...summarizeAssignmentShadow([], [], []),
      totals: { assignments: count ?? 0 },
    })
  }

  // 실제 종착(states)과 기존 관심도 필터 판정(events)을 같은 후보 집합에서 가져온다.
  const [{ data: candidates, error: candidateError }, { data: interest, error: interestError }] =
    await Promise.all([
      supabase
        .from("news_candidates")
        .select("candidate_id, state")
        .in("candidate_id", candidateIds),
      supabase
        .from("news_candidate_events")
        .select("candidate_id, reason_code")
        .eq("actor", "news-interest-filter")
        .in("candidate_id", candidateIds)
        .limit(MAX_ROWS),
    ])
  if (candidateError || interestError) {
    console.error("[admin2/assignment-shadow] 대조 데이터 조회 실패", {
      candidates: candidateError?.message,
      interest: interestError?.message,
    })
    return NextResponse.json({ error: "대조 데이터 조회 실패" }, { status: 500 })
  }

  const metrics = summarizeAssignmentShadow(
    rows,
    (candidates ?? []) as CandidateOutcomeSnapshot[],
    (interest ?? []) as InterestEventSnapshot[]
  )

  return NextResponse.json({
    ok: true,
    hours,
    since,
    promptVersion,
    ...metrics,
    truncated: (count ?? 0) > MAX_ROWS,
    totals: { assignments: count ?? 0 },
  })
}

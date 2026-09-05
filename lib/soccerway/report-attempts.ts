import "server-only"

import type { ReportStage } from "./report-gaps"

/**
 * 경기 리포트 실패 원장 기록기 (2026-09-02).
 *
 * 파이프라인 게이트마다 한 줄 남긴다. 성공은 match_reports 에 남으므로 여기엔 실패만.
 * 어휘(stage)는 report-gaps.ts 의 REPORT_STAGES 가 정본이고, 카드 집계도 그쪽이 한다.
 *
 * ⚠️ fail-open — 기록 실패는 삼키되 호출부가 await해 응답 종료 전에 기록을 마친다.
 * ⚠️ DB 클라이언트는 **여기서** 가져온다(최상위 import 아님) — lib/llm/usage-log.ts 와
 *    같은 이유: `lib/supabase/server` → `lib/env` 가 import 시점에 env 를 검증해 throw 하고,
 *    그러면 이 파일을 최상위에서 끄는 모듈의 시험이 열리지 못한다.
 * ⚠️ reason 은 한 줄로 자른다. 검증기 지적사항 전문·프롬프트·본문은 넣지 않는다 — 원장은
 *    "어느 문에서 멈췄나"를 세는 표이지 디버그 덤프가 아니다.
 */
/**
 * 최근 N ms 안에 이 경기의 원장 행이 있나. 기록 부재만으로 실패 단계를 추론하면 안 된다.
 * ⚠️ 조회 실패면 true — "있다고 치고" 아무것도 안 남기는 쪽이 가짜 사유를 남기는 쪽보다 낫다.
 */
export async function hasRecentReportAttempt(gameId: string, withinMs: number): Promise<boolean> {
  try {
    const { createServiceRoleClient } = await import("@/lib/supabase/server")
    const { count, error } = await createServiceRoleClient()
      .from("match_report_attempts")
      .select("id", { count: "exact", head: true })
      .eq("game_id", gameId)
      .gte("attempted_at", new Date(Date.now() - withinMs).toISOString())
    return error ? true : (count ?? 0) > 0
  } catch {
    return true
  }
}

export async function recordReportAttempt(
  gameId: string,
  eventId: string | null,
  stage: ReportStage,
  reason?: string | null
): Promise<void> {
  try {
    const { createServiceRoleClient } = await import("@/lib/supabase/server")
    const { error } = await createServiceRoleClient()
      .from("match_report_attempts")
      .insert({
        game_id: gameId,
        event_id: eventId,
        stage,
        reason: reason ? String(reason).replace(/\s+/g, " ").slice(0, 300) : null,
      })
    if (error) console.warn("[match-report] 실패 원장 기록 실패:", error.code)
  } catch {
    console.warn("[match-report] 실패 원장 기록 중 예외")
  }
}

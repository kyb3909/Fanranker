import { SupabaseClient } from "@supabase/supabase-js"

/**
 * 정산 게이트 — settlePredictions 입구에서 부른다 (2026-08-30 운영자 확정).
 *
 * 축구 + completed 경기는 교차검증 verdict(match/waived)를 받아야만 통과.
 * cancelled(환불)와 축구 외 종목은 검증 대상이 아니므로 그대로 통과.
 *
 * ⚠️ **가벼운 모듈로 따로 둔 이유**: 러너(result-crosscheck)는 server-only + LFA +
 *    디스코드를 물고 있는데, 그걸 settle.ts 가 import 하면 settle 테스트 파일이
 *    열리지도 못한다 — "0 test 통과"가 검사 전멸을 가리는 그 사고
 *    (2026-08 CI 8일 빨간불의 원인 유형). 게이트는 supabase 클라이언트 타입 외에
 *    아무것도 물지 않는다.
 *
 * ⚠️ **돈이 걸린 자리라 fail-closed** — 검증 테이블 조회가 실패하면 축구 완료 경기를
 *    보류한다(15분 뒤 스윕이 다시 온다). 잘못 보류는 지연이지만, 잘못 지급은 회수다.
 */
export async function filterVerifiedForSettle<
  G extends { id: string; sport: string; status: string },
>(supabase: SupabaseClient, games: G[]): Promise<{ allowed: G[]; held: G[] }> {
  const needsCheck = games.filter((g) => g.sport === "축구" && g.status === "completed")
  if (needsCheck.length === 0) return { allowed: games, held: [] }

  let verified = new Set<string>()
  try {
    const { data, error } = await supabase
      .from("betman_result_checks")
      .select("game_id, verdict")
      .in(
        "game_id",
        needsCheck.map((g) => g.id)
      )
      .in("verdict", ["match", "waived"])
    if (error) throw error
    verified = new Set(((data ?? []) as { game_id: string }[]).map((c) => c.game_id))
  } catch {
    verified = new Set() // fail-closed — 축구 완료분 전부 보류
  }

  const held: G[] = []
  const allowed = games.filter((g) => {
    const gated = g.sport === "축구" && g.status === "completed"
    if (!gated || verified.has(g.id)) return true
    held.push(g)
    return false
  })
  return { allowed, held }
}

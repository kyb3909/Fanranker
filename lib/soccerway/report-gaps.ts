/**
 * 경기 리포트 실패 원장 — **순수 모듈** (2026-09-02).
 *
 * 리포트 파이프라인(match-extras.ts cachedReport)은 6단계 fail-closed 다. 어느 게이트든
 * 실패하면 null 이고, 종전엔 그 이유가 Vercel 로그의 console.warn 한 줄로만 남았다.
 * 7일간 대상 경기 23개 중 리포트 10개 — 빠진 13개 중 8개는 이유를 아무도 몰랐다.
 *
 * 여기서 정하는 것 둘: 게이트 이름(원장 `stage` 컬럼의 어휘)과, 원장을 관제실 카드로
 * 접는 집계. 기록 자체는 report-attempts.ts(server-only) 가 한다.
 *
 * ⚠️ 검증 강도는 이 모듈과 무관하다. 여기는 눈이지 손이 아니다.
 */

/** 게이트 어휘 — 파이프라인 순서대로. 원장 `stage` 에 이 키만 들어간다 */
export const REPORT_STAGES = {
  /** soccerway 경기 해석 실패 — 창(킥오프+24h) 안인데 매치 페이지·이벤트를 못 찾음. 크론이 남긴다 */
  resolve: "경기 해석 실패",
  /** 확정 스코어 실패 — 우리 DB·LFA 색인 어디에도 종료 스코어가 없거나 betman 과 어긋남 */
  score: "확정 스코어",
  /** soccerway 에 그 경기 전용 리포트 기사가 아직/영영 없음 */
  article: "원문 없음",
  /** 기사는 있는데 본문 문단이 2개 미만 (페이월·구조 변경) */
  paragraphs: "본문 부족",
  /** 사건 추출 LLM 이 빈 결과 */
  extract: "사건 추출",
  /** 작성 → 숫자·스코어·소속 게이트 → 독립 검증(terra) 3회 모두 불합격 */
  verify: "검증 불합격",
  /** 작성 LLM 자체가 빈 결과 */
  compose: "작성 실패",
  /** 검증된 리포트의 영구 저장 실패 — 생성 성공으로 집계하면 안 된다 */
  store: "저장 실패",
} as const

export type ReportStage = keyof typeof REPORT_STAGES

export interface ReportAttemptRow {
  game_id: string
  stage: string
  attempted_at: string
}

export interface ReportGapsSummary {
  /** 리포트 없이 실패 원장만 남은 경기 수 (경기 = game_id 단위. 형제 행은 호출부가 대표 1행만 남긴다) */
  games: number
  /** 경기별 **마지막** 사유의 분포, 많은 순 */
  reasons: { stage: string; n: number }[]
}

/**
 * 원장 → 카드 숫자.
 *
 * - 경기당 **마지막 시도**의 사유만 센다. 같은 경기가 30분마다 "원문 없음"으로 40번 쌓여도 1이다.
 * - 저장 리포트가 생긴 경기는 뺀다 — 나중에 성공한 건 실패가 아니다.
 * - 입력은 attempted_at 내림차순이어야 한다(호출부 쿼리가 그렇게 준다). 순서를 믿지 않고
 *   여기서 다시 고른다.
 */
export function summarizeReportGaps(
  attempts: ReportAttemptRow[],
  reportedGameIds: string[]
): ReportGapsSummary {
  const reported = new Set(reportedGameIds)
  const latest = new Map<string, ReportAttemptRow>()
  for (const a of attempts) {
    if (!a?.game_id || reported.has(a.game_id)) continue
    const prev = latest.get(a.game_id)
    if (!prev || a.attempted_at > prev.attempted_at) latest.set(a.game_id, a)
  }
  const counts = new Map<string, number>()
  for (const a of latest.values()) {
    const label = REPORT_STAGES[a.stage as ReportStage] ?? a.stage
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return {
    games: latest.size,
    reasons: [...counts.entries()]
      .map(([stage, n]) => ({ stage, n }))
      .sort((x, y) => y.n - x.n || x.stage.localeCompare(y.stage)),
  }
}

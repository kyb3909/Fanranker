/**
 * 불변식 판정 — FT 가 지났는데 MoTM 폴이 없는가 (**순수 모듈**, 2026-09-01).
 *
 * ## 왜 감시가 필요한가
 * MoTM 폴 생성은 15분 크론인데, FT 판정 근거가 **무료 피드(wisetoto)의 스코어 하나**였다.
 * 그 피드가 결과를 배치로 올리는 바람에 실측 지연이 최대 **7시간 40분**이었고(2026-08-31
 * 22:30 킥오프 경기: FT 00:20 → 폴 08:01), 폴 마감이 익일 11:00 KST 라 정작 사람이 투표할
 * 시간대가 통째로 지나간 뒤에 열렸다. 산 피드(LFA)를 FT 증거로 추가해 고쳤지만
 * (`lib/motm/ft-evidence.ts`), 증거 경로가 다시 좁아지면 같은 침묵이 재발한다.
 *
 * ## 임계값 — 집계형 (모수 하한 + 비율)
 * 개별 경기의 결번은 **정당할 수 있다**: 라인업이 얇거나(`thin_lineup`) 아예 없으면
 * (`no_lineup`) 폴을 안 만드는 것이 설계다. 그 판정을 감사관이 완전히 복제하려면
 * `buildMotmOptions` 까지 불러야 해서 비싸다. 그래서 개별 건이 아니라 **비율**로 본다
 * (`lineup_bench_empty` 와 같은 계열).
 *
 * 유예 2시간의 근거: 생성 주기가 15분이므로 8회차 결번이고, 실사고 지연(7h40m) 대비
 * 3배 이상 마진이며, 마감(익일 11:00)까지 손 쓸 시간이 남는다. 감사관이 매시 :44 라
 * 실제 통보는 최대 +1시간 늦는다는 점까지 감안한 값이다.
 *
 * ⚠️ FT 증거·라인업 자격 판정은 **호출부가 파이프라인과 같은 모듈로** 넘겨야 한다
 *    (`pickFtScore`). 여기서 규칙을 복제하면 감시와 생성이 서로 다른 말을 하게 된다 —
 *    이 저장소가 이미 아는 함정이다.
 */

export interface MotmCandidate {
  /** polls.match_key 와 같은 형식 (lib/match/match-key.ts) */
  matchKey: string
  label: string
  /** FT 시각 (ms) = 킥오프 + 110분 */
  ftAtMs: number
  /** 이 경기에 확정 라인업 저장분이 있는가 — 없으면 폴이 없는 게 정상 */
  hasLineup: boolean
  /** FT 증거가 있는가 (pickFtScore 결과) — 없으면 연기·취소 잔재일 수 있다 */
  hasFtEvidence: boolean
}

export interface MotmCoverage {
  /** 폴이 있어야 마땅한 경기 수 */
  eligible: number
  /** 그중 폴이 없는 것 */
  missing: { matchKey: string; label: string }[]
  /** 결번율 (eligible 이 0 이면 0) */
  ratio: number
  alert: boolean
}

/** 모수가 이보다 적으면 비율이 요동쳐 판단할 수 없다 */
export const MOTM_MIN_ELIGIBLE = 5
/** 이 비율 이상 결번이면 생성 경로가 막힌 것으로 본다 */
export const MOTM_MISSING_RATIO = 0.4
/** FT 이후 이만큼 지나도 폴이 없으면 결번으로 센다 */
export const MOTM_GRACE_MS = 2 * 3600_000

export function assessMotmCoverage(
  candidates: MotmCandidate[],
  existingKeys: Set<string>,
  nowMs: number,
  opts: { graceMs?: number; minEligible?: number; ratio?: number } = {}
): MotmCoverage {
  const graceMs = opts.graceMs ?? MOTM_GRACE_MS
  const minEligible = opts.minEligible ?? MOTM_MIN_ELIGIBLE
  const ratioGate = opts.ratio ?? MOTM_MISSING_RATIO

  const eligibleList = (candidates ?? []).filter(
    (c) =>
      c.hasFtEvidence && // 연기·취소 잔재 차단
      c.hasLineup && // 라인업 없으면 폴이 없는 게 정상
      Number.isFinite(c.ftAtMs) &&
      nowMs >= c.ftAtMs + graceMs
  )
  const missing = eligibleList
    .filter((c) => !existingKeys.has(c.matchKey))
    .map((c) => ({ matchKey: c.matchKey, label: c.label }))

  const eligible = eligibleList.length
  const ratio = eligible > 0 ? missing.length / eligible : 0
  return {
    eligible,
    missing,
    ratio,
    alert: eligible >= minEligible && ratio >= ratioGate,
  }
}

/**
 * MoTM 이 "이 경기는 끝났다"를 무엇으로 판단하는가 — **순수 모듈** (2026-09-01).
 *
 * ## 무엇이 막혀 있었나
 * 후보 선별의 마지막 관문이 `betman_games.home_score != null` 하나였다. 의도는 옳다 —
 * 연기·취소 경기를 "킥오프 +110분이 지났으니 끝났다"로 단정하면 안 된다. 스코어가 한 번은
 * 찍혀야 진짜 FT 라는 증거가 된다.
 *
 * 문제는 **그 스코어를 무료 피드(wisetoto)만 공급한다**는 것이다. 실측(2026-09-01
 * 애스턴 빌라 0-1 아스널): LFA 가 06:03:42 에 `finished=true` + 0-1 을 확정했는데,
 * betman 은 06:30 까지도 `in_progress` / null 이었다. 어제는 더 벌어졌다 —
 * MoTM 폴이 01:15 에 4건, 08:01 에 9건, **두 뭉치로** 생성됐다. 22:30 킥오프 경기는
 * FT 가 00:20 인데 폴이 08:01 에 생겼다. **7시간 40분**이다.
 *
 * 돈 주고 사는 피드가 이미 아는 결과를, 배치로 올라오는 무료 피드를 기다리느라 못 쓴 것이다.
 * 운영자가 일정 병합에 이미 세운 원칙("돈 내고 가져오는 피드를 우선시", 2026-08-20)이
 * 여기엔 안 걸려 있었다.
 *
 * ## 고친 방식 — 가드는 그대로, 증거를 하나 더 받는다
 * FT 증거를 **둘 중 하나**로 인정한다.
 * 1. betman 스코어가 찍혀 있다 (종전 그대로)
 * 2. LFA 상세가 `finished` 이고 양쪽 스코어가 다 있다 (`match_details_cache`)
 *
 * 어느 쪽도 없으면 여전히 후보에서 뺀다 — 연기·취소 가드는 **약해지지 않는다.**
 * 시간만으로 FT 를 단정하는 경로는 새로 생기지 않는다.
 *
 * ⚠️ **betman 이 있으면 betman 을 쓴다.** 여기서 나온 스코어는 폴 질문 문구
 *    ("오늘의 MoTM은? · 애스턴 빌라 0–1 아스널")에만 쓰이고 정산에는 안 쓰이지만,
 *    이미 떠 있는 지면과 숫자가 갈리는 게 제일 나쁘다. LFA 는 **비어 있을 때만** 채운다.
 *    (확정 스코어 교차검증이 필요한 곳은 `lib/soccerway/confirmed-score.ts` 가 따로 있다.)
 */

export interface BetmanScore {
  homeScore: number | null
  awayScore: number | null
}

/** `match_details_cache` 한 행에서 판정에 필요한 것만 */
export interface LfaDetailRow {
  finished: boolean
  homeScore: number | null
  awayScore: number | null
}

export interface FtScore {
  home: number
  away: number
  /** 어느 피드가 FT 를 증언했나 — 크론 응답에 실어 지연을 눈으로 본다 */
  source: "betman" | "lfa"
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  return null
}

/**
 * `match_details_cache.payload` 에서 FT 증거를 꺼낸다.
 * payload 는 외부 응답을 담아둔 것이라 모양을 믿지 않는다 — 숫자가 아니면 없는 것으로 친다.
 */
export function lfaDetailRow(row: {
  finished?: unknown
  payload?: { homeScore?: unknown; awayScore?: unknown } | null
}): LfaDetailRow {
  return {
    finished: row?.finished === true,
    homeScore: num(row?.payload?.homeScore),
    awayScore: num(row?.payload?.awayScore),
  }
}

/**
 * 이 경기의 FT 스코어. 증거가 없으면 null — **호출부는 그때 후보에서 뺀다.**
 *
 * @param betman betman 행(형제 행 중 스코어가 있는 것)의 스코어
 * @param lfaRows 같은 경기의 `match_details_cache` 행들 (형제 gameId 전부)
 */
export function pickFtScore(betman: BetmanScore, lfaRows: LfaDetailRow[]): FtScore | null {
  const bh = num(betman?.homeScore)
  const ba = num(betman?.awayScore)
  if (bh != null && ba != null) return { home: bh, away: ba, source: "betman" }

  // ⚠️ `finished` 가 아닌 행은 절대 쓰지 않는다 — 경기 중 스코어로 폴을 열면
  //    "0–1 아스널" 이 후반 44분에 박제된다.
  for (const r of lfaRows ?? []) {
    if (!r?.finished) continue
    const h = num(r.homeScore)
    const a = num(r.awayScore)
    if (h != null && a != null) return { home: h, away: a, source: "lfa" }
  }
  return null
}

/**
 * 스코어 출처 우선순위 — **순수 모듈** (2026-08-25 외부 감사 P0-2).
 *
 * ## 왜 있는가
 * 감사 지적: `/matches` 는 "경기 중 2-1", 같은 시각 매치센터는 "FT 2-2". 같은 사이트가
 * 한 경기를 두 가지로 말했다. 감사는 이걸 캐시 문제로 봤지만 **캐시가 아니었다** —
 * 두 지면이 **서로 다른 우선순위**를 쓰고 있었다:
 *
 *     매치센터   라이브면 LFA, 아니면 betman ?? LFA     ← 규칙이 맞다
 *     /matches   언제나 betman ?? LFA                   ← 라이브에서 어긋난다
 *
 * ⚠️ 와이즈토토(=`betman_games.home_score`)는 **라이브 점수를 주지 않는다.** 경기 중에는
 *    직전 라운드 값이 그대로 남아 있고, `??` 는 null 이 아니면 이긴다. 그래서 낡은
 *    스코어가 산 피드의 실시간 스코어를 덮었다.
 *
 * 규칙을 파일 하나에 두고 두 지면이 같이 쓴다. 두 지면이 각자 규칙을 들고 있는 한
 * 언젠가 또 갈라진다 — 실제로 갈라졌다.
 */

/** 경기가 진행 중인가 — 이 판정만으로 우선순위가 갈린다 */
export function isLiveState(status: string | null | undefined): boolean {
  return status === "in_progress"
}

/**
 * 화면에 낼 스코어 한 칸.
 *
 * @param live   진행 중인가
 * @param lfa    산 피드(LFA) 값 — 라이브의 유일한 공급원
 * @param betman `betman_games` 칼럼 — VPS betman 결과 크롤(15분)이 종료 후에 채운다
 *               (2026-09-02 정정: 종전 주석의 "와이즈토토 값"은 틀렸다 — wisetoto 는 걷어냈다)
 */
export function pickScore(
  live: boolean,
  lfa: number | null | undefined,
  betman: number | null | undefined
): number | null {
  const l = typeof lfa === "number" ? lfa : null
  const b = typeof betman === "number" ? betman : null
  // 라이브면 산 피드만 믿는다. 산 피드가 아직 없으면 **비워 둔다** —
  // 낡은 값을 실시간인 척 보여주는 것이 이 사고의 본질이었다.
  if (live) return l
  return b ?? l
}

/**
 * 매치 페이지 제목(·og:title)의 스코어 — 본문과 같은 우선순위(pickScore) (2026-09-03).
 *
 * 종전엔 betman 스코어만 읽어서, betman 발표(FT 후 1~2시간)까지 제목이 "밀월 vs 렉섬" 이었다 —
 * 그 사이 공유된 링크 미리보기에 스코어가 없었다. 본문은 이미 LFA 확정 스코어를 보여주고 있었다.
 * 반환은 제목 조립용 구분자 포함: " 0:3 " 또는 " vs ".
 */
export function matchTitleScore(input: {
  betmanStatus: string
  betmanHome: number | null
  betmanAway: number | null
  lfa: {
    finished: boolean
    live: boolean
    homeScore: number | null
    awayScore: number | null
  } | null
}): string {
  const finished = input.betmanStatus === "completed" || input.lfa?.finished === true
  const live = !finished && input.lfa?.live === true
  const home = pickScore(live, input.lfa?.homeScore, input.betmanHome)
  const away = pickScore(live, input.lfa?.awayScore, input.betmanAway)
  return home != null && away != null ? ` ${home}:${away} ` : " vs "
}

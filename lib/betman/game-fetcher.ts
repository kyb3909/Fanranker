/**
 * betman.co.kr 경기 목록 조회 + 파싱
 *
 * protoGames에서 gmTs 목록 추출 → gameInfoInq로 경기 상세 가져와 파싱.
 */

import { BETMAN_BASE, BROWSER_HEADERS, GM_ID, fetchWithRetry } from "./http-client"

export const SPORT_MAP: Record<string, string> = {
  SC: "축구",
  BK: "농구",
  VL: "배구",
  BS: "야구",
}

export const TYPE_MAP: Record<string, string> = {
  "0": "일반",
  "2": "핸디캡",
  "5": "SUM",
  "9": "언더오버",
  "12": "핸디캡",
  "14": "일반",
}

export interface BetmanGame {
  round_id: string
  game_no: number
  match_time: string | null
  sport: string
  league_code: string
  game_type: string
  home_team_name: string
  away_team_name: string
  venue: string | null
  status: string
  handicap: number | null
  over_under_line: number | null
  home_win_odds: number | null
  draw_odds: number | null
  away_win_odds: number | null
  over_odds: number | null
  under_odds: number | null
  odd_odds: number | null
  even_odds: number | null
}

/**
 * 현재 구매 가능한 모든 gmTs(회차) 목록 조회.
 * betman이 해외 IP를 차단하므로 Vercel에서는 보통 빈 배열 반환.
 */
export async function fetchAllGmTs(): Promise<string[]> {
  try {
    const resp = await fetchWithRetry(`${BETMAN_BASE}/buyPsblGame/inqBuyAbleGameInfoList.do`, {
      method: "POST",
      headers: {
        ...BROWSER_HEADERS,
        "Content-Type": "application/json;charset=UTF-8",
        Referer: `${BETMAN_BASE}/main/mainPage/gamebuy/buyableGameList.do`,
      },
      body: JSON.stringify({ _sbmInfo: { _sbmInfo: { debugMode: "false" } } }),
    })
    const data = await resp.json()
    const protoGames = data?.protoGames || []
    const gmTsList: string[] = []
    for (const g of protoGames) {
      if (g.gmId === GM_ID && g.gmTs) {
        gmTsList.push(String(g.gmTs))
      }
    }
    return gmTsList
  } catch {
    return []
  }
}

/**
 * 특정 gmTs(회차)의 경기 상세 배열 조회.
 * compSchedules.datas 배열의 각 row는 positional tuple 형식.
 */
export async function fetchGameData(gmTs: string): Promise<unknown[] | null> {
  try {
    // 세션 확보용 사전 호출 (실패 무시)
    await fetch(`${BETMAN_BASE}/main/mainPage/gamebuy/gameSlip.do?gmId=${GM_ID}&gmTs=${gmTs}`, {
      headers: { "User-Agent": BROWSER_HEADERS["User-Agent"] },
      redirect: "follow",
    }).catch(() => {})

    const resp = await fetchWithRetry(`${BETMAN_BASE}/buyPsblGame/gameInfoInq.do`, {
      method: "POST",
      headers: {
        ...BROWSER_HEADERS,
        "Content-Type": "application/json;charset=UTF-8",
        Referer: `${BETMAN_BASE}/main/mainPage/gamebuy/gameSlip.do?gmId=${GM_ID}&gmTs=${gmTs}`,
      },
      body: JSON.stringify({
        gmId: GM_ID,
        gmTs: Number(gmTs),
        gameYear: "",
        _sbmInfo: { _sbmInfo: { debugMode: "false" } },
      }),
    })
    const data = await resp.json()
    return data?.compSchedules?.datas || null
  } catch {
    return null
  }
}

/**
 * 배당이 0이 아닌 경기만 추려서 BetmanGame 배열로 정규화.
 * datas 각 row의 positional index는 betman API 계약 — 변경 시 전 로직 영향.
 */
export function parseGames(datas: unknown[], roundId: string): BetmanGame[] {
  return (datas as unknown[][])
    .filter(
      (d) =>
        ((d[16] as number) || 0) !== 0 ||
        ((d[17] as number) || 0) !== 0 ||
        ((d[18] as number) || 0) !== 0
    )
    .map((d) => {
      const sportCode = (d[0] as string) || ""
      const sport = SPORT_MAP[sportCode] || sportCode || "축구"
      const gameTypeCode = String(d[19] ?? "0")
      const gameType = TYPE_MAP[gameTypeCode] || "일반"
      const matchTimeMs = d[3] as number | null
      const matchTime = matchTimeMs ? new Date(matchTimeMs).toISOString() : null

      const isNormalOrHandicap = gameType === "일반" || gameType === "핸디캡"
      const isUnderOver = gameType === "언더오버"
      const isSum = gameType === "SUM"

      return {
        round_id: roundId,
        game_no: (d[11] as number) || 0,
        match_time: matchTime,
        sport,
        league_code: (d[7] as string) || "",
        game_type: gameType,
        home_team_name: (d[14] as string) || "",
        away_team_name: (d[15] as string) || "",
        venue: (d[10] as string) || null,
        status: "scheduled",
        handicap: gameType === "핸디캡" && d[20] ? (d[20] as number) : null,
        over_under_line: isUnderOver && d[20] ? (d[20] as number) : null,
        home_win_odds: isNormalOrHandicap && (d[16] as number) > 0 ? (d[16] as number) : null,
        draw_odds: isNormalOrHandicap && (d[17] as number) > 0 ? (d[17] as number) : null,
        away_win_odds: isNormalOrHandicap && (d[18] as number) > 0 ? (d[18] as number) : null,
        over_odds: isUnderOver && (d[18] as number) > 0 ? (d[18] as number) : null,
        under_odds: isUnderOver && (d[16] as number) > 0 ? (d[16] as number) : null,
        odd_odds: isSum && (d[16] as number) > 0 ? (d[16] as number) : null,
        even_odds: isSum && (d[18] as number) > 0 ? (d[18] as number) : null,
      }
    })
}

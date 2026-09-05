/**
 * betman.co.kr 경기 목록 조회 + 파싱 (2026-04 사이트 개편 대응)
 *
 * 새 API 응답 구조:
 *   compSchedules.keys  — 52개 컬럼명 배열 (self-describing!)
 *   compSchedules.datas — 각 row 는 positional tuple. keys 로 인덱싱.
 *
 * 이전 하드코딩 index 파서는 betman이 컬럼을 추가하면서 전부 shift 되어 깨짐.
 * keys 배열을 매번 재해석하는 방식으로 바꿔 컬럼 추가·재배열에 강함.
 */

import { BETMAN_BASE, BROWSER_HEADERS, GM_ID, fetchWithRetry } from "./http-client"

const SPORT_MAP: Record<string, string> = {
  SC: "축구",
  BK: "농구",
  VL: "배구",
  BS: "야구",
}

/**
 * betTypId → DB `game_type` 매핑 (2026-04 개편 이후).
 *
 *  1 = 승무패 (축구, 무승부 있음)        → 일반
 *  2 = 승패   (야구/농구/배구, 무승부 없음) → 일반
 *  3 = 승N패  (예: "야구 승1패")         → 스킵 — 기존 DB 스키마에 담을 컬럼 없음
 *  4 = 핸디캡 (무승부 있음, 축구)         → 핸디캡
 *  5 = 핸디캡 (무승부 없음, 야구 등)      → 핸디캡
 *  7 = 언더오버                          → 언더오버
 *  9 = SUM (홀짝)                        → SUM
 */
const BET_TYPE_MAP: Record<string, "일반" | "핸디캡" | "언더오버" | "SUM"> = {
  "1": "일반",
  "2": "일반",
  "4": "핸디캡",
  "5": "핸디캡",
  "7": "언더오버",
  "9": "SUM",
}

export interface BetmanGameData {
  datas: unknown[][]
  keys: string[]
}

interface BetmanGame {
  round_id: string
  game_no: number
  match_time: string | null
  sport: string
  league_code: string
  game_type: string
  home_team_name: string
  away_team_name: string
  venue: string | null
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
async function fetchAllGmTs(): Promise<string[]> {
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
 * 특정 gmTs(회차)의 경기 상세 조회.
 * 반환: { datas, keys } — parseGames 에 그대로 전달.
 */
export async function fetchGameData(gmTs: string): Promise<BetmanGameData | null> {
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
    const cs = data?.compSchedules
    if (!cs || !Array.isArray(cs.datas) || !Array.isArray(cs.keys)) return null
    return { datas: cs.datas, keys: cs.keys }
  } catch {
    return null
  }
}

/** keys 배열에서 필수 컬럼 index 를 뽑는다. 하나라도 없으면 null. */
function buildIndexMap(keys: string[]): Record<string, number> | null {
  const required = [
    "itemCode",
    "gameDate",
    "leagueCode",
    "leagueShortName",
    "meetStadiumFullName",
    "matchSeq",
    "homeName",
    "awayName",
    "winAllot",
    "drawAllot",
    "loseAllot",
    "winHandi",
    "betTypId",
  ] as const

  const idx: Record<string, number> = {}
  for (const k of required) {
    const i = keys.indexOf(k)
    if (i < 0) {
      console.error(`[betman] parseGames: missing key '${k}' (API schema drift)`)
      return null
    }
    idx[k] = i
  }
  return idx
}

/**
 * 배당이 0이 아닌 경기만 추려서 BetmanGame 배열로 정규화.
 * `승N패` (betTypId=3) 등 미지원 타입은 스킵하지만, 무엇이 들어오는지
 * 식별하기 위해 한 번씩 sample 을 stderr 로 로깅한다 (운영자 검토 후
 * BET_TYPE_MAP 확장을 결정).
 */
export function parseGames(data: BetmanGameData, roundId: string): BetmanGame[] {
  const idx = buildIndexMap(data.keys)
  if (!idx) return []

  const unknownStats = new Map<string, { count: number; sample?: Record<string, unknown> }>()

  const out: BetmanGame[] = []
  for (const d of data.datas) {
    const winAllot = (d[idx.winAllot] as number) || 0
    const drawAllot = (d[idx.drawAllot] as number) || 0
    const loseAllot = (d[idx.loseAllot] as number) || 0
    if (winAllot === 0 && drawAllot === 0 && loseAllot === 0) continue

    const betTypId = String(d[idx.betTypId] ?? "")
    const gameType = BET_TYPE_MAP[betTypId]
    if (!gameType) {
      // 미지원 betTypId 통계 수집 — 첫 sample 한 건만 모든 컬럼 key=value 로 보존.
      const stat = unknownStats.get(betTypId) ?? { count: 0 }
      stat.count++
      if (!stat.sample) {
        stat.sample = Object.fromEntries(data.keys.map((k, i) => [k, d[i]]))
      }
      unknownStats.set(betTypId, stat)
      continue
    }

    const sportCode = (d[idx.itemCode] as string) || ""
    const sport = SPORT_MAP[sportCode] || sportCode || "축구"
    const matchTimeMs = d[idx.gameDate] as number | null
    const matchTime = matchTimeMs ? new Date(matchTimeMs).toISOString() : null
    const winHandi = (d[idx.winHandi] as number) || 0

    const isNormalOrHandicap = gameType === "일반" || gameType === "핸디캡"
    const isUnderOver = gameType === "언더오버"
    const isSum = gameType === "SUM"

    out.push({
      round_id: roundId,
      game_no: (d[idx.matchSeq] as number) || 0,
      match_time: matchTime,
      sport,
      // UI 에 보여지는 값 — NBA / KBO / EPL / 라리가 / K리그1 스타일.
      // 내부 ID (BK002 등) 는 leagueCode 에 있지만 DB 는 display name 을 저장.
      league_code: (d[idx.leagueShortName] as string) || (d[idx.leagueCode] as string) || "",
      game_type: gameType,
      home_team_name: (d[idx.homeName] as string) || "",
      away_team_name: (d[idx.awayName] as string) || "",
      venue: (d[idx.meetStadiumFullName] as string) || null,
      // 핸디캡: 홈팀 기준 spread (winHandi 가 음수면 홈 -N, 양수면 홈 +N)
      handicap: gameType === "핸디캡" ? winHandi : null,
      // 언더오버: winHandi == loseHandi == 기준선 (양쪽 동일)
      over_under_line: isUnderOver ? winHandi : null,
      home_win_odds: isNormalOrHandicap && winAllot > 0 ? winAllot : null,
      draw_odds: isNormalOrHandicap && drawAllot > 0 ? drawAllot : null,
      away_win_odds: isNormalOrHandicap && loseAllot > 0 ? loseAllot : null,
      // 언오버 컨벤션: winTxt="언더"·loseTxt="오버"
      over_odds: isUnderOver && loseAllot > 0 ? loseAllot : null,
      under_odds: isUnderOver && winAllot > 0 ? winAllot : null,
      // SUM 컨벤션: winTxt="홀"·loseTxt="짝"
      odd_odds: isSum && winAllot > 0 ? winAllot : null,
      even_odds: isSum && loseAllot > 0 ? loseAllot : null,
    })
  }

  // 미지원 betTypId 발견 시 운영 로그 1회 dump.
  // 운영자가 sample 의 컬럼을 보고 신규 베팅 유형(전반전 등)을 식별 → BET_TYPE_MAP 확장.
  if (unknownStats.size > 0) {
    console.warn(
      `[betman] [UNKNOWN_BET_TYPE] ⚠️ 미지원 betTypId ${unknownStats.size}종 감지 (skip 됨)`
    )
    for (const [code, stat] of unknownStats) {
      console.warn(`[betman] [UNKNOWN_BET_TYPE] betTypId="${code}" count=${stat.count}`)
      console.warn(`[betman] [UNKNOWN_BET_TYPE] sample=${JSON.stringify(stat.sample)}`)
    }
  }

  return out
}

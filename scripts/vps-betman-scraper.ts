#!/usr/bin/env node
/**
 * VPS Betman Scraper v2
 *
 * 한국 VPS에서 실행되는 betman.co.kr 스크래퍼.
 * betman API → 서비스 API → Supabase DB 순서로 동기화.
 *
 * v2 개선사항:
 * - sync_state 업데이트 (watchdog과 연동)
 * - 다음 gmTs 프로빙 (+1 ~ +5) → 새 회차 자동 감지
 * - 재시도 로직 (exponential backoff)
 * - 헬스 리포팅 및 에러 추적
 * - resync 플래그 확인 (watchdog이 요청한 urgent resync 처리)
 *
 * 환경 변수:
 *   API_BASE_URL - 서비스 API 주소 (예: https://community-app-brown.vercel.app)
 *   CRON_SECRET  - API 인증 토큰
 *
 * 사용법:
 *   API_BASE_URL=https://your-domain.vercel.app CRON_SECRET=xxx npx tsx scripts/vps-betman-scraper.ts
 */

const BETMAN_BASE = "https://www.betman.co.kr"
const GM_ID = "G101" // 프로토 승부식

const API_BASE_URL = process.env.API_BASE_URL
const CRON_SECRET = process.env.CRON_SECRET

const SPORT_MAP: Record<string, string> = {
  SC: "축구",
  BK: "농구",
  VL: "배구",
  BS: "야구",
}
const TYPE_MAP: Record<string, string> = {
  "0": "일반",
  "2": "핸디캡",
  "5": "SUM",
  "9": "언더오버",
  "12": "핸디캡",
  "14": "일반",
}

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "X-Requested-With": "XMLHttpRequest",
  Origin: BETMAN_BASE,
}

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] [vps-scraper] ${msg}`)
}

function logError(msg: string, err?: unknown) {
  console.error(`[${new Date().toISOString()}] [vps-scraper] ERROR: ${msg}`, err || "")
}

// --- Retry helper ---
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)
      const resp = await fetch(url, { ...options, signal: controller.signal })
      clearTimeout(timeoutId)
      if (resp.ok) return resp
      if (resp.status >= 400 && resp.status < 500) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`)
      }
      lastError = new Error(`HTTP ${resp.status}`)
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
    }
    if (attempt < maxRetries - 1) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 8000) + Math.random() * 500
      log(`  재시도 ${attempt + 1}/${maxRetries - 1}, ${Math.round(delay)}ms 대기...`)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastError || new Error("fetch failed after retries")
}

// --- 1. 구매 가능 gmTs 목록 조회 ---
async function fetchAvailableGmTs(): Promise<string[]> {
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
}

// --- 2. 특정 gmTs의 경기 데이터 조회 ---
interface RawGameData {
  datas: unknown[][]
  keys: string[]
}

async function fetchGameData(gmTs: string): Promise<RawGameData | null> {
  // 쿠키 초기화 요청
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
  return { datas: cs.datas as unknown[][], keys: cs.keys as string[] }
}

// --- 3. 게임 데이터 파싱 ---
interface ParsedGame {
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

interface UnknownGameSample {
  source: "game"
  bet_typ_id: string
  game_no: number | null
  sport: string | null
  league_code: string | null
  home_team_name: string | null
  away_team_name: string | null
  match_time: string | null
  raw_data: Record<string, unknown>
}

function parseGames(
  datas: unknown[][],
  keys?: string[]
): { games: ParsedGame[]; unknowns: UnknownGameSample[] } {
  // 미지원 game type 코드 추적 — 새 베팅 유형(전반전 등)을 식별하기 위한 ops 로그.
  // betman 이 새 betTypId / handi 코드를 추가하면 여기에 누적되어 sync.log 로 노출됨.
  const unknownStats = new Map<string, { count: number; sample?: Record<string, unknown> }>()
  const unknowns: UnknownGameSample[] = []

  const result = datas
    .filter(
      (d) =>
        ((d[16] as number) || 0) !== 0 ||
        ((d[17] as number) || 0) !== 0 ||
        ((d[18] as number) || 0) !== 0
    )
    .flatMap<ParsedGame>((d) => {
      const sportCode = (d[0] as string) || ""
      const sport = SPORT_MAP[sportCode] || sportCode || "축구"
      const gameTypeCode = String(d[19] ?? "0")
      const supported = TYPE_MAP[gameTypeCode]

      // 미지원 코드는 main 테이블에 넣지 않음 (잘못 분류된 "일반" row 가 UI 에 떠서 정산 오류로
      // 이어지는 것 방지). 대신 sample 을 캡처해 로그에 dump + betman_unknown_games 테이블에
      // 보존 → 운영자가 신규 베팅 유형(전반전 등) 식별용으로 분석.
      if (!supported) {
        const stat = unknownStats.get(gameTypeCode) ?? { count: 0 }
        stat.count++
        const rawDump = keys
          ? Object.fromEntries(keys.map((k, i) => [k, d[i]]))
          : Object.fromEntries(d.map((v, i) => [`d[${i}]`, v]))
        if (!stat.sample) stat.sample = rawDump
        unknownStats.set(gameTypeCode, stat)

        const matchTimeMs = d[3] as number | null
        unknowns.push({
          source: "game",
          bet_typ_id: gameTypeCode,
          game_no: (d[11] as number) || null,
          sport,
          league_code: (d[7] as string) || null,
          home_team_name: (d[14] as string) || null,
          away_team_name: (d[15] as string) || null,
          match_time: matchTimeMs ? new Date(matchTimeMs).toISOString() : null,
          raw_data: rawDump,
        })
        return []
      }
      const gameType = supported

      const matchTimeMs = d[3] as number | null
      const matchTime = matchTimeMs ? new Date(matchTimeMs).toISOString() : null

      const isNormalOrHandicap = gameType === "일반" || gameType === "핸디캡"
      const isUnderOver = gameType === "언더오버"
      const isSum = gameType === "SUM"

      return [
        {
          game_no: (d[11] as number) || 0,
          match_time: matchTime,
          sport,
          league_code: (d[7] as string) || "",
          game_type: gameType,
          home_team_name: (d[14] as string) || "",
          away_team_name: (d[15] as string) || "",
          venue: (d[10] as string) || null,
          handicap: gameType === "핸디캡" && d[20] ? (d[20] as number) : null,
          over_under_line: isUnderOver && d[20] ? (d[20] as number) : null,
          home_win_odds: isNormalOrHandicap && (d[16] as number) > 0 ? (d[16] as number) : null,
          draw_odds: isNormalOrHandicap && (d[17] as number) > 0 ? (d[17] as number) : null,
          away_win_odds: isNormalOrHandicap && (d[18] as number) > 0 ? (d[18] as number) : null,
          over_odds: isUnderOver && (d[18] as number) > 0 ? (d[18] as number) : null,
          under_odds: isUnderOver && (d[16] as number) > 0 ? (d[16] as number) : null,
          odd_odds: isSum && (d[16] as number) > 0 ? (d[16] as number) : null,
          even_odds: isSum && (d[18] as number) > 0 ? (d[18] as number) : null,
        },
      ]
    })

  // 미지원 코드 발견 시 1회 요약 + 첫 sample 풀 컬럼 dump.
  // grep 패턴: "[UNKNOWN_GAME_TYPE]" — sync.log 에서 추적 후 BET_TYPE_MAP 확장 결정.
  // raw row 자체는 unknowns 배열로 caller 에 전달되어 betman_unknown_games 테이블로 적재됨.
  if (unknownStats.size > 0) {
    log(
      `[UNKNOWN_GAME_TYPE] ⚠️ 미지원 코드 ${unknownStats.size}종 감지 (raw ${unknowns.length}건 캡처)`
    )
    for (const [code, stat] of unknownStats) {
      log(`[UNKNOWN_GAME_TYPE] code="${code}" count=${stat.count}`)
      log(`[UNKNOWN_GAME_TYPE] sample=${JSON.stringify(stat.sample)}`)
    }
  }

  return { games: result, unknowns }
}

// --- 4. API 호출: 라운드 생성 ---
async function ensureRound(gmTs: string): Promise<string> {
  const resp = await fetchWithRetry(`${API_BASE_URL}/api/betman/round`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CRON_SECRET}`,
    },
    body: JSON.stringify({ gmTs }),
  })

  const data = await resp.json()
  return data.roundId
}

// --- 5. API 호출: 게임 업서트 ---
async function sendGames(roundId: string, games: ParsedGame[]): Promise<number> {
  const resp = await fetchWithRetry(`${API_BASE_URL}/api/betman/games`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CRON_SECRET}`,
    },
    body: JSON.stringify({ roundId, games }),
  })

  const data = await resp.json()
  return data.count || games.length
}

// --- 6. sync_state 업데이트 ---
async function updateSyncState(data: {
  latestGmTs?: string
  activeRounds?: string[]
  lastSyncAction: string
  lastSyncGamesCount: number
  lastError?: string | null
}): Promise<void> {
  try {
    await fetchWithRetry(`${API_BASE_URL}/api/betman/sync-state`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CRON_SECRET}`,
      },
      body: JSON.stringify(data),
    })
  } catch (e) {
    logError("sync_state 업데이트 실패:", e)
  }
}

// --- 7. sync_state에서 resync 요청 확인 ---
async function checkResyncRequest(): Promise<{
  needsResync: boolean
  probeRangeStart?: string
  probeRangeEnd?: string
}> {
  try {
    const resp = await fetchWithRetry(`${API_BASE_URL}/api/betman/sync-state`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${CRON_SECRET}`,
      },
    })
    const data = await resp.json()

    // last_error에 JSON resync 플래그가 있는지 확인
    if (data.lastError) {
      try {
        const flag = JSON.parse(data.lastError)
        if (flag.needs_resync) {
          return {
            needsResync: true,
            probeRangeStart: flag.probe_range_start,
            probeRangeEnd: flag.probe_range_end,
          }
        }
      } catch {
        // JSON이 아니면 일반 에러 메시지
      }
    }
    return { needsResync: false }
  } catch {
    return { needsResync: false }
  }
}

// --- 8. 다음 gmTs 프로빙 (새 회차 자동 감지) ---
interface PendingResultRound {
  gmTs: string
  missingGames: number
}

async function fetchPendingResultGmTs(): Promise<string[]> {
  try {
    const resp = await fetchWithRetry(
      `${API_BASE_URL}/api/betman/pending-results?limit=30&days=45`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${CRON_SECRET}`,
        },
      }
    )

    const data = await resp.json()
    const items = Array.isArray(data?.items) ? (data.items as PendingResultRound[]) : []
    return [...new Set(items.map((item) => String(item.gmTs)).filter(Boolean))]
  } catch (e) {
    logError("pending-results lookup failed:", e)
    return []
  }
}
async function probeNextGmTs(knownGmTsList: string[]): Promise<string[]> {
  if (knownGmTsList.length === 0) return []

  const maxKnown = Math.max(...knownGmTsList.map((s) => parseInt(s, 10)))
  if (isNaN(maxKnown)) return []

  const discovered: string[] = []

  for (let i = 1; i <= 5; i++) {
    const candidate = String(maxKnown + i)
    if (knownGmTsList.includes(candidate)) continue

    try {
      const raw = await fetchGameData(candidate)
      if (raw && raw.datas.length > 0) {
        discovered.push(candidate)
        log(`  프로빙 성공: gmTs ${candidate} (${raw.datas.length}개 raw data)`)
      }
    } catch {
      // 프로빙 실패 → 해당 gmTs 없음, 정상
    }
  }

  return discovered
}

// --- 9. 경기 결과 수집 (winrstDetl API) ---

const RESULT_HANDI_MAP: Record<number, string> = {
  0: "일반",
  2: "핸디캡",
  5: "SUM",
  6: "S핸디캡",
  7: "S언더오버",
  9: "언더오버",
  14: "일반",
}

function mapGameResult(
  rawGameResult: string | number,
  gameType: string
): { result: string; status: string } {
  const gameResult = String(rawGameResult)
  if (gameResult === "4") return { result: "cancelled", status: "cancelled" }
  if (gameType === "일반" || gameType === "핸디캡" || gameType === "S핸디캡") {
    if (gameResult === "0") return { result: "home", status: "completed" }
    if (gameResult === "1") return { result: "draw", status: "completed" }
    if (gameResult === "2") return { result: "away", status: "completed" }
  } else if (gameType === "언더오버" || gameType === "S언더오버") {
    if (gameResult === "0") return { result: "under", status: "completed" }
    if (gameResult === "2") return { result: "over", status: "completed" }
  } else if (gameType === "SUM") {
    if (gameResult === "0") return { result: "odd", status: "completed" }
    if (gameResult === "2") return { result: "even", status: "completed" }
  }
  return { result: "", status: "completed" }
}

function parseScoreStr(mchScore: string): { home: number; away: number } | null {
  if (!mchScore || !mchScore.includes(":")) return null
  const [h, a] = mchScore.split(":").map(Number)
  if (isNaN(h) || isNaN(a)) return null
  if (!Number.isInteger(h) || !Number.isInteger(a)) return null
  return { home: h, away: a }
}

interface ResultItem {
  GAME_RESULT: string
  GM_SEQ: number
  MCH_SCORE: string
  HANDI_VAL: number
  HOME_TEAM: string
  AWAY_TEAM: string
  FIX_MCH_DTM?: string
}

function buildMatchKey(item: Pick<ResultItem, "HOME_TEAM" | "AWAY_TEAM" | "FIX_MCH_DTM">): string {
  const base = `${item.HOME_TEAM.trim()}|${item.AWAY_TEAM.trim()}`
  return item.FIX_MCH_DTM ? `${base}|${item.FIX_MCH_DTM}` : base
}

async function fetchResultsForGmTs(gmTs: string): Promise<ResultItem[] | null> {
  try {
    await fetch(`${BETMAN_BASE}/main/mainPage/gamebuy/winrstDetl.do?gmId=${GM_ID}&gmTs=${gmTs}`, {
      headers: { "User-Agent": BROWSER_HEADERS["User-Agent"] },
      redirect: "follow",
    }).catch(() => {})

    const resp = await fetchWithRetry(`${BETMAN_BASE}/gamebuy/winrst/inqWinrstDetlBody.do`, {
      method: "POST",
      headers: {
        ...BROWSER_HEADERS,
        "Content-Type": "application/json;charset=UTF-8",
        Referer: `${BETMAN_BASE}/main/mainPage/gamebuy/winrstDetl.do?gmId=${GM_ID}&gmTs=${gmTs}`,
      },
      body: JSON.stringify({
        gmId: GM_ID,
        gmTs: Number(gmTs),
        _sbmInfo: { _sbmInfo: { debugMode: "false" } },
      }),
    })

    const data = await resp.json()
    const items = data?.detlBody
    if (!Array.isArray(items) || items.length === 0) return null
    return items as ResultItem[]
  } catch (e) {
    logError(`결과 조회 실패 (gmTs=${gmTs}):`, e)
    return null
  }
}

interface UnknownResultSample {
  source: "result"
  handi_val: number
  game_no: number | null
  game_result: string | null
  mch_score: string | null
  home_score: number | null
  away_score: number | null
  home_team_name: string | null
  away_team_name: string | null
  match_time: string | null
  raw_data: Record<string, unknown>
}

async function sendResultsToApi(
  gmTs: string,
  resultItems: ResultItem[]
): Promise<{ updated: number; cancelled: number; unknowns: UnknownResultSample[] }> {
  const actualScoreMap = new Map<string, { home: number; away: number }>()
  for (const item of resultItems) {
    const gameType = RESULT_HANDI_MAP[item.HANDI_VAL] ?? "일반"
    if (gameType === "일반") {
      const score = parseScoreStr(item.MCH_SCORE)
      if (score) {
        actualScoreMap.set(buildMatchKey(item), score)
      }
    }
  }

  const results: Array<{
    game_no: number
    home_score: number | null
    away_score: number | null
    result: string
    status: string
  }> = []

  // RESULT_HANDI_MAP 에 없는 HANDI_VAL 또는 매핑 실패한 GAME_RESULT 를 raw 로 캡처.
  // 정산엔 영향 없음 (지원되는 game_no 만 results 배열에 들어감).
  const unknowns: UnknownResultSample[] = []

  for (const item of resultItems) {
    const handiKnown = RESULT_HANDI_MAP[item.HANDI_VAL] !== undefined
    const gameType = RESULT_HANDI_MAP[item.HANDI_VAL] ?? "일반"
    let mapped = mapGameResult(item.GAME_RESULT, gameType)

    let homeScore: number | null = null
    let awayScore: number | null = null

    if (gameType === "일반") {
      const score = parseScoreStr(item.MCH_SCORE)
      if (score) {
        homeScore = score.home
        awayScore = score.away
      }
    } else {
      const key = buildMatchKey(item)
      const actual = actualScoreMap.get(key)
      if (actual) {
        homeScore = actual.home
        awayScore = actual.away
      } else {
        const fallback = parseScoreStr(item.MCH_SCORE)
        if (fallback) {
          homeScore = fallback.home
          awayScore = fallback.away
        }
      }
    }

    // Score fallback when GAME_RESULT is missing.
    if (
      mapped.result === "" &&
      mapped.status === "completed" &&
      homeScore !== null &&
      awayScore !== null
    ) {
      const total = homeScore + awayScore
      if (gameType === "SUM") {
        mapped = { result: total % 2 === 0 ? "even" : "odd", status: "completed" }
      } else if (
        gameType === "\uC5B8\uB354\uC624\uBC84" ||
        gameType === "S\uC5B8\uB354\uC624\uBC84"
      ) {
        // Under/Over requires a line value; server API handles second-stage derivation.
      }
    }

    // 미지원 HANDI_VAL 또는 매핑 실패한 GAME_RESULT 는 raw 보관 (정산엔 진입 안 함).
    if (!handiKnown || (mapped.result === "" && mapped.status === "completed")) {
      unknowns.push({
        source: "result",
        handi_val: item.HANDI_VAL,
        game_no: item.GM_SEQ ?? null,
        game_result: item.GAME_RESULT ?? null,
        mch_score: item.MCH_SCORE ?? null,
        home_score: homeScore,
        away_score: awayScore,
        home_team_name: item.HOME_TEAM ?? null,
        away_team_name: item.AWAY_TEAM ?? null,
        match_time: item.FIX_MCH_DTM ?? null,
        raw_data: item as unknown as Record<string, unknown>,
      })
    }

    if (mapped.result === "" && mapped.status === "completed") continue
    results.push({
      game_no: item.GM_SEQ,
      home_score: homeScore,
      away_score: awayScore,
      result: mapped.result,
      status: mapped.status,
    })
  }

  if (results.length === 0) return { updated: 0, cancelled: 0, unknowns }

  const resp = await fetchWithRetry(`${API_BASE_URL}/api/betman/results`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CRON_SECRET}`,
    },
    body: JSON.stringify({ gmTs, results }),
  })

  const data = await resp.json()
  return { updated: data.updated || 0, cancelled: data.cancelled || 0, unknowns }
}

/**
 * BET_TYPE_MAP / RESULT_HANDI_MAP 에 없는 raw row 들을 betman_unknown_games 테이블에 보관.
 * 정산/UI 와 무관 — 운영자가 신규 베팅 유형(전반전 등) 분석용.
 */
async function sendUnknownsToApi(
  gmTs: string,
  unknowns: Array<UnknownGameSample | UnknownResultSample>
): Promise<void> {
  if (unknowns.length === 0) return

  const items = unknowns.map((u) => ({ ...u, gm_ts: gmTs }))

  try {
    const resp = await fetchWithRetry(`${API_BASE_URL}/api/betman/unknown-games`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CRON_SECRET}`,
      },
      body: JSON.stringify({ items }),
    })
    const data = await resp.json()
    log(`  미지원 raw 저장: ${data.message ?? `${unknowns.length}건`}`)
  } catch (e) {
    logError(`  미지원 raw 저장 실패 (gmTs=${gmTs}):`, e)
  }
}

// --- 메인 실행 ---
async function main() {
  if (!API_BASE_URL || !CRON_SECRET) {
    logError("환경 변수가 설정되지 않았습니다: API_BASE_URL, CRON_SECRET")
    process.exit(1)
  }

  const startTime = Date.now()
  log(`=== 동기화 시작 === API: ${API_BASE_URL}`)

  const syncErrors: string[] = []
  let totalGames = 0
  const allProcessedGmTs: string[] = []

  try {
    // Phase 1: Watchdog resync 요청 확인
    const resyncReq = await checkResyncRequest()
    if (resyncReq.needsResync) {
      log(
        `⚠️  Watchdog resync 요청 감지! 범위: ${resyncReq.probeRangeStart} ~ ${resyncReq.probeRangeEnd}`
      )
    }

    // Phase 2: 구매 가능 gmTs 조회
    let gmTsList: string[] = []
    try {
      gmTsList = await fetchAvailableGmTs()
      log(`구매 가능 gmTs: ${gmTsList.length > 0 ? gmTsList.join(", ") : "없음"}`)
    } catch (e) {
      logError("gmTs 목록 조회 실패:", e)
      syncErrors.push(`gmTs 목록 조회 실패: ${(e as Error).message}`)
    }

    // Phase 3: 다음 gmTs 프로빙 (새 회차 자동 감지)
    if (gmTsList.length > 0) {
      log("다음 회차 프로빙 시작...")
      const probed = await probeNextGmTs(gmTsList)
      if (probed.length > 0) {
        gmTsList = [...gmTsList, ...probed]
        log(`프로빙으로 추가 발견: ${probed.join(", ")}`)
      } else {
        log("추가 회차 없음")
      }
    }

    // Phase 3b: resync 요청의 프로빙 범위도 시도
    if (resyncReq.needsResync && resyncReq.probeRangeStart) {
      const start = parseInt(resyncReq.probeRangeStart, 10)
      const end = parseInt(resyncReq.probeRangeEnd || resyncReq.probeRangeStart, 10)
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) {
          const candidate = String(i)
          if (!gmTsList.includes(candidate)) {
            try {
              const raw = await fetchGameData(candidate)
              if (raw && raw.datas.length > 0) {
                gmTsList.push(candidate)
                log(`  resync 프로빙 성공: gmTs ${candidate}`)
              }
            } catch {
              // 프로빙 실패, 정상
            }
          }
        }
      }
    }

    if (gmTsList.length === 0) {
      log("동기화할 gmTs가 없습니다.")
      await updateSyncState({
        lastSyncAction: "checked",
        lastSyncGamesCount: 0,
        lastError: null,
      })
      return
    }

    // Phase 4: 각 gmTs 동기화
    for (const gmTs of gmTsList) {
      try {
        log(`--- gmTs ${gmTs} 동기화 ---`)

        // 4a. 게임 데이터 크롤링
        const raw = await fetchGameData(gmTs)
        if (!raw || raw.datas.length === 0) {
          log(`  데이터 없음, 스킵`)
          allProcessedGmTs.push(gmTs)
          continue
        }

        // 4b. 파싱
        const { games, unknowns } = parseGames(raw.datas, raw.keys)
        log(`  파싱: ${games.length}건 (raw: ${raw.datas.length}건, 미지원 ${unknowns.length}건)`)

        // 4b-1. 미지원 게임 유형 raw 보관 (정산엔 진입 안 함)
        if (unknowns.length > 0) {
          await sendUnknownsToApi(gmTs, unknowns)
        }

        if (games.length === 0) {
          log(`  유효 게임 없음 (배당률 0), 스킵`)
          allProcessedGmTs.push(gmTs)
          continue
        }

        // 4c. 라운드 생성/조회
        const roundId = await ensureRound(gmTs)
        log(`  roundId: ${roundId}`)

        // 4d. 게임 전송
        const count = await sendGames(roundId, games)
        log(`  전송 완료: ${count}건`)
        totalGames += count
        allProcessedGmTs.push(gmTs)
      } catch (err) {
        const errMsg = `gmTs ${gmTs}: ${(err as Error).message}`
        logError(errMsg)
        syncErrors.push(errMsg)
      }
    }

    // Phase 5: 경기 결과 수집 (완료된 라운드)
    let totalResultsUpdated = 0
    let totalResultsCancelled = 0

    const pendingResultGmTs = await fetchPendingResultGmTs()
    if (pendingResultGmTs.length > 0) {
      log("pending result rounds: " + pendingResultGmTs.join(", "))
    }

    const allGmTsForResults = [...new Set([...allProcessedGmTs, ...gmTsList, ...pendingResultGmTs])]
    for (const gmTs of allGmTsForResults) {
      try {
        const items = await fetchResultsForGmTs(gmTs)
        if (!items || items.length === 0) continue

        log(`결과 수집: gmTs=${gmTs} → ${items.length}건 원시 데이터`)
        const { updated, cancelled, unknowns } = await sendResultsToApi(gmTs, items)
        if (updated > 0 || cancelled > 0) {
          log(`  결과 반영: ${updated}건 업데이트, ${cancelled}건 취소`)
          totalResultsUpdated += updated
          totalResultsCancelled += cancelled
        }
        if (unknowns.length > 0) {
          await sendUnknownsToApi(gmTs, unknowns)
        }
      } catch (e) {
        const errMsg = `결과 수집 gmTs=${gmTs}: ${(e as Error).message}`
        logError(errMsg)
        syncErrors.push(errMsg)
      }
    }

    if (totalResultsUpdated > 0 || totalResultsCancelled > 0) {
      log(`결과 수집 합계: ${totalResultsUpdated}건 업데이트, ${totalResultsCancelled}건 취소`)
    }

    // Phase 6: sync_state 업데이트
    const latestGmTs =
      allProcessedGmTs.length > 0 ? allProcessedGmTs[allProcessedGmTs.length - 1] : undefined

    await updateSyncState({
      latestGmTs,
      activeRounds: allProcessedGmTs,
      lastSyncAction: totalGames > 0 ? "vps_synced" : "vps_checked",
      lastSyncGamesCount: totalGames,
      lastError: syncErrors.length > 0 ? syncErrors.join("; ") : null,
    })

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    log(
      `=== 동기화 완료 === ${allProcessedGmTs.length}개 라운드, ${totalGames}건 게임, ${totalResultsUpdated}건 결과, ${duration}s`
    )

    if (syncErrors.length > 0) {
      log(`경고: ${syncErrors.length}개 에러 발생`)
      syncErrors.forEach((e) => log(`  - ${e}`))
    }
  } catch (err) {
    logError("치명적 오류:", err)

    await updateSyncState({
      lastSyncAction: "vps_error",
      lastSyncGamesCount: 0,
      lastError: `치명적 오류: ${(err as Error).message}`,
    })

    process.exit(1)
  }
}

main()

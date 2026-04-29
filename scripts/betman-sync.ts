/**
 * Betman 데이터 동기화 스크립트
 *
 * 기능:
 *   1. 최신 gmTs 확인 (DB 기반 상태 관리)
 *   2. 새 라운드 → JSON 생성 + DB 저장
 *   3. 기존 라운드 → JSON 갱신 + DB 업데이트
 *
 * 사용법:
 *   pnpm exec tsx scripts/betman-sync.ts [--check-only] [--gmts=260018] [--skip-api]
 *
 * 옵션:
 *   --check-only: 최신 gmTs 확인만 (데이터 수집 안함)
 *   --gmts=XXXXX: 특정 gmTs 지정
 *   --skip-api: 로컬 개발용 — 파일 기반 상태 + API 호출 스킵
 *
 * 출력 (JSON):
 *   {
 *     "action": "created" | "updated" | "checked",
 *     "gmTs": "260018",
 *     "gamesCount": 194,
 *     "jsonPath": "data/260018.json"
 *   }
 */

import { chromium, Browser, Page } from "playwright"
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"

const GM_ID = "G101"
const SLIP_URL = "https://www.betman.co.kr/main/mainPage/gamebuy/gameSlip.do"
const API_INQ_PATH = "/buyPsblGame/gameInfoInq.do"
const DATA_DIR = join(process.cwd(), "data")
const STATE_FILE = join(DATA_DIR, "betman-state.json")

const handiMap: Record<number, string> = {
  0: "일반",
  2: "핸디캡",
  5: "SUM",
  9: "언더오버",
  14: "일반",
}
const sportMap: Record<string, string> = {
  BK: "농구",
  SC: "축구",
  VL: "배구",
  BS: "야구",
}

interface BetmanState {
  lastChecked: string
  activeRounds: string[]
  latestGmTs: string
}

interface Game {
  game_no: number
  match_time: string
  sport: string
  league_code: string
  game_type: string
  home_team_name: string
  away_team_name: string
  home_win_odds: number | null
  draw_odds: number | null
  away_win_odds: number | null
  over_odds: number | null
  under_odds: number | null
  odd_odds: number | null
  even_odds: number | null
}

interface SyncResult {
  action: "created" | "updated" | "checked" | "error"
  gmTs: string
  isNew?: boolean
  gamesCount?: number
  jsonPath?: string
  activeRounds?: string[]
  error?: string
}

// ─── API Base URL ───

function getApiBase(): string {
  const url =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL이 설정되지 않았습니다. 로컬 dev 실행 시 .env에 NEXT_PUBLIC_APP_URL=http://localhost:3000 추가하세요."
    )
  }
  return url
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (process.env.CRON_SECRET) {
    headers["Authorization"] = `Bearer ${process.env.CRON_SECRET}`
  }
  return headers
}

// ─── State Management (API-based) ───

function getSupabaseHeaders(): Record<string, string> | null {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  }
}

async function loadStateFromSupabase(): Promise<BetmanState | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const headers = getSupabaseHeaders()
  if (!supabaseUrl || !headers) return null

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/betman_sync_state?select=latest_gm_ts,active_rounds,last_checked_at&order=updated_at.desc&limit=1`,
      { headers }
    )
    if (!res.ok) return null
    const rows = await res.json()
    if (!rows?.[0]) return null
    const row = rows[0]
    return {
      lastChecked: row.last_checked_at ?? "",
      activeRounds: Array.isArray(row.active_rounds) ? row.active_rounds : [],
      latestGmTs: row.latest_gm_ts ?? "",
    }
  } catch {
    return null
  }
}

async function loadStateFromApi(): Promise<BetmanState> {
  // 1차: Supabase DB 직접 조회 (Next.js 배포와 무관)
  const fromDb = await loadStateFromSupabase()
  if (fromDb) return fromDb

  // 2차: sync-state API (Next.js 서버가 있을 때)
  const apiBase = getApiBase()
  try {
    const res = await fetch(`${apiBase}/api/betman/sync-state`, {
      headers: getAuthHeaders(),
    })
    if (!res.ok) {
      console.error("sync-state API GET 실패:", res.status)
      return { lastChecked: "", activeRounds: [], latestGmTs: "" }
    }
    const data = await res.json()
    return {
      lastChecked: data.lastCheckedAt ?? "",
      activeRounds: Array.isArray(data.activeRounds) ? data.activeRounds : [],
      latestGmTs: data.latestGmTs ?? "",
    }
  } catch (e) {
    console.error("sync-state API 조회 오류:", e)
    return { lastChecked: "", activeRounds: [], latestGmTs: "" }
  }
}

async function saveStateToApi(
  state: BetmanState,
  action: string,
  gamesCount: number,
  lastError?: string
): Promise<void> {
  const apiBase = getApiBase()
  try {
    const res = await fetch(`${apiBase}/api/betman/sync-state`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        latestGmTs: state.latestGmTs,
        activeRounds: state.activeRounds,
        lastSyncAction: action,
        lastSyncGamesCount: gamesCount,
        lastError: lastError ?? null,
      }),
    })
    if (!res.ok) {
      console.error("sync-state API POST 실패:", res.status)
    }
  } catch (e) {
    console.error("sync-state API 저장 오류:", e)
  }
}

// ─── State Management (File-based, for --skip-api) ───

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
}

function loadStateFromFile(): BetmanState {
  ensureDataDir()
  if (existsSync(STATE_FILE)) {
    return JSON.parse(readFileSync(STATE_FILE, "utf-8"))
  }
  return { lastChecked: "", activeRounds: [], latestGmTs: "" }
}

function saveStateToFile(state: BetmanState) {
  ensureDataDir()
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8")
}

// ─── KST ISO 변환 ───

function toKSTISO(ms: number): string {
  const d = new Date(ms)
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}T${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}:${pad(kst.getUTCSeconds())}+09:00`
}

// ─── Game Parsing ───

function parseGames(datas: unknown[][]): Game[] {
  const games: Game[] = []
  for (const d of datas) {
    const winAllot = (d[16] as number) || 0
    const drawAllot = (d[17] as number) || 0
    const loseAllot = (d[18] as number) || 0
    if (winAllot === 0 && drawAllot === 0 && loseAllot === 0) continue

    const handi = d[19] as number
    const gameType = handiMap[handi] ?? "일반"
    const gameDate = d[3] as number | undefined

    let home_win_odds: number | null = null
    let away_win_odds: number | null = null
    let draw_odds: number | null = null
    let over_odds: number | null = null
    let under_odds: number | null = null
    let odd_odds: number | null = null
    let even_odds: number | null = null

    if (gameType === "일반" || gameType === "핸디캡") {
      home_win_odds = winAllot > 0 ? winAllot : null
      draw_odds = drawAllot > 0 ? drawAllot : null
      away_win_odds = loseAllot > 0 ? loseAllot : null
    } else if (gameType === "언더오버") {
      under_odds = winAllot > 0 ? winAllot : null
      over_odds = loseAllot > 0 ? loseAllot : null
    } else if (gameType === "SUM") {
      odd_odds = winAllot > 0 ? winAllot : null
      even_odds = loseAllot > 0 ? loseAllot : null
    }

    games.push({
      game_no: d[11] as number,
      match_time: gameDate ? toKSTISO(gameDate) : toKSTISO(Date.now()),
      sport: sportMap[(d[0] as string) ?? ""] ?? (d[0] as string),
      league_code: (d[7] as string) || "",
      game_type: gameType,
      home_team_name: (d[14] as string) ?? "",
      away_team_name: (d[15] as string) ?? "",
      home_win_odds,
      draw_odds,
      away_win_odds,
      over_odds,
      under_odds,
      odd_odds,
      even_odds,
    })
  }
  return games
}

// ─── Betman gmTs Detection (HTTP, no Playwright needed) ───

const BUYABLE_LIST_URL = "https://www.betman.co.kr/buyPsblGame/inqBuyAbleGameInfoList.do"
const BUYABLE_PAGE_URL = "https://www.betman.co.kr/main/mainPage/gamebuy/buyableGameList.do"

/**
 * buyableGameList API에서 프로토 승부식(G101)의 최신 gmTs를 가져온다.
 * 순수 HTTP 호출 — Playwright 불필요.
 *
 * 흐름:
 *   1. buyableGameList.do 페이지 GET → 세션 쿠키 획득
 *   2. inqBuyAbleGameInfoList.do POST → protoGames에서 gmId=G101 추출
 */
async function fetchLatestGmTsFromBuyableList(): Promise<string | null> {
  try {
    // 1단계: 세션 쿠키 획득
    const pageRes = await fetch(BUYABLE_PAGE_URL, { redirect: "follow" })
    const cookies = pageRes.headers.getSetCookie?.() ?? []
    const cookieHeader = cookies.map((c) => c.split(";")[0]).join("; ")

    // 2단계: 구매 가능 게임 목록 API 호출
    const apiRes = await fetch(BUYABLE_LIST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Referer: BUYABLE_PAGE_URL,
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body: JSON.stringify({ _sbmInfo: { _sbmInfo: { debugMode: "false" } } }),
    })

    if (!apiRes.ok) {
      console.error("buyableGameList API 실패:", apiRes.status)
      return null
    }

    const data = (await apiRes.json()) as {
      protoGames?: Array<{ gmId: string; gmTs: number }>
    }

    const protoG101 = data.protoGames?.find((g) => g.gmId === GM_ID)
    if (protoG101) {
      return String(protoG101.gmTs)
    }

    console.error("프로토 승부식(G101) 게임을 찾을 수 없음")
    return null
  } catch (e) {
    console.error("buyableGameList 조회 오류:", e)
    return null
  }
}

// ─── Betman Data Fetching ───

async function fetchGames(page: Page, gmTs: string): Promise<Game[]> {
  await page.goto(`${SLIP_URL}?gmId=${GM_ID}&gmTs=${gmTs}`, {
    waitUntil: "networkidle",
    timeout: 30000,
  })

  const json = await page.evaluate(
    async (params: { gmId: string; gmTs: string; path: string }) => {
      const resp = await fetch(params.path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          gmId: params.gmId,
          gmTs: Number(params.gmTs),
          gameYear: "",
          _sbmInfo: { _sbmInfo: { debugMode: "false" } },
        }),
      })
      return resp.json()
    },
    { gmId: GM_ID, gmTs, path: API_INQ_PATH }
  )

  const datas = json?.compSchedules?.datas
  if (!Array.isArray(datas)) {
    throw new Error(`compSchedules.datas 없음: ${JSON.stringify(Object.keys(json ?? {}))}`)
  }

  return parseGames(datas)
}

/**
 * Probe betman API to check if a gmTs has data.
 * Uses page context to call gameInfoInq.do directly.
 */
async function probeGmTs(page: Page, gmTs: string): Promise<boolean> {
  try {
    await page.goto(`${SLIP_URL}?gmId=${GM_ID}&gmTs=${gmTs}`, {
      waitUntil: "networkidle",
      timeout: 15000,
    })

    const hasData = await page.evaluate(
      async (params: { gmId: string; gmTs: string; path: string }) => {
        try {
          const resp = await fetch(params.path, {
            method: "POST",
            headers: {
              "Content-Type": "application/json;charset=UTF-8",
              "X-Requested-With": "XMLHttpRequest",
            },
            body: JSON.stringify({
              gmId: params.gmId,
              gmTs: Number(params.gmTs),
              gameYear: "",
              _sbmInfo: { _sbmInfo: { debugMode: "false" } },
            }),
          })
          const json = await resp.json()
          const datas = json?.compSchedules?.datas
          return Array.isArray(datas) && datas.length > 0
        } catch {
          return false
        }
      },
      { gmId: GM_ID, gmTs, path: API_INQ_PATH }
    )

    return hasData
  } catch {
    return false
  }
}

// ─── Save to JSON file ───

async function saveToJson(gmTs: string, games: Game[]): Promise<string> {
  ensureDataDir()
  const filePath = join(DATA_DIR, `${gmTs}.json`)

  const output = {
    gmTs,
    gmId: GM_ID,
    updatedAt: new Date().toISOString(),
    totalGames: games.length,
    games,
  }

  writeFileSync(filePath, JSON.stringify(output, null, 2), "utf-8")
  return filePath
}

// ─── Save to API (round + games) ───

async function saveToApi(gmTs: string, games: Game[]): Promise<string | null> {
  const apiBase = getApiBase()
  const headers = getAuthHeaders()

  try {
    // Round 생성/조회
    const roundRes = await fetch(`${apiBase}/api/betman/round`, {
      method: "POST",
      headers,
      body: JSON.stringify({ gmTs }),
    })

    if (!roundRes.ok) {
      console.error("round API 실패:", roundRes.status)
      return null
    }

    const roundBody = (await roundRes.json()) as { roundId?: string }
    const roundId = roundBody.roundId
    if (!roundId) return null

    // Games 저장
    const gamesRes = await fetch(`${apiBase}/api/betman/games`, {
      method: "POST",
      headers,
      body: JSON.stringify({ roundId, games }),
    })

    if (!gamesRes.ok) {
      console.error("games API 실패:", gamesRes.status)
      return null
    }

    return roundId
  } catch (e) {
    console.error("API 호출 오류:", e)
    return null
  }
}

// ─── Main ───

async function main() {
  const args = process.argv.slice(2)
  const checkOnly = args.includes("--check-only")
  const gmTsArg = args.find((a) => a.startsWith("--gmts="))?.split("=")[1]
  const skipApi = args.includes("--skip-api")

  // Load state: API-based (default) or file-based (--skip-api)
  const state = skipApi ? loadStateFromFile() : await loadStateFromApi()
  const browser = await chromium.launch({ headless: true })

  try {
    const page = await browser.newPage()

    // ─── gmTs 결정 (우선순위) ───
    // (1순위) --gmts=XXXXX 인자
    let gmTs = gmTsArg

    // (2순위) buyableGameList API에서 프로토 승부식(G101) 조회 (Playwright 불필요)
    if (!gmTs) {
      console.error("buyableGameList API로 최신 gmTs 조회 중...")
      gmTs = (await fetchLatestGmTsFromBuyableList()) ?? ""
      if (gmTs) {
        console.error(`buyableGameList에서 gmTs 감지: ${gmTs}`)
      }
    }

    // (3순위) latestGmTs + 1 을 betman API로 probe
    if (!gmTs && state.latestGmTs) {
      const nextGmTs = String(Number(state.latestGmTs) + 1)
      console.error(`다음 회차 probe 시도: ${nextGmTs}`)
      const hasNext = await probeGmTs(page, nextGmTs)
      if (hasNext) {
        gmTs = nextGmTs
        console.error(`새 회차 발견: ${gmTs}`)
      }
    }

    // (4순위) 기존 latestGmTs로 재동기화 (idempotent)
    if (!gmTs) {
      if (state.latestGmTs) {
        gmTs = state.latestGmTs
        console.error(`Fallback: 기존 latestGmTs 사용: ${gmTs}`)
      } else {
        const result: SyncResult = {
          action: "error",
          gmTs: "",
          error: "gmTs를 찾을 수 없음",
        }
        console.log(JSON.stringify(result))
        if (!skipApi) {
          await saveStateToApi(state, "error", 0, "gmTs를 찾을 수 없음")
        }
        return
      }
    }

    const isNew = !state.activeRounds.includes(gmTs)

    // 상태 업데이트
    if (isNew) {
      state.activeRounds.push(gmTs)
      if (state.activeRounds.length > 5) {
        state.activeRounds = state.activeRounds.slice(-5)
      }
    }
    state.latestGmTs = gmTs
    state.lastChecked = new Date().toISOString()

    if (checkOnly) {
      // Save state and exit
      if (skipApi) {
        saveStateToFile(state)
      } else {
        await saveStateToApi(state, "checked", 0)
      }

      const result: SyncResult = {
        action: "checked",
        gmTs,
        isNew,
        activeRounds: state.activeRounds,
      }
      console.log(JSON.stringify(result))
      return
    }

    // 데이터 수집
    const games = await fetchGames(page, gmTs)
    const jsonPath = await saveToJson(gmTs, games)

    // API 저장 (옵션)
    if (!skipApi) {
      await saveToApi(gmTs, games)
      await saveStateToApi(state, isNew ? "created" : "updated", games.length)
    } else {
      saveStateToFile(state)
    }

    const result: SyncResult = {
      action: isNew ? "created" : "updated",
      gmTs,
      isNew,
      gamesCount: games.length,
      jsonPath,
      activeRounds: state.activeRounds,
    }

    console.log(JSON.stringify(result))
  } finally {
    await browser.close()
  }
}

main().catch((e) => {
  console.log(JSON.stringify({ action: "error", error: e.message }))
  process.exit(1)
})

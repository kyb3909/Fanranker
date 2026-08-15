import { unstable_cache } from "next/cache"
import { createServiceRoleClient } from "@/lib/supabase/server"
import {
  getTodayDailyId,
  formatDailyIdLabel,
  getBetCloseAt,
  getBettingWindowStatus,
  getDailyWindow,
  getGameBetDeadline,
} from "@/lib/betman/daily-round"
import { dedupeMarketRows } from "@/lib/betman/market-dedup"

/**
 * 오늘의 경기 응답 조립 — `/api/betman/games` GET 과 홈 SSR 이 **같은 함수**를 쓴다.
 *
 * 이전에는 홈(`app/page.tsx`)이 자기 자신에게 `fetch("https://gongnori.fan/api/sports/games")`
 * 를 날렸다. 서버 함수가 인터넷 밖으로 나갔다 자기 도메인으로 되돌아오는 구조라 HTTP 왕복이
 * 통째로 낭비였고, 홈이 뜨는 시간의 대부분을 이게 먹고 있었다 (2026-08-15 실측: 오리진
 * 1.4~2.9초). 라우트는 이제 이 함수를 감싸는 얇은 껍데기다.
 *
 * ⚠️ Vercel 함수는 iad1(미국 버지니아), Supabase 는 아시아에 있어 **DB 왕복 1회가 200ms대**다.
 *    그래서 여기서는 왕복 횟수 자체가 곧 응답 시간이다 — 쿼리를 추가할 땐 반드시 기존
 *    `Promise.all` 에 합류시킬 것. 순차로 붙이면 200ms 가 그대로 늘어난다.
 */

/** 조회 실패를 라우트가 구분해 메시지를 유지하기 위한 표식 */
export class BetmanGamesError extends Error {}

export interface GamesPayloadParams {
  /** "all" 또는 축구/야구/농구/배구 — 호출 전 검증되어 있다고 가정 */
  sport?: string
  /** "all" 또는 일반/핸디캡/언더오버 */
  gameType?: string
  /** YYYY-MM-DD (없으면 오늘) */
  date?: string | null
  /** 이벤트 slug (월드컵 등) */
  event?: string | null
  /** 로그인 유저 id — 있으면 내 예측을 함께 실어 준다. 없으면 조회 자체를 건너뛴다. */
  userId?: string | null
}

/**
 * 과거 경기/라운드 정리 + 라이브룸 상태 동기화.
 *
 * ⚠️ **응답 경로에서 부르지 말 것.** 원래 GET 맨 앞에 `await` 로 박혀 있었는데, 실측 결과
 *    갱신 대상 행이 0건이면서 태평양 왕복 비용만 내고 이후 모든 조회를 자기 뒤로 밀고 있었다.
 *    같은 정리를 `/api/cron/betman-sync` 가 30분마다 이미 수행한다(중복). 라우트에서는
 *    `after()` 로 응답을 보낸 뒤에 돌린다.
 */
export async function runGamesHousekeeping(): Promise<void> {
  const supabase = createServiceRoleClient()
  const now = new Date().toISOString()
  await Promise.all([
    supabase
      .from("betman_games")
      .update({ status: "in_progress", updated_at: now })
      .eq("status", "scheduled")
      .lt("match_time", now),
    supabase
      .from("betman_daily_rounds")
      .update({ status: "closed", updated_at: now })
      .eq("status", "open")
      .lt("bet_close_at", now),
    // live_rooms: 경기 시작 → live, 경기 끝나고 30분 → closed
    Promise.resolve(supabase.rpc("sync_live_room_status")).catch(() => {
      /* RPC가 없으면 무시 */
    }),
  ])
}

/**
 * SSR 프리페치 전용 — 위 조립을 **Data Cache 60초**로 감싼다.
 *
 * ⚠️ 이 래퍼가 없으면 홈/승부예측이 렌더될 때마다 betman 쿼리를 새로 돈다.
 *    두 페이지에 `export const revalidate = 300` 이 선언돼 있지만 **그건 죽어 있다** —
 *    루트 레이아웃의 `<ClerkProvider dynamic>` 이 앱 전체를 동적 렌더로 고정해서
 *    프리렌더 라우트가 robots/sitemap/og 3개뿐이고, 모든 페이지 응답이
 *    `private, no-store` 로 나간다 (2026-08-15 실측: x-vercel-cache 100% MISS).
 *
 *    종전 `fetch(".../api/sports/games", { next: { revalidate: 60 } })` 는 HTTP 왕복이라는
 *    큰 비용을 냈지만 그 대신 Data Cache 는 얻고 있었다. 왕복만 걷어내고 캐시를 안 붙이면
 *    중앙값이 오히려 나빠진다 — 왕복 제거와 캐시 유지를 **둘 다** 해야 이긴다.
 *
 * 라우트(`/api/betman/games`)는 이걸 쓰지 않는다. 개인 예측이 섞이고 필터 조합이 열려 있어
 * 캐시 키가 발산하기 때문. 라우트는 자체 CDN 캐시 헤더로 처리한다.
 */
export function getGamesPayloadForSsr(sport = "all") {
  return unstable_cache(() => buildGamesPayload({ sport }), ["betman-games-ssr", sport], {
    revalidate: 60,
    tags: ["betman-games"],
  })()
}

export async function buildGamesPayload(params: GamesPayloadParams = {}) {
  const supabase = createServiceRoleClient()
  const sportFilter = params.sport || "all"
  const gameTypeFilter = params.gameType || "all"
  const dateParam = params.date || null
  const eventParam = params.event || null
  const userId = params.userId || null

  // --- Fixed daily window: [date 08:00 KST, date+1 08:00 KST) ---
  const { start: windowStart, end: windowEnd, dailyId } = getDailyWindow(dateParam || undefined)

  // --- 이벤트 경기 풀 분리 + 동기화 상태 (왕복 1회로 묶음) ---
  // ?event=<slug> → 그 이벤트 league_codes 만 포함 (이벤트 베팅 페이지 전용)
  // param 없음(메인) → 활성 이벤트(미종료) league_codes 전부 제외 → 이벤트 경기는 메인 풀에 안 보임
  const [eventScopeRes, syncStateRes] = await Promise.all([
    eventParam
      ? supabase.from("events").select("league_codes").eq("slug", eventParam).maybeSingle()
      : supabase.from("events").select("league_codes").neq("status", "closed"),
    supabase
      .from("betman_sync_state")
      .select("latest_gm_ts, last_sync_action, last_checked_at, last_error")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const scopeRaw = eventScopeRes.data as
    | { league_codes?: string[] | null }
    | { league_codes?: string[] | null }[]
    | null
  const scopeRows = Array.isArray(scopeRaw) ? scopeRaw : scopeRaw ? [scopeRaw] : []
  const scopeCodes = [
    ...new Set(scopeRows.flatMap((e) => (e.league_codes ?? []) as string[])),
  ].filter(Boolean)
  const includeCodes: string[] | null = eventParam ? scopeCodes : null
  const excludeCodes: string[] = eventParam ? [] : scopeCodes

  // --- Fetch games in daily window (kickoff-time based) ---
  const isToday = !dateParam || dailyId === getTodayDailyId()
  let query = supabase
    .from("betman_games")
    .select(
      "id, round_id, game_no, match_time, sport, league_code, game_type, home_team_name, away_team_name, handicap, over_under_line, venue, status, home_win_odds, away_win_odds, draw_odds, over_odds, under_odds, odd_odds, even_odds, daily_round_id"
    )
    // betman 다음 라운드 preview placeholder 차단 — '미정 vs 미정' 또는 빈 팀명
    .neq("home_team_name", "미정")
    .neq("away_team_name", "미정")
    .not("home_team_name", "is", null)
    .not("away_team_name", "is", null)
    .order("match_time", { ascending: true })
    .order("game_no", { ascending: true })

  // --- 시간 필터: 데일리 윈도우 (당일 08:00 초과 ~ 익일 08:00 이하] ---
  // 시작 경계 exclusive — 8시 "정각" 킥오프는 당일 프로토 발매(08:00 오픈)에서
  // 걸 수 없는 경기 (프로토 규정 추종, 2026-06-11).
  // 끝 경계 inclusive — 익일 08:00 "정각" 경기는 익일 발매에서 못 걸므로
  // 전날 슬레이트의 마지막 경기로 포함 (2026-07-02, 포르투갈-크로아티아 16강이
  // 양쪽 윈도우에서 다 빠져 영구 미노출됐던 버그 수정). 메인·이벤트 공통 규칙.
  query = query
    .gt("match_time", windowStart.toISOString())
    .lte("match_time", windowEnd.toISOString())

  // 이벤트 경기 풀 분리 — 메인은 이벤트 코드 제외, 이벤트 모드는 해당 코드만.
  //
  // ⚠️ league_codes 가 **빈 배열이면 "축구 전 리그"** 를 뜻한다 (2026-08-14 시즌 이벤트).
  // 개막 기념 승부예측 이벤트는 특정 리그가 아니라 축구 전체가 판이라, 리그를 열거하면 betman 이
  // 새 리그 코드를 붙일 때마다 조용히 이벤트 밖으로 새어나간다. 빈 배열을
  // "__none__"(경기 0건)으로 읽던 종전 분기를 여기서 갈라 준다.
  if (includeCodes !== null) {
    query =
      includeCodes.length > 0 ? query.in("league_code", includeCodes) : query.eq("sport", "축구")
  } else if (excludeCodes.length > 0) {
    // null league_code 게임은 유지하고 이벤트 코드만 제외
    query = query.or(`league_code.is.null,league_code.not.in.(${excludeCodes.join(",")})`)
  }

  // 오늘 경기는 scheduled만, 과거 날짜는 전체 상태 반환
  if (isToday) {
    query = query.eq("status", "scheduled")
  }

  if (sportFilter !== "all") {
    query = query.eq("sport", sportFilter)
  }
  if (gameTypeFilter !== "all") {
    query = query.or(`game_type.eq.${gameTypeFilter},game_type.eq.S${gameTypeFilter}`)
  }

  const { data: games, error: gamesError } = await query

  if (gamesError) {
    console.error("Failed to fetch betman games:", gamesError)
    throw new BetmanGamesError("경기 목록을 가져오는 중 오류가 발생했습니다.")
  }

  // Betting window status (프로토 발매 시간 08:00~23:00 KST)
  const windowStatus = getBettingWindowStatus()
  // 경기별 마감 = min(킥오프, 표시 라운드의 23:00) — 프로토 발매 마감 규정
  const roundCloseAt = new Date(getBetCloseAt(dailyId))

  const gamesWithOdds = (games || []).map((game) => {
    const rawGameType = (game.game_type as string) || ""
    const gameType = rawGameType === "SUM" ? "SUM" : rawGameType.replace(/^S/, "")
    let home_odds, draw_odds, away_odds, over_odds, under_odds, odd_odds, even_odds
    // 홈/원정 (+ 무) 마켓: 옛 매핑(일반/핸디캡) + 신 매핑 4종(d6de333) 모두 포함.
    // 신 매핑이 추가됐을 때 클라이언트 옵션 결정만 갱신되고 이 분기는 누락돼 있어
    // MLB/NBA 등 신 매핑 비중 큰 종목 home/away 배당이 응답에서 undefined 로 빠짐.
    if (
      gameType === "일반" ||
      gameType === "핸디캡" ||
      gameType === "승패2way" ||
      gameType === "승1패" ||
      gameType === "승5패" ||
      gameType === "소수핸디캡"
    ) {
      home_odds = game.home_win_odds != null ? parseFloat(String(game.home_win_odds)) : undefined
      away_odds = game.away_win_odds != null ? parseFloat(String(game.away_win_odds)) : undefined
      draw_odds = game.draw_odds != null ? parseFloat(String(game.draw_odds)) : undefined
    } else if (gameType === "언더오버") {
      over_odds = game.over_odds != null ? parseFloat(String(game.over_odds)) : undefined
      under_odds = game.under_odds != null ? parseFloat(String(game.under_odds)) : undefined
    } else if (gameType === "SUM") {
      odd_odds = game.odd_odds != null ? parseFloat(String(game.odd_odds)) : undefined
      even_odds = game.even_odds != null ? parseFloat(String(game.even_odds)) : undefined
    }
    // 마감 = min(킥오프, 라운드 23:00) — 23:00 슬레이트 교체와 일치.
    // 베팅 자체는 23:00 리셋 직후부터 항상 가능 (밤 잠금 없음).
    const kickoff = getGameBetDeadline(game.match_time as string)
    const betCloseAt = kickoff < roundCloseAt ? kickoff : roundCloseAt
    const now = new Date()
    const isBettable = now < betCloseAt
    return {
      ...game,
      home_odds,
      draw_odds,
      away_odds,
      over_odds,
      under_odds,
      odd_odds,
      even_odds,
      bet_close_at: betCloseAt.toISOString(),
      is_bettable: isBettable,
    }
  })

  const groupedGames: Record<
    string,
    {
      matchKey: string
      sport: string
      leagueCode: string
      homeTeam: string
      awayTeam: string
      matchTime: string
      venue: string
      games: typeof gamesWithOdds
    }
  > = {}
  gamesWithOdds.forEach((game) => {
    const matchKey = `${game.home_team_name}_${game.away_team_name}_${game.match_time}`
    if (!groupedGames[matchKey]) {
      groupedGames[matchKey] = {
        matchKey,
        sport: String(game.sport ?? ""),
        leagueCode: String(game.league_code ?? ""),
        homeTeam: String(game.home_team_name ?? ""),
        awayTeam: String(game.away_team_name ?? ""),
        matchTime: String(game.match_time ?? ""),
        venue: String(game.venue ?? ""),
        games: [],
      }
    }
    groupedGames[matchKey].games.push(game)
  })

  // VPS sync.sh 가 betman 풀타임/전반전 마켓을 동일 game_type 으로 저장하는 한계
  // 보정 — 두 휴리스틱 OR 로 매치 그룹 내에서 전반전 row 를 추정해 마킹.
  //
  // [휴리스틱 1] 같은 (game_type, handicap, over_under_line) row 가 2개 이상이면
  //   game_no asc 정렬 후 첫 번째 = 풀타임, 두 번째 이상 = 전반.
  //   K리그(축구): 3526 일반 풀 / 3531 일반 전반 — 키 동일 → 두번째 잡힘.
  //
  // [휴리스틱 2] 매치 안에서 SUM 마켓 row 이후의 모든 row = 전반.
  //   KBO(야구): 풀타임은 승패2way/승1패/소수핸디캡, 전반은 일반/소수핸디캡(라인
  //   다름)/언더오버(라인 다름) → 키가 다 달라 휴리스틱 1 안 걸림. 하지만 SUM
  //   (3562) 이후 row(3563~3565) 가 모두 전반이라 휴리스틱 2 가 잡음.
  //
  // 라인 값이 다른 row(예: 언오버 2.5 vs 1.5) 는 휴리스틱 1 키가 달라 자연 분리.
  // 단독 row 는 풀/전반 식별 불가 — 그대로 풀타임 표기 (사용자 인지 영향 최소).
  // 정공법은 sync.sh 가 betman 응답의 풀/전반 디스크리미네이터를 prefix("S") 로
  // 박는 것 — Vultr 수정 후속 작업으로.
  for (const group of Object.values(groupedGames)) {
    group.games.sort((a, b) => Number(a.game_no ?? 0) - Number(b.game_no ?? 0))
    // 라운드 교차 완전 중복 마켓 제거 (같은 경기 다중 라운드 등록 시 ×N 노출 방지).
    // 배당까지 포함한 시그니처라 진짜 전반전 row(배당 다름)는 보존 → 아래 휴리스틱 무손상.
    group.games = dedupeMarketRows(group.games)
    const sumIndex = group.games.findIndex((g) => g.game_type === "SUM")
    const seenCount = new Map<string, number>()
    for (let i = 0; i < group.games.length; i++) {
      const g = group.games[i]
      const key = `${g.game_type}|${g.handicap ?? "x"}|${g.over_under_line ?? "x"}`
      const count = seenCount.get(key) ?? 0
      const isAfterSum = sumIndex >= 0 && i > sumIndex
      if (count >= 1 || isAfterSum) {
        ;(g as typeof g & { is_half_time?: boolean }).is_half_time = true
      }
      seenCount.set(key, count + 1)
    }
  }

  // ===== SUM(홀짝/합계) + 전반전(반쪽) 마켓 노출 제거 =====
  // SUM(2026-06-11): 홀짝·합계는 분석력과 무관한 운 게임.
  // 전반전(2026-06-14, 사용자 요청): is_half_time 휴리스틱 마킹 또는 S 접두사(S일반/S핸디캡/S언더오버).
  //   풀타임 마켓만 표시/베팅. DB 유입(POST)은 유지(SUM row 가 전반전 휴리스틱 디스크리미네이터라
  //   쿼리가 아닌 응답 단계에서만 제외). 베팅 차단은 prediction 라우트(SUM=enum, 전반전=S접두사 가드).
  const isSumType = (t: unknown) => t === "SUM" || t === "SSUM"
  const isHidden = (g: { game_type?: unknown; is_half_time?: boolean }) =>
    isSumType(g.game_type) ||
    g.is_half_time === true ||
    (typeof g.game_type === "string" && g.game_type.startsWith("S") && !isSumType(g.game_type))
  // 그룹 dedup 에서 살아남은 row 만 flat 목록에도 반영 (total/bettable 카운트 일관성)
  const keptIds = new Set<unknown>()
  for (const group of Object.values(groupedGames)) {
    for (const g of group.games) keptIds.add(g.id)
  }
  const visibleGames = gamesWithOdds.filter((g) => !isHidden(g) && keptIds.has(g.id))
  const visibleGroups = Object.values(groupedGames)
    .map((group) => ({
      ...group,
      games: group.games.filter((g) => !isHidden(g)),
    }))
    .filter((group) => group.games.length > 0)

  // 내 예측은 **로그인 유저에게만** — 비로그인은 이 왕복을 통째로 건너뛴다.
  // (종전에는 `currentUser()` 로 Clerk API 를 매번 때리고, 비로그인이어도 그 왕복을 냈다.)
  let userPredictions: unknown[] = []
  if (userId && visibleGames.length > 0) {
    const gameIds = visibleGames.map((g) => g.id).filter(Boolean)
    const { data: predictions } = await supabase
      .from("betman_predictions")
      .select("*")
      .eq("user_id", userId)
      .in("game_id", gameIds)
    userPredictions = predictions || []
  }

  // 동기화 상태 (프론트엔드에서 "동기화 필요" 표시용) — 위 Promise.all 에서 이미 받아 둠
  const syncState = syncStateRes.data as {
    latest_gm_ts?: string | null
    last_sync_action?: string | null
    last_checked_at?: string | null
  } | null

  let syncStatus = "ok"
  if (syncState?.last_checked_at) {
    const hoursSince =
      (windowStart.getTime() - new Date(syncState.last_checked_at).getTime()) / (1000 * 60 * 60)
    if (hoursSince > 6) syncStatus = "urgent"
    else if (hoursSince > 3) syncStatus = "stale"
  }

  // Find the earliest bet_close_at among bettable games (for countdown)
  const bettableGames = visibleGames.filter((g) => g.is_bettable)
  const earliestBetClose =
    bettableGames.length > 0
      ? bettableGames.reduce(
          (earliest: string, g) => (g.bet_close_at < earliest ? g.bet_close_at : earliest),
          bettableGames[0].bet_close_at
        )
      : null

  return {
    // Daily window info: [08:00 KST today, 08:00 KST tomorrow)
    window: {
      start: windowStart.toISOString(),
      end: windowEnd.toISOString(),
      dailyId,
    },
    today: { date: windowStart.toISOString(), label: formatDailyIdLabel(dailyId) },
    dailyRound: null, // No longer used for display — kept for API compat
    bettingWindow: windowStatus,
    earliestBetClose,
    games: visibleGames,
    groupedGames: visibleGroups,
    userPredictions,
    total: visibleGames.length,
    syncInfo: {
      status: syncStatus,
      latestGmTs: syncState?.latest_gm_ts,
      lastAction: syncState?.last_sync_action,
      lastChecked: syncState?.last_checked_at,
    },
  }
}

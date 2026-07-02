import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { apiError, apiBadRequest } from "@/lib/api-error"
import {
  computeDailyId,
  getTodayDailyId,
  formatDailyIdLabel,
  getBetOpenAt,
  getBetCloseAt,
  getBettingWindowStatus,
  getDailyWindow,
  getGameBetDeadline,
} from "@/lib/betman/daily-round"
import { dedupeMarketRows } from "@/lib/betman/market-dedup"
import { z } from "zod"

const gamesPostSchema = z.object({
  roundId: z
    .string()
    .min(1, "roundId가 필요합니다. 먼저 POST /api/betman/round 로 회차를 생성하세요."),
  games: z.array(z.record(z.unknown())).min(1, "games 배열이 비어 있습니다."),
})

/**
 * GET /api/betman/games
 *
 * Get Betman games for prediction using a fixed daily window.
 *
 * Query: sport?, game_type?, date? (YYYY-MM-DD, defaults to today)
 *
 * Daily round: resets at 23:00 KST. Shows games from 08:00 KST ~ next 08:00 KST.
 * Bet deadline = kickoff time. No time-of-day betting restriction.
 * One daily round may contain games from multiple betman gmTs rounds.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceRoleClient()
    const { searchParams } = new URL(request.url)

    const sportFilter = searchParams.get("sport") || "all"
    const gameTypeFilter = searchParams.get("game_type") || "all"
    const dateParam = searchParams.get("date") // YYYY-MM-DD or null (today)
    const eventParam = searchParams.get("event") // 이벤트 slug (월드컵 등) or null

    // Validate date param if provided
    if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return NextResponse.json(
        { error: "날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)" },
        { status: 400 }
      )
    }

    // --- Fixed daily window: [date 08:00 KST, date+1 08:00 KST) ---
    const { start: windowStart, end: windowEnd, dailyId } = getDailyWindow(dateParam || undefined)
    const now = new Date()

    // --- Auto-expire past games + close past daily rounds + update live rooms (병렬) ---
    await Promise.all([
      supabase
        .from("betman_games")
        .update({ status: "in_progress", updated_at: now.toISOString() })
        .eq("status", "scheduled")
        .lt("match_time", now.toISOString()),
      supabase
        .from("betman_daily_rounds")
        .update({ status: "closed", updated_at: now.toISOString() })
        .eq("status", "open")
        .lt("bet_close_at", now.toISOString()),
      // live_rooms: 경기 시작 → live, 경기 끝나고 30분 → closed
      Promise.resolve(supabase.rpc("sync_live_room_status")).catch(() => {
        /* RPC가 없으면 무시 */
      }),
    ])

    // --- 이벤트 경기 풀 분리 ---
    // ?event=<slug> → 그 이벤트 league_codes 만 포함 (이벤트 베팅 페이지 전용)
    // param 없음(메인) → 활성 이벤트(미종료) league_codes 전부 제외 → 이벤트 경기는 메인 풀에 안 보임
    let includeCodes: string[] | null = null
    let excludeCodes: string[] = []
    if (eventParam) {
      const { data: ev } = await supabase
        .from("events")
        .select("league_codes")
        .eq("slug", eventParam)
        .maybeSingle()
      includeCodes = ((ev?.league_codes ?? []) as string[]).filter(Boolean)
    } else {
      const { data: activeEvents } = await supabase
        .from("events")
        .select("league_codes")
        .neq("status", "closed")
      excludeCodes = [
        ...new Set((activeEvents ?? []).flatMap((e) => (e.league_codes ?? []) as string[])),
      ].filter(Boolean)
    }

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

    // 이벤트 경기 풀 분리 — 메인은 이벤트 코드 제외, 이벤트 모드는 해당 코드만
    if (includeCodes !== null) {
      query = query.in("league_code", includeCodes.length > 0 ? includeCodes : ["__none__"])
    } else if (excludeCodes.length > 0) {
      // null league_code 게임은 유지하고 이벤트 코드만 제외
      query = query.or(`league_code.is.null,league_code.not.in.(${excludeCodes.join(",")})`)
    }

    // 오늘 경기는 scheduled만, 과거 날짜는 전체 상태 반환
    if (isToday) {
      query = query.eq("status", "scheduled")
    }

    const allowedSports = ["축구", "야구", "농구", "배구"]
    // SUM(홀짝) 은 2026-06-11 부로 노출/베팅 중단 — 필터 화이트리스트에서도 제외
    const allowedGameTypes = ["일반", "핸디캡", "언더오버"]
    if (sportFilter !== "all") {
      if (!allowedSports.includes(sportFilter)) {
        return NextResponse.json({ error: "유효하지 않은 종목입니다." }, { status: 400 })
      }
      query = query.eq("sport", sportFilter)
    }
    if (gameTypeFilter !== "all") {
      if (!allowedGameTypes.includes(gameTypeFilter)) {
        return NextResponse.json({ error: "유효하지 않은 경기 타입입니다." }, { status: 400 })
      }
      query = query.or(`game_type.eq.${gameTypeFilter},game_type.eq.S${gameTypeFilter}`)
    }

    const { data: games, error: gamesError } = await query

    if (gamesError) {
      console.error("Failed to fetch betman games:", gamesError)
      return NextResponse.json(
        { error: "경기 목록을 가져오는 중 오류가 발생했습니다." },
        { status: 500 }
      )
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

    const user = await currentUser()
    let userPredictions: unknown[] = []
    if (user && visibleGames.length > 0) {
      const gameIds = visibleGames.map((g) => g.id).filter(Boolean)
      const { data: predictions } = await supabase
        .from("betman_predictions")
        .select("*")
        .eq("user_id", user.id)
        .in("game_id", gameIds)
      userPredictions = predictions || []
    }

    // 동기화 상태 (프론트엔드에서 "동기화 필요" 표시용)
    const { data: syncState } = await supabase
      .from("betman_sync_state")
      .select("latest_gm_ts, last_sync_action, last_checked_at, last_error")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

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

    const res = NextResponse.json({
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
    })
    res.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120")
    return res
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

/**
 * POST /api/betman/games
 *
 * VPS에서 게임 데이터를 전송. 자동으로 daily round에 배정.
 *
 * Body: {
 *   roundId: string (uuid),
 *   games: Array<{ game_no, match_time, sport, game_type, ... }>
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }
    const parsed = gamesPostSchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.errors[0]?.message || "잘못된 요청입니다.")
    }
    const { roundId, games } = parsed.data

    const supabase = createServiceRoleClient()

    const rows = games.map((g: Record<string, unknown>) => {
      const matchTime = g.match_time != null ? String(g.match_time) : null
      return {
        round_id: roundId,
        game_no: Number(g.game_no) || 0,
        match_time: matchTime,
        sport: g.sport != null ? String(g.sport) : "축구",
        game_type: g.game_type != null ? String(g.game_type) : "일반",
        home_team_name: g.home_team_name != null ? String(g.home_team_name) : "",
        away_team_name: g.away_team_name != null ? String(g.away_team_name) : "",
        league_code: g.league_code != null ? String(g.league_code) : null,
        venue: g.venue != null ? String(g.venue) : null,
        status: g.status != null ? String(g.status) : "scheduled",
        handicap: g.handicap != null ? Number(g.handicap) : null,
        over_under_line: g.over_under_line != null ? Number(g.over_under_line) : null,
        home_win_odds: g.home_win_odds != null ? Number(g.home_win_odds) : null,
        away_win_odds: g.away_win_odds != null ? Number(g.away_win_odds) : null,
        draw_odds: g.draw_odds != null ? Number(g.draw_odds) : null,
        over_odds: g.over_odds != null ? Number(g.over_odds) : null,
        under_odds: g.under_odds != null ? Number(g.under_odds) : null,
        odd_odds: g.odd_odds != null ? Number(g.odd_odds) : null,
        even_odds: g.even_odds != null ? Number(g.even_odds) : null,
      }
    })

    const { error } = await supabase.from("betman_games").upsert(rows, {
      onConflict: "round_id,game_no",
      ignoreDuplicates: false,
    })

    if (error) {
      console.error("betman_games upsert error:", error)
      return NextResponse.json({ error: "경기 목록 저장 중 오류가 발생했습니다." }, { status: 500 })
    }

    // --- Auto-assign daily round IDs ---
    const dailyGroups = new Map<string, number>()
    for (const row of rows) {
      if (!row.match_time) continue
      const dailyId = computeDailyId(row.match_time)
      dailyGroups.set(dailyId, (dailyGroups.get(dailyId) || 0) + 1)
    }

    let dailyRoundsCreated = 0
    for (const [dailyId] of dailyGroups) {
      const betOpen = getBetOpenAt(dailyId)
      const betClose = getBetCloseAt(dailyId)

      const { data: dr } = await supabase
        .from("betman_daily_rounds")
        .upsert(
          { daily_id: dailyId, bet_open_at: betOpen, bet_close_at: betClose },
          { onConflict: "daily_id" }
        )
        .select("id")
        .single()

      if (dr) {
        await supabase.rpc("assign_daily_round", {
          p_daily_id: dailyId,
          p_daily_round_id: dr.id,
        })
        dailyRoundsCreated++
      }
    }

    // --- Auto-create live rooms for upcoming matches ---
    // 같은 매치(홈팀+원정팀+시간)를 하나의 라이브 채팅방으로 묶음
    // game_type이 일반인 경기의 id를 game_id로 사용 (대표 경기)
    let liveRoomsCreated = 0
    try {
      // 방금 upsert한 경기들 중 '일반' 타입만 가져와서 대표 경기로 사용
      const matchKeys = [
        ...new Set(
          rows
            .filter((r) => r.match_time && (r.game_type === "일반" || r.game_type === "S일반"))
            .map((r) => `${r.home_team_name}_${r.away_team_name}_${r.match_time}`)
        ),
      ]

      if (matchKeys.length > 0) {
        // 해당 경기들의 실제 DB id 조회
        const gameConditions = rows
          .filter((r) => r.match_time && (r.game_type === "일반" || r.game_type === "S일반"))
          .map((r) => ({
            home: r.home_team_name,
            away: r.away_team_name,
            time: r.match_time,
            sport: r.sport,
          }))

        // 중복 제거
        const uniqueMatches = gameConditions.filter(
          (m, i, arr) =>
            arr.findIndex((x) => x.home === m.home && x.away === m.away && x.time === m.time) === i
        )

        // 1) Batch fetch: 모든 '일반' 경기의 DB id를 한 번에 조회
        const matchTimes = [...new Set(uniqueMatches.map((m) => m.time).filter(Boolean))]
        const { data: allGameRows } = await supabase
          .from("betman_games")
          .select("id, home_team_name, away_team_name, match_time, sport")
          .eq("game_type", "일반")
          .in("match_time", matchTimes as string[])

        if (allGameRows && allGameRows.length > 0) {
          // game lookup map: "home_away_time" → gameRow
          const gameMap = new Map<string, (typeof allGameRows)[0]>()
          for (const g of allGameRows) {
            gameMap.set(`${g.home_team_name}_${g.away_team_name}_${g.match_time}`, g)
          }

          // 2) Batch fetch: 이미 존재하는 live_rooms 조회
          const allGameIds = allGameRows.map((g) => g.id)
          const { data: existingRooms } = await supabase
            .from("live_rooms")
            .select("game_id")
            .in("game_id", allGameIds)

          const existingGameIds = new Set((existingRooms ?? []).map((r) => r.game_id))

          // 3) Batch insert: 새 live_rooms 일괄 생성
          const sportMap: Record<string, string> = {
            축구: "football",
            야구: "baseball",
            농구: "basketball",
            배구: "volleyball",
          }
          const newRooms: Array<{
            game_id: string
            name: string
            sport: string
            status: string
          }> = []

          for (const match of uniqueMatches) {
            const key = `${match.home}_${match.away}_${match.time}`
            const gameRow = gameMap.get(key)
            if (!gameRow || existingGameIds.has(gameRow.id)) continue

            newRooms.push({
              game_id: gameRow.id,
              name: `${match.home} vs ${match.away}`,
              sport: sportMap[match.sport] || match.sport,
              status: "scheduled",
            })
          }

          if (newRooms.length > 0) {
            await supabase.from("live_rooms").insert(newRooms)
            liveRoomsCreated = newRooms.length
          }
        }
      }
    } catch (e) {
      // live_rooms 생성 실패해도 게임 동기화는 성공으로 처리
      console.error("live_rooms auto-create error:", e)
    }

    return NextResponse.json({
      roundId,
      count: rows.length,
      dailyRoundsProcessed: dailyRoundsCreated,
      liveRoomsCreated,
      message: `${rows.length}개 경기가 저장되었습니다. (${dailyRoundsCreated}개 일일 라운드, ${liveRoomsCreated}개 채팅방 생성)`,
    })
  } catch (e) {
    console.error("API error:", e)
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 })
  }
}

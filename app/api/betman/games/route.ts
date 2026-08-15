import { NextRequest, NextResponse, after } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { apiError, apiBadRequest } from "@/lib/api-error"
import { computeDailyId, getBetOpenAt, getBetCloseAt } from "@/lib/betman/daily-round"
import {
  buildGamesPayload,
  runGamesHousekeeping,
  BetmanGamesError,
} from "@/lib/betman/games-payload"
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

    const allowedSports = ["축구", "야구", "농구", "배구"]
    // SUM(홀짝) 은 2026-06-11 부로 노출/베팅 중단 — 필터 화이트리스트에서도 제외
    const allowedGameTypes = ["일반", "핸디캡", "언더오버"]
    if (sportFilter !== "all" && !allowedSports.includes(sportFilter)) {
      return NextResponse.json({ error: "유효하지 않은 종목입니다." }, { status: 400 })
    }
    if (gameTypeFilter !== "all" && !allowedGameTypes.includes(gameTypeFilter)) {
      return NextResponse.json({ error: "유효하지 않은 경기 타입입니다." }, { status: 400 })
    }

    // 과거 경기/라운드 정리는 응답을 보낸 뒤에 — 응답 경로에서 빼낸다 (2026-08-15).
    // 원래 GET 맨 앞에서 await 하고 있었는데 갱신 대상이 0건인 날에도 태평양 왕복
    // 비용만 내고 이후 모든 조회를 자기 뒤로 밀었다. 같은 정리를 betman-sync cron 이
    // 30분마다 이미 수행하므로 여기 실패해도 데이터는 수렴한다.
    after(() => runGamesHousekeeping().catch((e) => console.error("games housekeeping failed:", e)))

    // 로그인 여부만 확인 — `auth()` 는 세션 쿠키를 읽을 뿐 네트워크를 타지 않는다.
    // (종전 `currentUser()` 는 비로그인 방문자에게도 Clerk API 왕복을 물렸다.)
    const { userId } = await auth()

    const payload = await buildGamesPayload({
      sport: sportFilter,
      gameType: gameTypeFilter,
      date: dateParam,
      event: eventParam,
      userId,
    })

    const res = NextResponse.json(payload)
    // ⚠️ 응답에 userPredictions(개인 예측)가 들어가므로 **로그인 상태에서는 절대 공용
    //    캐시에 올리지 않는다.** 종전에는 로그인·비로그인 구분 없이 `public, s-maxage=30`
    //    을 붙이고 있었다 — 개인화 응답에 공용 캐시 지시가 붙은 조합이라 위험했고,
    //    동시에 캐시 시간을 늘리는 가장 값싼 최적화를 막고 있었다 (2026-08-15).
    // 비로그인 응답은 개인 정보가 없으므로 길게 캐시 + stale 허용 → 대부분의 방문자가
    // 오리진(1.4~2.9초) 대신 CDN(137ms) 경로를 탄다.
    res.headers.set(
      "Cache-Control",
      userId ? "private, no-store" : "public, s-maxage=120, stale-while-revalidate=600"
    )
    return res
  } catch (error) {
    if (error instanceof BetmanGamesError) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
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

import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { currentUser } from "@clerk/nextjs/server"
import { getGameBetDeadline, getDailyWindow, getTodayDailyId } from "@/lib/betman/daily-round"
import { apiError, apiBadRequest } from "@/lib/api-error"
import { retryRefundTokens } from "@/lib/betman/refund-tokens"
import { z } from "zod"

const predictionItemSchema = z.object({
  game_id: z.string().min(1, "게임 ID가 필요합니다."),
  // SUM(홀짝) 마켓 중단(2026-06-11) — odd/even 은 더 이상 받지 않음
  prediction: z.enum(["home", "draw", "away", "over", "under"], {
    message: "잘못된 예측 값입니다.",
  }),
})

const predictionPostSchema = z.object({
  predictions: z.array(predictionItemSchema).min(1, "예측 데이터가 필요합니다."),
  betAmount: z
    .number()
    .int()
    .min(1, "베팅 금액은 1볼 이상이어야 합니다.")
    .max(10, "베팅 금액은 최대 10볼입니다.")
    .optional(),
  analysis_title: z.string().max(100).optional(),
  analysis_text: z.string().max(5000).optional(),
  idempotency_key: z.string().uuid().optional(),
  // 이벤트 슬립 (예: 월드컵 그룹 대결) — slug 만 받아서 서버에서 검증
  event_slug: z.string().min(1).max(64).optional(),
})

/**
 * POST /api/betman/prediction
 *
 * Create predictions for Betman games.
 * Validates per-game deadlines (must bet before kickoff).
 *
 * Body:
 * - predictions: Array of { game_id: uuid, prediction: "home" | "draw" | "away" | "over" | "under" }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })
    }

    const supabase = createServiceRoleClient()
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }
    const parsed = predictionPostSchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.errors[0]?.message || "잘못된 예측 데이터입니다.")
    }
    const { predictions, betAmount, analysis_title, analysis_text, idempotency_key, event_slug } =
      parsed.data

    // Idempotency check: prevent duplicate submissions
    if (idempotency_key) {
      const { data: existingSlip } = await supabase
        .from("prediction_slips")
        .select("id")
        .eq("idempotency_key", idempotency_key)
        .maybeSingle()

      if (existingSlip) {
        return NextResponse.json({
          success: true,
          slipId: existingSlip.id,
          message: "이미 처리된 요청입니다.",
          duplicate: true,
        })
      }
    }

    // Get all game details for validation
    const gameIds = predictions.map((p) => p.game_id)
    const { data: games, error: gamesError } = await supabase
      .from("betman_games")
      .select(
        "id, round_id, daily_round_id, sport, game_type, status, match_time, home_team_name, away_team_name, home_win_odds, away_win_odds, draw_odds, over_odds, under_odds, odd_odds, even_odds, over_under_line, handicap, league_code"
      )
      .in("id", gameIds)

    if (gamesError || !games) {
      console.error("Failed to fetch games:", gamesError)
      return NextResponse.json(
        { error: "경기 정보를 가져오는 중 오류가 발생했습니다." },
        { status: 500 }
      )
    }

    if (games.length !== predictions.length) {
      return NextResponse.json({ error: "일부 경기를 찾을 수 없습니다." }, { status: 400 })
    }

    // Check all games are from the same daily round
    const dailyRoundIds = [...new Set(games.map((g) => g.daily_round_id).filter(Boolean))]
    if (dailyRoundIds.length === 0) {
      return NextResponse.json(
        { error: "경기에 일일 라운드가 배정되지 않았습니다." },
        { status: 400 }
      )
    }
    if (dailyRoundIds.length > 1) {
      return NextResponse.json(
        { error: "모든 경기는 같은 일일 라운드여야 합니다." },
        { status: 400 }
      )
    }

    const dailyRoundId = dailyRoundIds[0]

    // Check daily round is still open
    const { data: dailyRound, error: drError } = await supabase
      .from("betman_daily_rounds")
      .select("*")
      .eq("id", dailyRoundId)
      .single()

    if (drError || !dailyRound) {
      return NextResponse.json({ error: "일일 라운드 정보를 찾을 수 없습니다." }, { status: 404 })
    }

    if (dailyRound.status === "settled") {
      return NextResponse.json({ error: "이 일일 라운드는 정산 완료되었습니다." }, { status: 400 })
    }

    // Validate single sport restriction
    const sports = [...new Set(games.map((g) => g.sport))]
    if (sports.length > 1) {
      return NextResponse.json({ error: "한 종목의 경기만 선택할 수 있습니다." }, { status: 400 })
    }

    // Validate no duplicate physical matches
    const matchKeys = games.map((g) => `${g.home_team_name}_${g.away_team_name}_${g.match_time}`)
    const uniqueMatchKeys = [...new Set(matchKeys)]
    if (uniqueMatchKeys.length !== matchKeys.length) {
      return NextResponse.json(
        { error: "같은 경기에 대해 중복 선택할 수 없습니다." },
        { status: 400 }
      )
    }

    // Check game status (must be scheduled, not in-progress or completed)
    const nonScheduledGames = games.filter((g) => g.status !== "scheduled")
    if (nonScheduledGames.length > 0) {
      const names = nonScheduledGames
        .map((g) => `${g.home_team_name} vs ${g.away_team_name}`)
        .join(", ")
      return NextResponse.json(
        { error: `이미 시작되었거나 종료된 경기가 포함되어 있습니다: ${names}` },
        { status: 400 }
      )
    }

    // 경기 시간 미정 가드 — match_time 이 null/invalid 이면 베팅 차단.
    // (deadline 비교가 NaN 으로 빠져서 통과되던 버그 수정)
    const noMatchTimeGames = games.filter((g) => {
      if (!g.match_time) return true
      const t = new Date(g.match_time).getTime()
      return Number.isNaN(t)
    })
    if (noMatchTimeGames.length > 0) {
      const names = noMatchTimeGames
        .map((g) => `${g.home_team_name} vs ${g.away_team_name}`)
        .join(", ")
      return NextResponse.json(
        { error: `경기 시간이 미정인 경기는 베팅할 수 없습니다: ${names}` },
        { status: 400 }
      )
    }

    // 팀 미정 가드 — betman 다음 라운드 preview placeholder 차단
    const placeholderGames = games.filter(
      (g) =>
        !g.home_team_name ||
        !g.away_team_name ||
        g.home_team_name === "미정" ||
        g.away_team_name === "미정"
    )
    if (placeholderGames.length > 0) {
      return NextResponse.json(
        { error: "팀이 확정되지 않은 경기는 베팅할 수 없습니다." },
        { status: 400 }
      )
    }

    // 전반전(반쪽) 마켓 베팅 차단 (2026-06-14, 사용자 요청) — GET 노출 제외와 일치.
    // betman 전반 마켓은 S 접두사(S일반/S핸디캡/S언더오버). SUM/SSUM 은 prediction enum 에서 이미 차단.
    const halfTimeGames = games.filter(
      (g) =>
        typeof g.game_type === "string" &&
        g.game_type.startsWith("S") &&
        g.game_type !== "SUM" &&
        g.game_type !== "SSUM"
    )
    if (halfTimeGames.length > 0) {
      return NextResponse.json({ error: "전반전 마켓은 베팅할 수 없습니다." }, { status: 400 })
    }

    // Check per-game bet deadlines (must bet before kickoff)
    const now = new Date()
    const closedGames = games.filter((g) => {
      const betDeadline = getGameBetDeadline(g.match_time)
      return now >= betDeadline
    })
    if (closedGames.length > 0) {
      const names = closedGames.map((g) => `${g.home_team_name} vs ${g.away_team_name}`).join(", ")
      return NextResponse.json(
        { error: `베팅 마감된 경기가 포함되어 있습니다: ${names}` },
        { status: 400 }
      )
    }

    // Check all games are within the daily window (당일 08:00 초과 ~ 익일 08:00 이하]
    // 시작 exclusive: 8시 정각 킥오프는 당일 발매 불가 경기 / 끝 inclusive: 익일 8시
    // 정각 경기는 전날 슬레이트의 마지막 경기 (GET 노출 규칙과 일치, 2026-07-02)
    const { start: windowStart, end: windowEnd } = getDailyWindow()
    const outOfWindow = games.filter((g) => {
      const t = new Date(g.match_time)
      return t <= windowStart || t > windowEnd
    })
    if (outOfWindow.length > 0) {
      return NextResponse.json(
        { error: "오늘의 베팅 윈도우 밖의 경기가 포함되어 있습니다." },
        { status: 400 }
      )
    }

    // Validate prediction type matches game type
    for (const pred of predictions) {
      const game = games.find((g) => g.id === pred.game_id)
      if (!game) continue

      const isOverUnder = game.game_type.includes("언더오버")
      const isOverUnderPrediction = ["over", "under"].includes(pred.prediction)

      if (isOverUnder && !isOverUnderPrediction) {
        return NextResponse.json(
          { error: "언더오버 경기에는 over 또는 under만 선택할 수 있습니다." },
          { status: 400 }
        )
      }

      if (!isOverUnder && isOverUnderPrediction) {
        return NextResponse.json(
          { error: "일반/핸디캡 경기에는 home, draw, away만 선택할 수 있습니다." },
          { status: 400 }
        )
      }

      if (game.sport === "농구" && pred.prediction === "draw" && !isOverUnder) {
        return NextResponse.json(
          { error: "농구 경기에서는 무승부를 선택할 수 없습니다." },
          { status: 400 }
        )
      }
    }

    // ===== 배당률 검증 (토큰 차감 전) =====
    // 배당이 0/null 인 row 가 있으면 즉시 거부 — 토큰 차감 후에 검증하면
    // 실패 시 토큰만 손실되고 환불 로직이 안 걸림 (환불은 슬립/예측 insert
    // 실패만 커버). 검증은 토큰 차감 이전에 끝낸다.
    const oddsByPrediction: Record<string, Record<string, number>> = {}
    for (const pred of predictions) {
      const game = games.find((g) => g.id === pred.game_id)
      if (!game) continue
      const oddsMap: Record<string, number> = {
        home: parseFloat(String(game.home_win_odds)) || 0,
        away: parseFloat(String(game.away_win_odds)) || 0,
        draw: parseFloat(String(game.draw_odds)) || 0,
        over: parseFloat(String(game.over_odds)) || 0,
        under: parseFloat(String(game.under_odds)) || 0,
      }
      const odds = oddsMap[pred.prediction]
      if (!odds || odds <= 0) {
        return NextResponse.json(
          {
            error: `배당률이 설정되지 않은 경기가 있습니다: ${game.home_team_name} vs ${game.away_team_name}`,
          },
          { status: 400 }
        )
      }
      oddsByPrediction[pred.game_id] = oddsMap
    }

    // ===== 이벤트 슬립 검증 (event_slug 가 있을 때만) =====
    // 등록한 사용자만 + 게임의 league_code 가 events.league_codes 에 있어야 함
    let eventId: string | null = null
    if (event_slug) {
      const { data: ev } = await supabase
        .from("events")
        .select("id, status, league_codes, registration_closes_at, end_at")
        .eq("slug", event_slug)
        .maybeSingle()

      if (!ev) {
        return NextResponse.json({ error: "이벤트를 찾을 수 없습니다." }, { status: 404 })
      }
      if (ev.status !== "live") {
        return NextResponse.json({ error: "현재 이벤트가 진행 중이 아닙니다." }, { status: 400 })
      }
      if (new Date(ev.end_at) < new Date()) {
        return NextResponse.json({ error: "이벤트가 종료되었습니다." }, { status: 400 })
      }
      const codes: string[] = Array.isArray(ev.league_codes) ? ev.league_codes : []
      if (codes.length === 0) {
        return NextResponse.json(
          { error: "이벤트 경기 코드가 아직 배정되지 않았습니다." },
          { status: 400 }
        )
      }

      // 모든 게임의 league_code 가 이벤트 코드 안에 있어야 함
      const offGames = games.filter((g) => !codes.includes(g.league_code as unknown as string))
      if (offGames.length > 0) {
        const names = offGames.map((g) => `${g.home_team_name} vs ${g.away_team_name}`).join(", ")
        return NextResponse.json(
          { error: `이벤트 경기가 아닌 게임이 포함되어 있습니다: ${names}` },
          { status: 400 }
        )
      }

      // 등록한 사용자인지
      const { data: reg } = await supabase
        .from("event_registrations")
        .select("id")
        .eq("event_id", ev.id)
        .eq("user_id", user.id)
        .maybeSingle()
      if (!reg) {
        return NextResponse.json(
          { error: "이벤트 등록이 필요합니다.", needs_registration: true },
          { status: 403 }
        )
      }

      eventId = ev.id
    }

    // ===== 기자 여부 확인 (분석글 저장용) =====
    let isJournalist = false
    if (analysis_text) {
      const { data: userProfile } = await supabase
        .from("profiles")
        .select("is_journalist")
        .eq("user_id", user.id)
        .single()
      isJournalist = !!userProfile?.is_journalist
    }

    // ===== 볼(토큰) 차감 =====
    const stake = betAmount ?? predictions.length

    // Atomic token deduction via RPC
    const { data: spendResult, error: rpcError } = (await supabase
      .rpc("spend_tokens", {
        p_user_id: user.id,
        p_amount: stake,
        p_description: `승부예측 ${predictions.length}경기 ${stake}볼 (${dailyRound.daily_id})`,
      })
      .single()) as {
      data: { success: boolean; remaining_balance: number; error_message: string | null } | null
      error: unknown
    }

    if (rpcError || !spendResult) {
      console.error("Failed to deduct balls:", rpcError)
      return NextResponse.json({ error: "볼 차감 중 오류가 발생했습니다." }, { status: 500 })
    }

    if (!spendResult.success) {
      return NextResponse.json({ error: "볼이 부족합니다." }, { status: 400 })
    }

    const newBalance = spendResult.remaining_balance

    // ===== 슬립 생성 (배당률은 위에서 이미 검증) =====
    // 각 베팅은 독립적인 슬립. 이전 베팅을 삭제하지 않음.
    let totalOdds = 1
    for (const pred of predictions) {
      const odds = oddsByPrediction[pred.game_id]?.[pred.prediction] || 0
      totalOdds *= odds
    }

    const slipInsert: Record<string, unknown> = {
      user_id: user.id,
      daily_round_id: dailyRoundId,
      sport: sports[0],
      stake,
      total_odds: Math.round(totalOdds * 100) / 100,
    }
    if (isJournalist && analysis_text) {
      if (analysis_title) slipInsert.analysis_title = analysis_title
      slipInsert.analysis_text = analysis_text
    }
    if (idempotency_key) slipInsert.idempotency_key = idempotency_key
    if (eventId) slipInsert.event_id = eventId

    const { data: slip, error: slipError } = await supabase
      .from("prediction_slips")
      .insert(slipInsert)
      .select()
      .single()

    if (slipError || !slip) {
      console.error("Failed to create slip:", slipError)
      await retryRefundTokens(supabase, user.id, stake, "슬립 생성 실패 환불")
      return NextResponse.json({ error: "베팅 슬립 생성 중 오류가 발생했습니다." }, { status: 500 })
    }

    // ===== 예측 레코드 삽입 (슬립에 연결) =====
    const predictionRecords = predictions.map((pred) => {
      const game = games.find((g) => g.id === pred.game_id)
      const oddsMap: Record<string, number> = {
        home: parseFloat(game?.home_win_odds) || 0,
        away: parseFloat(game?.away_win_odds) || 0,
        draw: parseFloat(game?.draw_odds) || 0,
        over: parseFloat(game?.over_odds) || 0,
        under: parseFloat(game?.under_odds) || 0,
      }
      return {
        user_id: user.id,
        round_id: games[0].round_id,
        daily_round_id: dailyRoundId,
        game_id: pred.game_id,
        prediction: pred.prediction,
        slip_id: slip.id,
        stake,
        locked_odds: oddsMap[pred.prediction] || 0,
        locked_line: game?.over_under_line ?? null,
        locked_handicap: game?.handicap ?? null,
        created_at: new Date().toISOString(),
      }
    })

    const { data: insertedPredictions, error: insertError } = await supabase
      .from("betman_predictions")
      .insert(predictionRecords)
      .select()

    if (insertError) {
      console.error("Failed to insert predictions:", insertError)
      await supabase.from("prediction_slips").delete().eq("id", slip.id)
      await retryRefundTokens(supabase, user.id, stake, "예측 저장 실패 환불")
      // 같은 경기 중복 예측은 이제 허용(같은 경기·같은 선택에 추가 베팅 가능).
      // 23505 가 남아있다면 idempotency_key 재제출 충돌뿐이므로 409 로 안내.
      const isDuplicate = (insertError as { code?: string }).code === "23505"
      return NextResponse.json(
        {
          error: isDuplicate
            ? "이미 처리된 요청이에요. 잠시 후 다시 시도해 주세요."
            : "예측 저장 중 오류가 발생했습니다.",
        },
        { status: isDuplicate ? 409 : 500 }
      )
    }

    // ===== 예측 활동 피드 + 팔로워 알림 (이벤트 슬립 제외) =====
    // 월드컵 등 이벤트 베팅은 메인 피드/알림에 노출하지 않는다 — 온보딩성 베팅은
    // "전문가 예측" 사회적 신호가 아니므로 prediction_activities/notifications 생략.
    if (!eventId) {
      // ===== 예측 활동 피드 생성 (upsert) =====
      try {
        // 해당 라운드+종목의 총 예측 수 조회
        const { count } = await supabase
          .from("betman_predictions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("daily_round_id", dailyRoundId)

        await supabase.from("prediction_activities").upsert(
          {
            user_id: user.id,
            round_id: games[0].round_id,
            daily_round_id: dailyRoundId,
            sport: sports[0],
            prediction_count: count || predictions.length,
          },
          { onConflict: "user_id,round_id,sport" }
        )
      } catch (e) {
        console.error("Failed to upsert prediction activity:", e)
      }

      // ===== 팔로워에게 알림 전송 =====
      try {
        const { data: followers } = await supabase
          .from("user_follows")
          .select("follower_id")
          .eq("followed_user_id", user.id)

        if (followers && followers.length > 0) {
          const notifications = followers.map((f) => ({
            user_id: f.follower_id,
            type: "expert_prediction",
            actor_id: user.id,
          }))
          await supabase.from("notifications").insert(notifications)
        }
      } catch (e) {
        console.error("Failed to send follower notifications:", e)
      }
    }

    // ===== 픽 분포 (완료 모달용) =====
    // 방금 예측한 경기들의 전체 유저 픽 분포. 커뮤니티 전환 실험(2026-07-02):
    // "다른 사람들은 어디에 걸었나"를 완료 모달에 보여줘 게시판 유입 동기를 만든다.
    // 조회 실패해도 예측 자체는 성공이므로 빈 배열로 응답.
    let pickDistribution: Array<{
      gameId: string
      homeTeam: string
      awayTeam: string
      gameType: string
      myPick: string
      counts: Record<string, number>
      total: number
    }> = []
    try {
      const gameIds = predictions.map((p) => p.game_id)
      const { data: allPicks } = await supabase
        .from("betman_predictions")
        .select("game_id, prediction")
        .in("game_id", gameIds)
        .limit(20000)
      const byGame = new Map<string, Record<string, number>>()
      for (const row of allPicks ?? []) {
        const key = String(row.game_id)
        const m = byGame.get(key) ?? {}
        m[row.prediction] = (m[row.prediction] ?? 0) + 1
        byGame.set(key, m)
      }
      pickDistribution = predictions.map((pred) => {
        const game = games.find((g) => g.id === pred.game_id)
        const counts = byGame.get(String(pred.game_id)) ?? {}
        return {
          gameId: pred.game_id,
          homeTeam: String(game?.home_team_name ?? ""),
          awayTeam: String(game?.away_team_name ?? ""),
          gameType: String(game?.game_type ?? ""),
          myPick: pred.prediction,
          counts,
          total: Object.values(counts).reduce((a, b) => a + b, 0),
        }
      })
    } catch (e) {
      console.error("Failed to compute pick distribution:", e)
    }

    return NextResponse.json({
      success: true,
      slipId: slip.id,
      predictions: insertedPredictions,
      ballsUsed: stake,
      remainingBalls: newBalance,
      message: `${predictions.length}경기 조합 ${stake}볼 베팅 완료! (잔액: ${newBalance}볼)`,
      pickDistribution,
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

/**
 * GET /api/betman/prediction
 *
 * Get user's predictions for a daily round.
 *
 * Query Parameters:
 * - daily_round_id?: uuid
 * - daily_id?: YYYY-MM-DD
 * (defaults to today's daily round)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })
    }

    const supabase = createServiceRoleClient()
    const { searchParams } = new URL(request.url)
    const dailyRoundId = searchParams.get("daily_round_id")
    const dailyId = searchParams.get("daily_id")
    const status = searchParams.get("status")

    // status=all → 최근 슬립 기반 전체 이력 반환
    if (status === "all") {
      const { data: slips, error: slipsError } = await supabase
        .from("prediction_slips")
        .select("*")
        .eq("user_id", user.id)
        .is("event_id", null) // 이벤트(월드컵) 슬립은 메인 내역에서 제외
        .order("created_at", { ascending: false })
        .limit(50)

      if (slipsError) {
        console.error("Failed to fetch slips:", slipsError)
        return NextResponse.json(
          { error: "예측 내역을 가져오는 중 오류가 발생했습니다." },
          { status: 500 }
        )
      }

      if (!slips || slips.length === 0) {
        return NextResponse.json({ predictions: [], slips: [] })
      }

      // 각 슬립의 예측들 조회
      const slipIds = slips.map((s) => s.id)
      const { data: allPreds } = await supabase
        .from("betman_predictions")
        .select("*, game:betman_games(*)")
        .in("slip_id", slipIds)

      // 슬립별로 그룹화
      const slipHistory = slips.map((slip) => {
        const preds = (allPreds || []).filter((p) => p.slip_id === slip.id)
        const allSettled = preds.length > 0 && preds.every((p) => p.status !== "pending")
        const allCorrect = preds.length > 0 && preds.every((p) => p.is_correct === true)
        const anyWrong = preds.some((p) => p.is_correct === false)

        let slipStatus = "pending"
        if (slip.status === "won") slipStatus = "win"
        else if (slip.status === "lost") slipStatus = "lose"
        else if (slip.status === "cancelled") slipStatus = "cancelled"
        else if (allSettled) slipStatus = allCorrect ? "win" : "lose"

        const profit =
          slipStatus === "win"
            ? Math.round(slip.stake * slip.total_odds) - slip.stake
            : slipStatus === "lose"
              ? -slip.stake
              : 0

        const selectionMap: Record<string, string> = {
          home: "홈팀",
          away: "원정팀",
          draw: "무",
          over: "오버",
          under: "언더",
        }

        return {
          id: slip.id,
          date: slip.created_at,
          sport: slip.sport,
          stake: slip.stake,
          totalOdds: slip.total_odds,
          status: slipStatus,
          profit,
          matches: preds.map((p) => {
            const g = p.game as Record<string, unknown> | null
            const oddsMap: Record<string, string> = {
              home: "home_win_odds",
              away: "away_win_odds",
              draw: "draw_odds",
              over: "over_odds",
              under: "under_odds",
            }
            const matchResult =
              p.is_correct === true ? "win" : p.is_correct === false ? "lose" : "pending"
            // 정답: DB의 result 필드 (home/away/draw/over/under)를 한글 라벨로 변환
            const dbResult = g?.result as string | null
            const correctAnswer = dbResult ? selectionMap[dbResult] || dbResult : undefined
            return {
              league: (g?.league_code as string) || "기타",
              home: (g?.home_team_name as string) || "홈팀",
              away: (g?.away_team_name as string) || "원정팀",
              selection: selectionMap[p.prediction] || p.prediction,
              odds: parseFloat(String(g?.[oddsMap[p.prediction] || "home_win_odds"])) || 0,
              homeOdds: parseFloat(String(g?.home_win_odds)) || 0,
              awayOdds: parseFloat(String(g?.away_win_odds)) || 0,
              drawOdds: parseFloat(String(g?.draw_odds)) || 0,
              overOdds: parseFloat(String(g?.over_odds)) || 0,
              underOdds: parseFloat(String(g?.under_odds)) || 0,
              result: matchResult,
              correctAnswer,
            }
          }),
        }
      })

      return NextResponse.json({ slips: slipHistory })
    }

    // 기본: 특정 일자의 raw predictions 반환
    let targetDailyRoundId = dailyRoundId
    if (!targetDailyRoundId) {
      const targetDate = dailyId || getTodayDailyId()
      const { data: dailyRound } = await supabase
        .from("betman_daily_rounds")
        .select("id")
        .eq("daily_id", targetDate)
        .single()

      if (!dailyRound) {
        return NextResponse.json({
          predictions: [],
          message: "해당 일자의 라운드가 없습니다.",
        })
      }
      targetDailyRoundId = dailyRound.id
    }

    // Get user's predictions with game details
    const { data: predictions, error: predError } = await supabase
      .from("betman_predictions")
      .select(
        `
        *,
        game:betman_games(*)
      `
      )
      .eq("user_id", user.id)
      .eq("daily_round_id", targetDailyRoundId)

    if (predError) {
      console.error("Failed to fetch predictions:", predError)
      return NextResponse.json(
        { error: "예측 정보를 가져오는 중 오류가 발생했습니다." },
        { status: 500 }
      )
    }

    return NextResponse.json({
      predictions: predictions || [],
      daily_round_id: targetDailyRoundId,
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { getGameBetDeadline, getDailyWindow, getTodayDailyId } from "@/lib/betman/daily-round"
import { apiError, apiBadRequest } from "@/lib/api-error"
import { z } from "zod"

const predictionItemSchema = z.object({
  game_id: z.string().min(1, "게임 ID가 필요합니다."),
  prediction: z.enum(["home", "draw", "away", "over", "under"], {
    message: "잘못된 예측 값입니다.",
  }),
})

const predictionPostSchema = z.object({
  predictions: z.array(predictionItemSchema).min(1, "예측 데이터가 필요합니다."),
  betAmount: z.number().int().min(1, "베팅 금액은 1볼 이상이어야 합니다.").optional(),
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

    const { createServiceRoleClient } = await import("@/lib/supabase/server")
    const supabase = createServiceRoleClient()
    const body = await request.json()
    const parsed = predictionPostSchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.errors[0]?.message || "잘못된 예측 데이터입니다.")
    }
    const { predictions, betAmount } = parsed.data

    // Get all game details for validation
    const gameIds = predictions.map((p) => p.game_id)
    const { data: games, error: gamesError } = await supabase
      .from("betman_games")
      .select("*")
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

    if (dailyRound.status !== "open") {
      return NextResponse.json({ error: "이 일일 라운드는 마감되었습니다." }, { status: 400 })
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

    // Check all games are within the daily window [08:00 KST today, 08:00 KST tomorrow)
    const { end: windowEnd } = getDailyWindow()
    const outOfWindow = games.filter((g) => new Date(g.match_time) >= windowEnd)
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
      data: { success: boolean; new_balance: number; error_message: string | null } | null
      error: unknown
    }

    if (rpcError || !spendResult) {
      console.error("Failed to deduct balls:", rpcError)
      return NextResponse.json({ error: "볼 차감 중 오류가 발생했습니다." }, { status: 500 })
    }

    if (!spendResult.success) {
      return NextResponse.json({ error: "볼이 부족합니다." }, { status: 400 })
    }

    const newBalance = spendResult.new_balance

    // ===== 베팅 슬립(조합) 생성 =====
    // 각 베팅은 독립적인 슬립. 이전 베팅을 삭제하지 않음.
    const totalOdds = predictions.reduce((acc, pred) => {
      const game = games.find((g) => g.id === pred.game_id)
      if (!game) return acc
      const oddsMap: Record<string, number> = {
        home: parseFloat(game.home_win_odds) || 0,
        away: parseFloat(game.away_win_odds) || 0,
        draw: parseFloat(game.draw_odds) || 0,
        over: parseFloat(game.over_odds) || 0,
        under: parseFloat(game.under_odds) || 0,
      }
      return acc * (oddsMap[pred.prediction] || 1)
    }, 1)

    const { data: slip, error: slipError } = await supabase
      .from("prediction_slips")
      .insert({
        user_id: user.id,
        daily_round_id: dailyRoundId,
        sport: sports[0],
        stake,
        total_odds: Math.round(totalOdds * 100) / 100,
      })
      .select()
      .single()

    if (slipError || !slip) {
      console.error("Failed to create slip:", slipError)
      await supabase.rpc("refund_tokens", {
        p_user_id: user.id,
        p_amount: stake,
        p_description: "슬립 생성 실패 환불",
      })
      return NextResponse.json({ error: "베팅 슬립 생성 중 오류가 발생했습니다." }, { status: 500 })
    }

    // ===== 예측 레코드 삽입 (슬립에 연결) =====
    const predictionRecords = predictions.map((pred) => ({
      user_id: user.id,
      round_id: games[0].round_id,
      daily_round_id: dailyRoundId,
      game_id: pred.game_id,
      prediction: pred.prediction,
      slip_id: slip.id,
      stake,
      created_at: new Date().toISOString(),
    }))

    const { data: insertedPredictions, error: insertError } = await supabase
      .from("betman_predictions")
      .insert(predictionRecords)
      .select()

    if (insertError) {
      console.error("Failed to insert predictions:", insertError)
      // 슬립 삭제 + 환불
      await supabase.from("prediction_slips").delete().eq("id", slip.id)
      await supabase.rpc("refund_tokens", {
        p_user_id: user.id,
        p_amount: stake,
        p_description: "예측 저장 실패 환불",
      })
      return NextResponse.json({ error: "예측 저장 중 오류가 발생했습니다." }, { status: 500 })
    }

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

    return NextResponse.json({
      success: true,
      slipId: slip.id,
      predictions: insertedPredictions,
      ballsUsed: stake,
      remainingBalls: newBalance,
      message: `${predictions.length}경기 조합 ${stake}볼 베팅 완료! (잔액: ${newBalance}볼)`,
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

    const { createServiceRoleClient } = await import("@/lib/supabase/server")
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
        .order("created_at", { ascending: false })
        .limit(50)

      if (slipsError) {
        console.error("Failed to fetch slips:", slipsError)
        return NextResponse.json(
          { error: "예측 내역을 가져오는 중 오류가 발생했습니다." },
          { status: 500 }
        )
      }

      // 슬립 없는 레거시 예측도 조회
      const { data: legacyPreds } = await supabase
        .from("betman_predictions")
        .select("*, game:betman_games(*)")
        .eq("user_id", user.id)
        .is("slip_id", null)
        .order("created_at", { ascending: false })
        .limit(100)

      if ((!slips || slips.length === 0) && (!legacyPreds || legacyPreds.length === 0)) {
        return NextResponse.json({ predictions: [], slips: [] })
      }

      // 각 슬립의 예측들 조회
      const slipIds = (slips || []).map((s) => s.id)
      const { data: allPreds } =
        slipIds.length > 0
          ? await supabase
              .from("betman_predictions")
              .select("*, game:betman_games(*)")
              .in("slip_id", slipIds)
          : { data: [] as typeof legacyPreds }

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
            const selectionMap: Record<string, string> = {
              home: "홈팀",
              away: "원정팀",
              draw: "무",
              over: "오버",
              under: "언더",
            }
            const oddsMap: Record<string, string> = {
              home: "home_win_odds",
              away: "away_win_odds",
              draw: "draw_odds",
              over: "over_odds",
              under: "under_odds",
            }
            return {
              league: (g?.league_code as string) || "기타",
              home: (g?.home_team_name as string) || "홈팀",
              away: (g?.away_team_name as string) || "원정팀",
              selection: selectionMap[p.prediction] || p.prediction,
              odds: parseFloat(String(g?.[oddsMap[p.prediction] || "home_win_odds"])) || 0,
              result: p.is_correct === true ? "win" : p.is_correct === false ? "lose" : "pending",
            }
          }),
        }
      })

      // 레거시 예측 (slip 없음)을 개별 가상 슬립으로 변환
      const legacyHistory = (legacyPreds || []).map((p) => {
        const g = p.game as Record<string, unknown> | null
        const selectionMap: Record<string, string> = {
          home: "홈팀",
          away: "원정팀",
          draw: "무",
          over: "오버",
          under: "언더",
        }
        const oddsMap: Record<string, string> = {
          home: "home_win_odds",
          away: "away_win_odds",
          draw: "draw_odds",
          over: "over_odds",
          under: "under_odds",
        }
        const predStake = p.stake ?? 1
        const odds = parseFloat(String(g?.[oddsMap[p.prediction] || "home_win_odds"])) || 0

        let legacyStatus = "pending"
        if (p.is_correct === true) legacyStatus = "win"
        else if (p.is_correct === false) legacyStatus = "lose"

        return {
          id: p.id,
          date: p.created_at,
          sport: (g?.sport as string) || "축구",
          stake: predStake,
          totalOdds: odds,
          status: legacyStatus,
          profit:
            legacyStatus === "win"
              ? Math.round(predStake * odds) - predStake
              : legacyStatus === "lose"
                ? -predStake
                : 0,
          matches: [
            {
              league: (g?.league_code as string) || "기타",
              home: (g?.home_team_name as string) || "홈팀",
              away: (g?.away_team_name as string) || "원정팀",
              selection: selectionMap[p.prediction] || p.prediction,
              odds,
              result: legacyStatus,
            },
          ],
        }
      })

      // 합치고 날짜순 정렬
      const allHistory = [...slipHistory, ...legacyHistory]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 50)

      return NextResponse.json({ slips: allHistory })
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

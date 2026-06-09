import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiUnauthorized } from "@/lib/api-error"
import { createServiceRoleClient } from "@/lib/supabase/server"

interface PredGame {
  home_team_name: string
  away_team_name: string
  match_time: string
  game_type: string
  sport: string
  result: string | null
  league_code: string | null
  home_win_odds: string | null
  away_win_odds: string | null
  draw_odds: string | null
  over_odds: string | null
  under_odds: string | null
  home_score: number | null
  away_score: number | null
  venue: string | null
  handicap: number | null
  over_under_line: number | null
}

interface PredSlip {
  id: string
  stake: number
  total_odds: number
  status: string
  analysis_title: string | null
  analysis_text: string | null
  event_id: string | null
}

/**
 * 총 배당률 → 공개용 범위 버킷.
 * 역산 방지를 위해 구매 전 carousel에 정확값 대신 버킷만 노출한다.
 */
function bucketTotalOdds(odds: number): string {
  if (!odds || odds <= 0) return "—"
  if (odds < 2) return "2배 미만"
  if (odds < 3) return "2배대"
  if (odds < 4) return "3배대"
  if (odds < 5) return "4배대"
  if (odds < 10) return "5~9배"
  if (odds < 50) return "10~49배"
  if (odds < 100) return "50~99배"
  return "100배 이상"
}

/**
 * GET /api/feed/predictions
 *
 * 팔로우한 유저들의 예측 활동 피드
 * 각 activity에 대해 구매 여부 체크, 구매한 경우 예측 데이터 포함
 */
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) {
      return apiUnauthorized()
    }

    const supabase = createServiceRoleClient()

    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50)
    const offset = parseInt(searchParams.get("offset") || "0")

    // 1. 팔로우하는 유저 목록
    const { data: follows } = await supabase
      .from("user_follows")
      .select("followed_user_id")
      .eq("follower_id", user.id)

    if (!follows || follows.length === 0) {
      return NextResponse.json({ activities: [] })
    }

    const followedIds = follows.map((f) => f.followed_user_id)

    // 2. 팔로우한 유저들의 prediction_activities 조회
    const { data: activities, error: actError } = await supabase
      .from("prediction_activities")
      .select(
        `
        id, user_id, round_id, sport, prediction_count, created_at
      `
      )
      .in("user_id", followedIds)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (actError) {
      return apiError("피드를 불러오는 중 오류가 발생했습니다.", 500, actError)
    }

    if (!activities || activities.length === 0) {
      return NextResponse.json({ activities: [] })
    }

    // 3~7. 독립 쿼리 5개 병렬 실행
    const activityIds = activities.map((a) => a.id)
    const userIds = [...new Set(activities.map((a) => a.user_id))]
    const roundIds = [...new Set(activities.map((a) => a.round_id))]

    const [
      { data: purchases },
      { data: profiles },
      { data: stats },
      { data: rounds },
      { data: allPreds },
    ] = await Promise.all([
      // 3. 구매 여부 체크
      supabase
        .from("prediction_purchases")
        .select("activity_id")
        .eq("buyer_id", user.id)
        .in("activity_id", activityIds),
      // 4. 프로필 조회
      supabase.from("profiles").select("user_id, nickname, avatar_url").in("user_id", userIds),
      // 5. 유저 스탯 조회 (전체 종목)
      supabase
        .from("betman_user_sport_stats")
        .select("user_id, accuracy, net_profit, current_streak")
        .in("user_id", userIds)
        .eq("sport", "전체"),
      // 6. 라운드 정보 조회
      supabase.from("betman_rounds").select("id, year, round, status").in("id", roundIds),
      // 7. 모든 활동의 예측 데이터 일괄 조회
      supabase
        .from("betman_predictions")
        .select(
          `
          id, user_id, round_id, game_id, prediction, status, slip_id, stake,
          game:betman_games(home_team_name, away_team_name, match_time, game_type, sport, result,
            league_code, home_win_odds, away_win_odds, draw_odds, over_odds, under_odds,
            home_score, away_score, venue, handicap, over_under_line),
          slip:prediction_slips(id, stake, total_odds, status, analysis_title, analysis_text, event_id)
        `
        )
        .in("user_id", userIds)
        .in("round_id", roundIds),
    ])

    const purchasedSet = new Set(purchases?.map((p) => p.activity_id) || [])
    const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || [])
    const statsMap = new Map(stats?.map((s) => [s.user_id, s]) || [])
    const roundMap = new Map(rounds?.map((r) => [r.id, r]) || [])

    // Supabase 조인 결과에서 단일 객체를 추출하는 헬퍼
    const getGame = (p: NonNullable<typeof allPreds>[number]): PredGame | null => {
      const g = p.game
      if (!g) return null
      return ((Array.isArray(g) ? g[0] : g) as PredGame | undefined) ?? null
    }
    const getSlip = (p: NonNullable<typeof allPreds>[number]): PredSlip | null => {
      const s = (p as Record<string, unknown>).slip
      if (!s) return null
      return ((Array.isArray(s) ? s[0] : s) as PredSlip | undefined) ?? null
    }

    // 활동별로 예측 그룹핑 — 이벤트(월드컵) 슬립 예측은 제외.
    // 이벤트 베팅은 애초에 prediction_activities 도 안 만들지만, 같은 betman 라운드에
    // 일반+이벤트 베팅이 섞이면 round_id 매칭으로 딸려올 수 있어 슬립 단에서 한 번 더 차단.
    const predictionsMap = new Map<string, typeof allPreds>()
    for (const act of activities) {
      const preds =
        allPreds?.filter(
          (p) => p.user_id === act.user_id && p.round_id === act.round_id && !getSlip(p)?.event_id
        ) || []
      predictionsMap.set(act.id, preds)
    }

    // 경기 시간이 모두 지났는지 확인하는 함수
    const now = new Date()
    const isAllGamesExpired = (preds: NonNullable<typeof allPreds>) => {
      return (
        preds.length > 0 &&
        preds.every((p) => {
          const g = getGame(p)
          return g && new Date(g.match_time) < now
        })
      )
    }

    // Helper: build slipGroups from predictions
    // isLocked=true일 때 정확한 배당·본문·슬립 상세를 서버 단에서 마스킹.
    const buildSlipGroups = (preds: NonNullable<typeof allPreds>, isLocked: boolean) => {
      // Group by slip_id (or round_id for legacy)
      const bySlip = new Map<string, typeof preds>()
      for (const pred of preds) {
        const key = pred.slip_id || pred.round_id || "unknown"
        if (!bySlip.has(key)) bySlip.set(key, [])
        bySlip.get(key)!.push(pred)
      }

      return Array.from(bySlip.entries()).map(([slipId, slipPreds]) => {
        const first = slipPreds[0]
        const game0 = getGame(first)
        const slip0 = getSlip(first)
        const sport = game0?.sport || "스포츠"

        // Determine slip status
        const allSettled = slipPreds.every((p) => p.status === "settled")
        const allCorrect = slipPreds.every((p) => {
          const g = getGame(p)
          return g?.result && g.result === p.prediction
        })
        const anyWrong = slipPreds.some((p) => {
          const g = getGame(p)
          return g?.result && g.result !== p.prediction
        })
        const slipStatus = !allSettled ? "pending" : allCorrect ? "win" : "lose"

        // Calculate total odds from slip or from individual games
        const totalOdds =
          slip0?.total_odds ||
          slipPreds.reduce((acc: number, p) => {
            const g = getGame(p)
            let odds = 1
            if (p.prediction === "home") odds = parseFloat(g?.home_win_odds ?? "0") || 1
            else if (p.prediction === "away") odds = parseFloat(g?.away_win_odds ?? "0") || 1
            else if (p.prediction === "draw") odds = parseFloat(g?.draw_odds ?? "0") || 1
            else if (p.prediction === "over") odds = parseFloat(g?.over_odds ?? "0") || 1
            else if (p.prediction === "under") odds = parseFloat(g?.under_odds ?? "0") || 1
            return acc * odds
          }, 1)

        const stake = slip0?.stake || first.stake || slipPreds.length
        const profit =
          slipStatus === "win"
            ? Math.round(stake * totalOdds - stake)
            : slipStatus === "lose"
              ? -stake
              : 0

        // Match time for date display
        const matchDate = game0?.match_time
          ? new Date(game0.match_time).toLocaleDateString("ko-KR", {
              month: "2-digit",
              day: "2-digit",
            })
          : ""

        const resultLabelMap: Record<string, string> = {
          home: "홈팀",
          away: "원정팀",
          draw: "무",
          over: "오버",
          under: "언더",
        }

        const matches = slipPreds.map((p) => {
          const g = getGame(p)
          let odds = 1
          let selection = ""
          if (p.prediction === "home") {
            odds = parseFloat(g?.home_win_odds ?? "0") || 1
            selection = "홈팀"
          } else if (p.prediction === "away") {
            odds = parseFloat(g?.away_win_odds ?? "0") || 1
            selection = "원정팀"
          } else if (p.prediction === "draw") {
            odds = parseFloat(g?.draw_odds ?? "0") || 1
            selection = "무"
          } else if (p.prediction === "over") {
            odds = parseFloat(g?.over_odds ?? "0") || 1
            selection = "오버"
          } else if (p.prediction === "under") {
            odds = parseFloat(g?.under_odds ?? "0") || 1
            selection = "언더"
          }

          // Normalize result to per-match status
          const dbResult = g?.result ?? undefined
          let matchResult = "pending"
          if (dbResult) {
            matchResult = dbResult === p.prediction ? "win" : "lose"
          }
          const correctAnswer = dbResult ? resultLabelMap[dbResult] || dbResult : undefined

          return {
            league: g?.league_code || "",
            home: g?.home_team_name || "",
            away: g?.away_team_name || "",
            selection,
            odds: Math.round(odds * 100) / 100,
            homeOdds: Math.round((parseFloat(g?.home_win_odds ?? "0") || 0) * 100) / 100,
            awayOdds: Math.round((parseFloat(g?.away_win_odds ?? "0") || 0) * 100) / 100,
            drawOdds: Math.round((parseFloat(g?.draw_odds ?? "0") || 0) * 100) / 100,
            overOdds: Math.round((parseFloat(g?.over_odds ?? "0") || 0) * 100) / 100,
            underOdds: Math.round((parseFloat(g?.under_odds ?? "0") || 0) * 100) / 100,
            result: matchResult,
            correctAnswer,
            gameType: g?.game_type || "일반",
            matchTime: g?.match_time || null,
            homeScore: g?.home_score ?? null,
            awayScore: g?.away_score ?? null,
            venue: g?.venue || null,
            handicap: g?.handicap ?? null,
            overUnderLine: g?.over_under_line ?? null,
          }
        })

        const totalOddsRounded = Math.round(totalOdds * 100) / 100
        const totalOddsRange = bucketTotalOdds(totalOddsRounded)

        // 공통(공개 허용): slipId, sport, date, status, 경기 수, 제목, 배당 범위
        const publicFields = {
          slipId,
          sport,
          date: matchDate,
          status: slipStatus,
          matchCount: slipPreds.length,
          analysisTitle: slip0?.analysis_title ?? null,
          totalOddsRange,
        }

        // Locked: 정확한 배당·본문·슬립 내역·stake·profit 모두 마스킹
        if (isLocked) {
          return {
            ...publicFields,
            stake: 0,
            totalOdds: 0,
            profit: 0,
            matches: [] as typeof matches,
            analysisText: null as string | null,
          }
        }

        return {
          ...publicFields,
          stake,
          totalOdds: totalOddsRounded,
          profit,
          matches,
          analysisText: slip0?.analysis_text ?? null,
        }
      })
    }

    // 8. 응답 조합
    const result = activities.map((act) => {
      const profile = profileMap.get(act.user_id)
      const stat = statsMap.get(act.user_id)
      const round = roundMap.get(act.round_id)
      const isPurchased = purchasedSet.has(act.id)
      const preds = predictionsMap.get(act.id) || []
      const isFree = isAllGamesExpired(preds)
      const showPredictions = isPurchased || isFree

      return {
        id: act.id,
        user_id: act.user_id,
        round_id: act.round_id,
        sport: act.sport,
        prediction_count: act.prediction_count,
        created_at: act.created_at,
        profile: profile
          ? {
              nickname: profile.nickname,
              avatar_url: profile.avatar_url,
            }
          : { nickname: "익명", avatar_url: null },
        stats: stat
          ? {
              accuracy: parseFloat(stat.accuracy) || 0,
              net_profit: parseFloat(stat.net_profit) || 0,
              current_streak: stat.current_streak || 0,
            }
          : null,
        round: round
          ? {
              year: round.year,
              round: round.round,
              status: round.status,
            }
          : null,
        is_purchased: isPurchased,
        is_free: isFree,
        predictions: showPredictions ? preds : null,
        // Locked 상태에서도 slipGroups는 마스킹된 공개 필드(제목/배당 범위/경기 수)만 포함.
        // Unlocked 상태에서는 full 데이터.
        slipGroups: buildSlipGroups(preds, !showPredictions),
      }
    })

    return NextResponse.json({ activities: result })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

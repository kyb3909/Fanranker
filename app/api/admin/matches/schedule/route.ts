import { NextRequest, NextResponse } from "next/server"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { apiError, apiBadRequest } from "@/lib/api-error"
import { getDailyWindow, formatDailyIdLabel } from "@/lib/betman/daily-round"

export const dynamic = "force-dynamic"

const RESULT_LABELS: Record<string, string> = {
  home: "홈승",
  away: "원정승",
  draw: "무승부",
  over: "오버",
  under: "언더",
  odd: "홀",
  even: "짝",
  cancelled: "취소",
}

type Phase = "진행전" | "진행중" | "경기후" | "결과입력됨"

function getPhase(
  matchTime: string,
  status: string | null,
  result: string | null,
  now: Date
): Phase {
  const mt = new Date(matchTime).getTime()
  if (mt > now.getTime()) return "진행전"
  if (result != null && result !== "") return "결과입력됨"
  if (status === "in_progress" || status === "finished") return "경기후"
  return "진행중"
}

/**
 * GET /api/admin/matches/schedule
 *
 * 23:00 KST 리셋 기준 하루치 경기 일정표.
 * date=YYYY-MM-DD (기본: 오늘 daily_id). 해당 날짜 08:00 KST ~ 익일 08:00 KST 경기 전부 반환.
 * 경기 시간 지나도 사라지지 않고, 진행전/진행중/경기후/결과입력됨 + 적중 결과 포함.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const { searchParams } = new URL(request.url)
    const dateParam = searchParams.get("date") // YYYY-MM-DD
    if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return apiBadRequest("날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)")
    }

    const { start, end, dailyId } = getDailyWindow(dateParam || undefined)
    const now = new Date()

    const { data: games, error } = await supabase
      .from("betman_games")
      .select(
        "id, game_no, sport, game_type, home_team_name, away_team_name, match_time, status, result, home_score, away_score, handicap, over_under_line"
      )
      .gte("match_time", start.toISOString())
      .lt("match_time", end.toISOString())
      .order("match_time", { ascending: true })
      .order("game_no", { ascending: true })

    if (error) {
      return apiError("일정표를 가져오는 중 오류가 발생했습니다.", 500, error)
    }

    const gameIds = (games || []).map((g) => g.id)
    let predCountMap = new Map<string, number>()
    if (gameIds.length > 0) {
      const { data: predCounts } = await supabase
        .from("betman_predictions")
        .select("game_id")
        .in("game_id", gameIds)
      if (predCounts) {
        for (const p of predCounts) {
          predCountMap.set(p.game_id, (predCountMap.get(p.game_id) || 0) + 1)
        }
      }
    }

    const schedule = (games || []).map((g) => {
      const phase = getPhase(g.match_time, g.status, g.result, now)
      return {
        id: g.id,
        game_no: g.game_no,
        sport: g.sport,
        game_type: g.game_type,
        home_team: g.home_team_name,
        away_team: g.away_team_name,
        match_time: g.match_time,
        status: g.status,
        result: g.result,
        result_label: g.result ? (RESULT_LABELS[g.result] ?? g.result) : null,
        home_score: g.home_score,
        away_score: g.away_score,
        handicap: g.handicap,
        over_under_line: g.over_under_line,
        phase,
        prediction_count: predCountMap.get(g.id) ?? 0,
      }
    })

    return NextResponse.json({
      dailyId,
      label: formatDailyIdLabel(dailyId),
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
      games: schedule,
      total: schedule.length,
    })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

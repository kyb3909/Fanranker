import { NextResponse } from "next/server"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { apiError } from "@/lib/api-error"

export const dynamic = "force-dynamic"

interface IntegrityIssue {
  type: "missing" | "mismatch" | "status"
  severity: "error" | "warning"
  gameId: string
  gameNo: number
  roundGmTs: string
  teams: string
  matchTime: string
  message: string
  details?: string
}

/**
 * GET /api/admin/data-integrity
 *
 * betman_games 데이터 정합성 검사.
 * 빈 칸(누락), 불일치, 상태 비정상을 감지하여 반환.
 */
export async function GET() {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth

    const { supabase } = auth
    const issues: IntegrityIssue[] = []
    const now = new Date()

    // 최근 7일 + 활성 라운드의 경기만 검사 (범위 제한)
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: games } = await supabase
      .from("betman_games")
      .select(
        `
        id, game_no, match_time, sport, game_type, status, result,
        home_team_name, away_team_name,
        home_score, away_score,
        home_win_odds, draw_odds, away_win_odds,
        over_odds, under_odds, odd_odds, even_odds,
        handicap, over_under_line,
        betman_rounds!inner ( gm_ts )
      `
      )
      .gte("match_time", weekAgo)
      .order("match_time", { ascending: false })
      .limit(500)

    if (!games || games.length === 0) {
      return NextResponse.json({ issues: [], summary: { total: 0, error: 0, warning: 0 } })
    }

    // 라이브룸 상태도 조회
    const gameIds = games.map((g) => g.id)
    const { data: liveRooms } = await supabase
      .from("live_rooms")
      .select("game_id, status")
      .in("game_id", gameIds)

    const roomMap = new Map((liveRooms ?? []).map((r) => [r.game_id, r.status]))

    for (const game of games) {
      const round = game.betman_rounds as unknown as { gm_ts: string }
      const gmTs = round?.gm_ts ?? "?"
      const teams = `${game.home_team_name} vs ${game.away_team_name}`
      const matchTime = game.match_time
      const base = {
        gameId: game.id,
        gameNo: game.game_no,
        roundGmTs: gmTs,
        teams,
        matchTime,
      }

      // ── 1. 배당률 누락 (Missing odds) ──
      if (game.game_type === "일반") {
        const missingOdds = []
        if (game.home_win_odds == null) missingOdds.push("승")
        if (game.draw_odds == null) missingOdds.push("무")
        if (game.away_win_odds == null) missingOdds.push("패")
        if (missingOdds.length > 0) {
          issues.push({
            ...base,
            type: "missing",
            severity: "warning",
            message: `일반 배당률 누락: ${missingOdds.join(", ")}`,
          })
        }
      }

      if (game.game_type === "핸디캡") {
        const missing = []
        if (game.handicap == null) missing.push("핸디캡 값")
        if (game.home_win_odds == null) missing.push("승 배당")
        if (game.away_win_odds == null) missing.push("패 배당")
        if (missing.length > 0) {
          issues.push({
            ...base,
            type: "missing",
            severity: "warning",
            message: `핸디캡 데이터 누락: ${missing.join(", ")}`,
          })
        }
      }

      if (game.game_type === "언더오버") {
        const missing = []
        if (game.over_under_line == null) missing.push("기준점")
        if (game.over_odds == null) missing.push("오버 배당")
        if (game.under_odds == null) missing.push("언더 배당")
        if (missing.length > 0) {
          issues.push({
            ...base,
            type: "missing",
            severity: "warning",
            message: `언더오버 데이터 누락: ${missing.join(", ")}`,
          })
        }
      }

      // ── 2. 결과/점수 불일치 (Result mismatch) ──
      // 베트맨은 결과 업데이트가 느림 → 경기 시작 후 최소 2시간 유예
      const isPast = new Date(game.match_time) < now
      const RESULT_GRACE_HOURS = 2
      const hoursAfterKickoff =
        (now.getTime() - new Date(game.match_time).getTime()) / (1000 * 60 * 60)
      const pastGracePeriod = hoursAfterKickoff > RESULT_GRACE_HOURS

      if (game.status === "completed" && pastGracePeriod) {
        // completed인데 result 없음 (유예 후에만 알림)
        if (game.result == null) {
          issues.push({
            ...base,
            type: "missing",
            severity: "error",
            message: "경기 완료(completed)인데 결과(result) 미입력",
            details: `경기 시작 ${Math.floor(hoursAfterKickoff)}시간 경과`,
          })
        }

        // completed인데 점수 없음
        if (game.home_score == null || game.away_score == null) {
          issues.push({
            ...base,
            type: "missing",
            severity: "error",
            message: "경기 완료(completed)인데 점수 누락",
            details: `홈: ${game.home_score ?? "없음"}, 원정: ${game.away_score ?? "없음"}`,
          })
        }

        // 일반 타입: 점수와 result 교차 검증
        if (
          game.game_type === "일반" &&
          game.result &&
          game.home_score != null &&
          game.away_score != null
        ) {
          const expected = deriveResult(game.home_score, game.away_score)
          if (expected && game.result !== expected && game.result !== "cancelled") {
            issues.push({
              ...base,
              type: "mismatch",
              severity: "error",
              message: `결과 불일치: 저장=${game.result}, 점수 기반(wisetoto)=${expected}`,
              details: `${game.home_score} : ${game.away_score} (경기 후 ${Math.floor(hoursAfterKickoff)}시간)`,
            })
          }
        }
      }

      // in_progress인데 점수 있으면서 result도 있지만 점수와 안 맞는 경우 (즉시 경고)
      if (
        game.status === "in_progress" &&
        game.game_type === "일반" &&
        game.result &&
        game.home_score != null &&
        game.away_score != null
      ) {
        const expected = deriveResult(game.home_score, game.away_score)
        if (expected && game.result !== expected && game.result !== "cancelled") {
          issues.push({
            ...base,
            type: "mismatch",
            severity: "warning",
            message: `진행 중 결과 불일치: result=${game.result}, 점수=${expected}`,
            details: `${game.home_score} : ${game.away_score}`,
          })
        }
      }

      // ── 3. 상태 비정상 (Status anomalies) ──

      // 시작 시간 2시간 이상 경과인데 scheduled
      if (game.status === "scheduled" && hoursAfterKickoff > 2) {
        issues.push({
          ...base,
          type: "status",
          severity: "error",
          message: `경기 시작 ${Math.floor(hoursAfterKickoff)}시간 경과인데 여전히 scheduled`,
        })
      }

      // 점수가 있는데 scheduled
      if (game.status === "scheduled" && game.home_score != null && game.away_score != null) {
        issues.push({
          ...base,
          type: "status",
          severity: "error",
          message: "점수가 입력되었는데 status가 scheduled",
          details: `${game.home_score} : ${game.away_score}`,
        })
      }

      // in_progress가 6시간 이상 지속
      if (game.status === "in_progress" && hoursAfterKickoff > 6) {
        issues.push({
          ...base,
          type: "status",
          severity: "warning",
          message: `in_progress 상태 ${Math.floor(hoursAfterKickoff)}시간 지속 (결과 미수신)`,
        })
      }

      // ── 4. 라이브룸 상태 불일치 ──
      if (game.game_type === "일반") {
        const roomStatus = roomMap.get(game.id)

        // 경기 있는데 라이브룸이 없고, 경기 시작 후 5시간 이내
        if (!roomStatus && isPast && hoursAfterKickoff < 5) {
          issues.push({
            ...base,
            type: "status",
            severity: "warning",
            message: "진행 중/최근 경기인데 라이브룸 없음",
          })
        }

        // 경기 in_progress인데 룸이 waiting/scheduled
        if (
          game.status === "in_progress" &&
          roomStatus &&
          (roomStatus === "scheduled" || roomStatus === "waiting")
        ) {
          issues.push({
            ...base,
            type: "mismatch",
            severity: "warning",
            message: `경기 in_progress인데 라이브룸 ${roomStatus}`,
          })
        }

        // 경기 completed인데 룸이 아직 live
        if (game.status === "completed" && roomStatus === "live") {
          issues.push({
            ...base,
            type: "mismatch",
            severity: "warning",
            message: "경기 completed인데 라이브룸 아직 live",
          })
        }
      }
    }

    // severity 순 정렬: error 먼저
    issues.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1
      return new Date(b.matchTime).getTime() - new Date(a.matchTime).getTime()
    })

    const summary = {
      total: issues.length,
      error: issues.filter((i) => i.severity === "error").length,
      warning: issues.filter((i) => i.severity === "warning").length,
      byType: {
        missing: issues.filter((i) => i.type === "missing").length,
        mismatch: issues.filter((i) => i.type === "mismatch").length,
        status: issues.filter((i) => i.type === "status").length,
      },
    }

    return NextResponse.json({ issues, summary, checkedAt: now.toISOString() })
  } catch (error) {
    return apiError("데이터 정합성 검사 실패", 500, error)
  }
}

/** 일반 타입 점수 → 예상 결과 */
function deriveResult(homeScore: number, awayScore: number): string | null {
  if (homeScore > awayScore) return "home"
  if (homeScore < awayScore) return "away"
  if (homeScore === awayScore) return "draw"
  return null
}

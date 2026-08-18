import { NextRequest, NextResponse } from "next/server"
import { rateLimit } from "@/lib/rate-limit"
import { getLineupForGame, storeLineupPayload } from "@/lib/soccerway/lineup-lookup"
import { getLfaLineup } from "@/lib/lfa/lineups"
import { getLfaMatchInfo } from "@/lib/lfa/match"
import { createServiceRoleClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"
export const maxDuration = 30

/**
 * GET /api/match/lineup?gameId=<uuid> — 경기 라인업 (표시 전용, 2026-08-16).
 *
 * 응답 status:
 *   none    매핑 없음/창 밖/종목 아님 — 클라는 UI 자체를 그리지 않는다 (영구 조용)
 *   pending 킥오프 창 안인데 아직 미발표 — 클라가 5분 간격 재조회
 *   ready   라인업 확정 — 이후 불변
 *
 * 킬스위치: MATCH_LINEUP=on 일 때만 동작 (미설정 = 항상 none).
 * soccerway persisted query(_hash) 가 저쪽 배포로 깨지는 날, env 하나로 전 화면을 접는다.
 *
 * DB 쓰기 없음 — proposed 매핑 행 읽기 전용 (골든셋 게이트 무관, lineup-lookup.ts 주석 참조).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * LFA 라인업 폴백 — soccerway 창 밖(=하루 지난 경기)을 메운다.
 * 확보하면 `match_lineups` 에 저장해 다음부터는 바깥 요청 없이 나온다.
 */
async function lfaLineupFallback(gameId: string) {
  const { data: game } = await createServiceRoleClient()
    .from("betman_games")
    .select("id, sport, home_team_name, away_team_name, match_time, league_code")
    .eq("id", gameId)
    .maybeSingle()
  if (!game || game.sport !== "축구" || !game.match_time) return null

  const info = await getLfaMatchInfo({
    gameId: String(game.id),
    homeTeam: String(game.home_team_name),
    awayTeam: String(game.away_team_name),
    matchTime: String(game.match_time),
    leagueCode: String(game.league_code ?? ""),
  })
  if (!info) return null

  const lu = await getLfaLineup(
    info.matchId,
    String(game.home_team_name),
    String(game.away_team_name)
  )
  if (!lu) return null

  const payload = {
    status: "ready" as const,
    kickoff: new Date(String(game.match_time)).toISOString(),
    home: { teamLabel: String(game.home_team_name), ...lu.home },
    away: { teamLabel: String(game.away_team_name), ...lu.away },
    fetchedAt: new Date().toISOString(),
  }
  await storeLineupPayload(gameId, info.matchId, payload).catch(() => {})
  return payload
}

export async function GET(request: NextRequest) {
  if (process.env.MATCH_LINEUP !== "on") {
    return NextResponse.json({ status: "none" }, { headers: { "Cache-Control": "no-store" } })
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  if (!rateLimit(`lineup:${ip}`, 20, 60_000).success) {
    return NextResponse.json({ status: "none" }, { status: 429 })
  }

  const gameId = request.nextUrl.searchParams.get("gameId") ?? ""
  if (!UUID_RE.test(gameId)) {
    return NextResponse.json({ status: "none" }, { status: 400 })
  }

  try {
    let res = await getLineupForGame(gameId)
    // soccerway 가 침묵하면 LFA 로 한 번 더 — 저쪽은 **끝난 경기 라인업도 준다**.
    // soccerway 는 킥오프 +24시간이 지나면 아무것도 안 주는데, 그 창이 화면까지 끄는 바람에
    // 하루 지난 경기가 텅 비어 보였다 (2026-08-18 운영자: "일관성을 유지해줬으면").
    if (res.status !== "ready") {
      const fallback = await lfaLineupFallback(gameId).catch(() => null)
      if (fallback) res = fallback
    }
    return NextResponse.json(res, {
      headers: {
        // ready 는 불변에 가깝다 — 길게. pending/none 은 발표 직후 지연을 줄이려 짧게.
        "Cache-Control":
          res.status === "ready"
            ? "public, s-maxage=600, stale-while-revalidate=1800"
            : "public, s-maxage=120, stale-while-revalidate=300",
      },
    })
  } catch {
    // 어떤 실패도 화면 오류로 번지지 않는다 — fail-open
    return NextResponse.json({ status: "none" }, { headers: { "Cache-Control": "no-store" } })
  }
}

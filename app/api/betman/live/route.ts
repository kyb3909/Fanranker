import { NextResponse } from "next/server"
import { getLiveFinishedForToday } from "@/lib/betman/games-payload"

export const dynamic = "force-dynamic"

/**
 * GET /api/betman/live — 오늘 윈도우의 진행 중/종료 축구 경기 + 실시간 스코어 (2026-08-16).
 *
 * 홈 매치데이 밴드가 60초 간격으로 부르는 **경량** 진입점 — 전체 games 페이로드(마켓
 * 포함, 무거움)를 다시 조립하지 않고 스코어 목록만 돌려준다.
 *
 * 스코어 원천: /api/wisetoto/sync (매분) 이 채우는 betman_games.home_score/away_score.
 * 이 라우트는 읽기 전용이다.
 *
 * ⚠️ 클라이언트는 /api/sports/live 로 호출한다 — next.config 의
 *    `/api/sports/:path*` → `/api/betman/:path*` rewrite (betman 출처 은닉 정책).
 */
export async function GET() {
  try {
    const data = await getLiveFinishedForToday()
    return NextResponse.json(data, {
      headers: {
        // 수집이 매분이므로 30초 캐시 + swr 이면 오리진 부하는 분당 ~2회로 준다
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    })
  } catch {
    // fail-open — 밴드는 빈 목록이면 LIVE 섹션을 그리지 않는다
    return NextResponse.json(
      { liveMatches: [], finishedMatches: [] },
      { headers: { "Cache-Control": "no-store" } }
    )
  }
}

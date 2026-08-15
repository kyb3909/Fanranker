import { NextRequest, NextResponse } from "next/server"
import { rateLimit } from "@/lib/rate-limit"
import { getLineupForGame } from "@/lib/soccerway/lineup-lookup"

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
    const res = await getLineupForGame(gameId)
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

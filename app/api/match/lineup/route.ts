import { NextRequest, NextResponse } from "next/server"
import { rateLimit } from "@/lib/rate-limit"
import { getMatchLineup } from "@/lib/match/get-lineup"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * GET /api/match/lineup?gameId=<uuid> — 경기 라인업 (표시 전용, 2026-08-16).
 *
 * 응답 status:
 *   none    경기 없음/비활성/일시 오류 — 클라는 조회 창 안에서 재시도
 *   pending 아직 매핑/발표 대기 — 클라가 60초 간격 재조회
 *   ready   명단 있음 — projected=false일 때만 확정
 *
 * 명시적인 MATCH_LINEUP=off만 중지한다. 확정 LFA 명단은 공용 저장소에 보관한다.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  if (process.env.MATCH_LINEUP === "off") {
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
    // LFA-only acquisition. Cache purchases on the server, not predicted responses at the CDN.
    const res = await getMatchLineup(gameId)
    return NextResponse.json(res, {
      headers: {
        "Cache-Control": "no-store",
      },
    })
  } catch {
    // 어떤 실패도 화면 오류로 번지지 않는다 — fail-open
    return NextResponse.json({ status: "none" }, { headers: { "Cache-Control": "no-store" } })
  }
}

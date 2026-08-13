import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError } from "@/lib/api-error"
import { computeRaceStanding, GUNNERS_SEASON, isEventLive } from "@/lib/event/gunners-season"

export const dynamic = "force-dynamic"

/**
 * GET /api/event/gunners-season/standing — 건너스 레이스 랭킹 (TOP 5 + 내 순위).
 * 비로그인도 TOP 5 는 본다 (유입 표면 원칙). 내 순위는 로그인 시에만.
 */
export async function GET() {
  try {
    const { userId } = await auth()
    const supabase = createServiceRoleClient()
    const standing = await computeRaceStanding(supabase, userId ?? null)
    const res = NextResponse.json({
      event: {
        slug: GUNNERS_SEASON.slug,
        title: GUNNERS_SEASON.title,
        startAt: GUNNERS_SEASON.startAt,
        endAt: GUNNERS_SEASON.endAt,
        live: isEventLive(),
      },
      ...standing,
      // 내 순위는 개인화 응답 — 캐시가 다른 유저에게 새면 안 되므로 로그인 시 no-store
    })
    res.headers.set(
      "Cache-Control",
      userId ? "no-store" : "public, s-maxage=60, stale-while-revalidate=300"
    )
    return res
  } catch (e) {
    return apiError("랭킹을 불러오지 못했습니다.", 500, e)
  }
}

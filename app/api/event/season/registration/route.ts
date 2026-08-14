import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError } from "@/lib/api-error"
import { GUNNERS_SEASON } from "@/lib/event/gunners-season"

export const dynamic = "force-dynamic"

/**
 * GET /api/event/season/registration — 내 참가 신청 여부만 (경량).
 *
 * 랭킹 API(computeRaceStanding)는 슬립을 수천 건 훑으므로 "신청했나?" 하나 보려고
 * 부르면 낭비다. 예측 완료 모달이 문구를 가르는 데 쓰는 값이라 단일 행 조회로 끝낸다.
 * 미로그인은 registered:false (에러 아님) — 모달은 로그인 여부와 무관하게 그려진다.
 */
export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ registered: false }, { headers: { "Cache-Control": "no-store" } })
    }
    const supabase = createServiceRoleClient()
    const { data: ev } = await supabase
      .from("events")
      .select("id")
      .eq("slug", GUNNERS_SEASON.dbSlug)
      .maybeSingle()
    if (!ev) {
      return NextResponse.json({ registered: false }, { headers: { "Cache-Control": "no-store" } })
    }
    const { data: reg } = await supabase
      .from("event_registrations")
      .select("registered_at")
      .eq("event_id", ev.id)
      .eq("user_id", userId)
      .maybeSingle()
    return NextResponse.json(
      { registered: Boolean(reg), registeredAt: reg?.registered_at ?? null },
      // 개인화 응답 — CDN 캐시 금지
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    return apiError("참가 여부를 확인하지 못했습니다.", 500, e)
  }
}

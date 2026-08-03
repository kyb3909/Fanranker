import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

/**
 * 활성 사가 목록 — 예측 완료 모달 주입용 (PM 토론 2026-08-04 #4).
 * 최근 이벤트 순 상위 N개. 비로그인 열람 가능(사가는 공개 문서).
 */
export async function GET() {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from("sagas")
    .select("slug, title, stage, entry_count, last_event_at")
    .eq("status", "active")
    .order("last_event_at", { ascending: false })
    .limit(3)

  const res = NextResponse.json({ sagas: data ?? [] })
  res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300")
  return res
}

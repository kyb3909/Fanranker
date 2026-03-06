import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"

/**
 * GET /api/banners
 * 활성 배너 목록 조회 (공개)
 */
export async function GET() {
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase
    .from("announcement_banners")
    .select("id, title, description, image_url, link_url, gradient")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })

  if (error) {
    return NextResponse.json({ error: "배너를 불러올 수 없습니다." }, { status: 500 })
  }

  return NextResponse.json({ banners: data ?? [] })
}

import { NextRequest, NextResponse } from "next/server"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"

/**
 * GET /api/admin/content/banners
 * 전체 배너 목록 (비활성 포함)
 */
export async function GET() {
  const auth = await requireAdminApi()
  if (isErrorResponse(auth)) return auth

  const { data, error } = await auth.supabase
    .from("announcement_banners")
    .select("*")
    .order("sort_order", { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ banners: data ?? [] })
}

/**
 * POST /api/admin/content/banners
 * 새 배너 생성
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminApi()
  if (isErrorResponse(auth)) return auth

  const body = await request.json()
  const { title, description, image_url, link_url, gradient, sort_order, is_active } = body

  if (!title?.trim()) {
    return NextResponse.json({ error: "제목은 필수입니다." }, { status: 400 })
  }

  const { data, error } = await auth.supabase
    .from("announcement_banners")
    .insert({
      title: title.trim(),
      description: description?.trim() || null,
      image_url: image_url?.trim() || null,
      link_url: link_url?.trim() || null,
      gradient: gradient?.trim() || "from-blue-600 to-indigo-700",
      sort_order: sort_order ?? 0,
      is_active: is_active ?? true,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ banner: data }, { status: 201 })
}

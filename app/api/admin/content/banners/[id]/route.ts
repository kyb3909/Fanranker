import { NextRequest, NextResponse } from "next/server"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"

/**
 * PATCH /api/admin/content/banners/[id]
 * 배너 수정
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi()
  if (isErrorResponse(auth)) return auth

  const { id } = await params
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.title !== undefined)
    updates.title = typeof body.title === "string" ? body.title.trim() : body.title
  if (body.description !== undefined)
    updates.description =
      typeof body.description === "string" ? body.description.trim() || null : null
  if (body.image_url !== undefined)
    updates.image_url = typeof body.image_url === "string" ? body.image_url.trim() || null : null
  if (body.link_url !== undefined)
    updates.link_url = typeof body.link_url === "string" ? body.link_url.trim() || null : null
  if (body.gradient !== undefined)
    updates.gradient = typeof body.gradient === "string" ? body.gradient.trim() || null : null
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order
  if (body.is_active !== undefined) updates.is_active = body.is_active

  const { data, error } = await auth.supabase
    .from("announcement_banners")
    .update(updates)
    .eq("id", id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ banner: data })
}

/**
 * DELETE /api/admin/content/banners/[id]
 * 배너 삭제
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi()
  if (isErrorResponse(auth)) return auth

  const { id } = await params

  const { error } = await auth.supabase.from("announcement_banners").delete().eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

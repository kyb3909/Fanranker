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
  const body = await request.json()

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.title !== undefined) updates.title = body.title.trim()
  if (body.description !== undefined) updates.description = body.description?.trim() || null
  if (body.image_url !== undefined) updates.image_url = body.image_url?.trim() || null
  if (body.link_url !== undefined) updates.link_url = body.link_url?.trim() || null
  if (body.gradient !== undefined) updates.gradient = body.gradient?.trim() || null
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

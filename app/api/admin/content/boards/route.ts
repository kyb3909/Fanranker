import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { writeAuditLog, getIpFromRequest } from "@/lib/admin/audit"
import { apiError, apiBadRequest } from "@/lib/api-error"

export async function GET() {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true })

    if (error) return apiError(error.message, 500, error)
    return NextResponse.json({ boards: data ?? [] })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { userId, supabase } = auth

    const body = await request.json()
    const ChannelCreateSchema = z.object({
      slug: z
        .string()
        .min(1)
        .regex(/^[a-z0-9-]+$/),
      name: z.string().min(1),
      icon: z.string().optional(),
      description: z.string().optional(),
      parent_slug: z.string().min(1),
    })
    const parsed = ChannelCreateSchema.safeParse(body)
    if (!parsed.success) return apiBadRequest("slug, 이름, 상위 게시판은 필수입니다.")
    const { slug, name, icon, description, parent_slug } = parsed.data

    // 상위 게시판 존재 확인
    const { data: parent } = await supabase
      .from("categories")
      .select("slug")
      .eq("slug", parent_slug)
      .is("parent_slug", null)
      .single()
    if (!parent) return apiBadRequest("존재하지 않는 상위 게시판입니다.")

    // slug 중복 확인
    const { data: existing } = await supabase
      .from("categories")
      .select("slug")
      .eq("slug", slug)
      .single()
    if (existing) return apiBadRequest("이미 사용 중인 slug입니다.")

    // 최대 sort_order 조회
    const { data: maxOrder } = await supabase
      .from("categories")
      .select("sort_order")
      .eq("parent_slug", parent_slug)
      .order("sort_order", { ascending: false })
      .limit(1)
      .single()
    const nextOrder = (maxOrder?.sort_order ?? 0) + 10

    const { data: board, error } = await supabase
      .from("categories")
      .insert({
        slug,
        name,
        icon: icon || null,
        description: description || null,
        parent_slug,
        sort_order: nextOrder,
        is_active: true,
      })
      .select("*")
      .single()

    if (error) return apiError(error.message, 500, error)

    await writeAuditLog({
      adminUserId: userId,
      action: "create_channel",
      targetType: "board",
      targetId: board.id,
      details: { slug, name, parent_slug },
      ipAddress: getIpFromRequest(request),
    })

    return NextResponse.json({ board }, { status: 201 })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { userId, supabase } = auth

    const body = await request.json()
    const BoardUpdateSchema = z.object({
      boardId: z.string().min(1),
      name: z.string().optional(),
      description: z.string().optional(),
      icon: z.string().optional(),
      sort_order: z.number().optional(),
      is_active: z.boolean().optional(),
    })
    const parsed = BoardUpdateSchema.safeParse(body)
    if (!parsed.success) return apiBadRequest("boardId가 필요합니다.")
    const { boardId, name, description, icon, sort_order, is_active } = parsed.data

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (icon !== undefined) updateData.icon = icon
    if (sort_order !== undefined) updateData.sort_order = sort_order
    if (is_active !== undefined) updateData.is_active = is_active

    const { error } = await supabase.from("categories").update(updateData).eq("id", boardId)
    if (error) return apiError(error.message, 500, error)

    await writeAuditLog({
      adminUserId: userId,
      action: "update_board",
      targetType: "board",
      targetId: boardId,
      details: updateData,
      ipAddress: getIpFromRequest(request),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

import { NextRequest, NextResponse } from "next/server"
import { parseLimit } from "@/lib/api/parse-limit"
import { z } from "zod"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { attachNicknames } from "@/lib/admin/attach-nicknames"
import { writeAuditLog, getIpFromRequest } from "@/lib/admin/audit"
import { apiError, apiBadRequest } from "@/lib/api-error"

const CommentActionSchema = z.object({
  commentId: z.string().min(1),
  action: z.enum(["delete", "restore"]),
})

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseLimit(searchParams, { def: 30, max: 100 })
    const search = searchParams.get("search") || ""
    const showDeleted = searchParams.get("showDeleted") === "true"
    const offset = (page - 1) * limit

    // comments↔profiles 는 FK 가 없어 임베드 불가 → 닉네임은 attachNicknames 로 병합 (posts!inner 은 정상)
    let query = supabase
      .from("comments")
      .select(
        "id, post_id, user_id, content, vote_count, depth, created_at, deleted_at, posts!inner(title)",
        { count: "exact" }
      )

    if (search) query = query.ilike("content", `%${search}%`)
    if (!showDeleted) query = query.is("deleted_at", null)

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) return apiError(error.message, 500, error)
    const comments = await attachNicknames(supabase, data ?? [])
    return NextResponse.json({ comments, total: count ?? 0, page, limit })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { userId, supabase } = auth

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }
    const parsed = CommentActionSchema.safeParse(body)
    if (!parsed.success) return apiBadRequest("commentId와 action(delete|restore)이 필요합니다.")
    const { commentId, action } = parsed.data

    let updateData: Record<string, unknown> = {}
    let auditAction = ""

    if (action === "delete") {
      updateData = { deleted_at: new Date().toISOString() }
      auditAction = "delete_comment"
    } else if (action === "restore") {
      updateData = { deleted_at: null }
      auditAction = "restore_comment"
    }

    const { error } = await supabase.from("comments").update(updateData).eq("id", commentId)
    if (error) return apiError(error.message, 500, error)

    await writeAuditLog({
      adminUserId: userId,
      action: auditAction,
      targetType: "comment",
      targetId: commentId,
      details: { action },
      ipAddress: getIpFromRequest(request),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

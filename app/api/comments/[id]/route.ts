import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiBadRequest, apiUnauthorized } from "@/lib/api-error"
import { z } from "zod"

/**
 * PATCH /api/comments/[id]
 * 댓글 수정 (본인만)
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser()
    if (!user) {
      return apiUnauthorized()
    }

    const { id: commentId } = await params
    const body = await request.json()
    const CommentEditSchema = z.object({ content: z.string().min(1) })
    const parsed = CommentEditSchema.safeParse(body)
    if (!parsed.success) return apiBadRequest("댓글 내용을 입력해주세요.")
    const { content } = parsed.data

    const { createServiceRoleClient } = await import("@/lib/supabase/server")
    const supabase = createServiceRoleClient()

    // 본인 댓글인지 확인
    const { data: comment, error: fetchError } = await supabase
      .from("comments")
      .select("user_id")
      .eq("id", commentId)
      .is("deleted_at", null)
      .single()

    if (fetchError || !comment) {
      return NextResponse.json({ error: "댓글을 찾을 수 없습니다." }, { status: 404 })
    }

    if (comment.user_id !== user.id) {
      return NextResponse.json({ error: "본인의 댓글만 수정할 수 있습니다." }, { status: 403 })
    }

    const { data: updated, error: updateError } = await supabase
      .from("comments")
      .update({ content: content.trim(), updated_at: new Date().toISOString() })
      .eq("id", commentId)
      .select()
      .single()

    if (updateError) {
      return apiError("댓글 수정 중 오류가 발생했습니다.", 500, updateError)
    }

    return NextResponse.json(updated)
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

/**
 * DELETE /api/comments/[id]
 * 댓글 삭제 (본인만, soft delete)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await currentUser()
    if (!user) {
      return apiUnauthorized()
    }

    const { id: commentId } = await params

    const { createServiceRoleClient } = await import("@/lib/supabase/server")
    const supabase = createServiceRoleClient()

    // 본인 댓글인지 확인
    const { data: comment, error: fetchError } = await supabase
      .from("comments")
      .select("user_id, post_id")
      .eq("id", commentId)
      .is("deleted_at", null)
      .single()

    if (fetchError || !comment) {
      return NextResponse.json({ error: "댓글을 찾을 수 없습니다." }, { status: 404 })
    }

    if (comment.user_id !== user.id) {
      return NextResponse.json({ error: "본인의 댓글만 삭제할 수 있습니다." }, { status: 403 })
    }

    // Soft delete
    const { error: deleteError } = await supabase
      .from("comments")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", commentId)

    if (deleteError) {
      return apiError("댓글 삭제 중 오류가 발생했습니다.", 500, deleteError)
    }

    // comment_count 감소
    try {
      await supabase.rpc("decrement_comment_count", { p_post_id: comment.post_id })
    } catch {
      // DB trigger가 있으면 불필요하지만 안전하게 시도
    }

    return NextResponse.json({ success: true, message: "댓글이 삭제되었습니다." })
  } catch (error) {
    return apiError("서버 오류가 발생했습니다.", 500, error)
  }
}

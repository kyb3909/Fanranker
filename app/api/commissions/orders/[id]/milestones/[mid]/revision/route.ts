import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiUnauthorized, apiBadRequest } from "@/lib/api-error"
import { z } from "zod"

const revisionRequestSchema = z.object({
  feedback: z.string().min(1, "수정 요청 내용을 입력해주세요."),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; mid: string }> }
) {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const { id, mid } = await params
    const supabase = createServiceRoleClient()

    const { data: order } = await supabase
      .from("commission_orders")
      .select("*")
      .eq("id", id)
      .single()

    if (!order) return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 })
    if (order.client_id !== user.id)
      return NextResponse.json({ error: "의뢰인만 수정을 요청할 수 있습니다." }, { status: 403 })

    if (order.revisions_used >= order.max_revisions) {
      return apiBadRequest(`최대 수정 횟수(${order.max_revisions}회)를 초과했습니다.`)
    }

    const { data: milestone } = await supabase
      .from("commission_milestones")
      .select("*")
      .eq("id", mid)
      .eq("order_id", id)
      .single()

    if (!milestone)
      return NextResponse.json({ error: "마일스톤을 찾을 수 없습니다." }, { status: 404 })
    if (milestone.status !== "submitted")
      return apiBadRequest("제출된 마일스톤만 수정 요청할 수 있습니다.")

    const rawBody = await request.json()
    const parsed = revisionRequestSchema.safeParse(rawBody)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.errors[0]?.message || "잘못된 요청입니다.")
    }
    const { feedback } = parsed.data

    await supabase
      .from("commission_milestones")
      .update({
        status: "revision_requested",
        feedback,
      })
      .eq("id", mid)

    await supabase
      .from("commission_orders")
      .update({
        status: "revision",
        revisions_used: order.revisions_used + 1,
      })
      .eq("id", id)

    await supabase.from("notifications").insert({
      user_id: order.artist_id,
      type: "commission_revision_requested",
      actor_id: user.id,
    })

    await supabase.from("commission_messages").insert({
      order_id: id,
      sender_id: "system",
      message_type: "system",
      content: `의뢰인이 "${milestone.title}" 수정을 요청했습니다. (${order.revisions_used + 1}/${order.max_revisions})`,
    })

    return NextResponse.json({
      success: true,
      revisions_used: order.revisions_used + 1,
      max_revisions: order.max_revisions,
    })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

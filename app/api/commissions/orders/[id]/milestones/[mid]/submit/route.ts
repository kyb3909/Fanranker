import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiUnauthorized, apiBadRequest } from "@/lib/api-error"
import { z } from "zod"

const submitMilestoneSchema = z.object({
  deliverable_images: z.array(z.string()).optional(),
  deliverable_note: z.string().optional(),
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

    // Verify order
    const { data: order } = await supabase
      .from("commission_orders")
      .select("*")
      .eq("id", id)
      .single()

    if (!order) return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 })
    if (order.artist_id !== user.id)
      return NextResponse.json({ error: "작가만 결과물을 제출할 수 있습니다." }, { status: 403 })
    if (!["accepted", "in_progress", "revision"].includes(order.status)) {
      return apiBadRequest("현재 상태에서는 제출할 수 없습니다.")
    }

    const { data: milestone } = await supabase
      .from("commission_milestones")
      .select("*")
      .eq("id", mid)
      .eq("order_id", id)
      .single()

    if (!milestone)
      return NextResponse.json({ error: "마일스톤을 찾을 수 없습니다." }, { status: 404 })
    if (!["pending", "in_progress", "revision_requested"].includes(milestone.status)) {
      return apiBadRequest("이 마일스톤은 제출할 수 없는 상태입니다.")
    }

    const rawBody = await request.json()
    const parsed = submitMilestoneSchema.safeParse(rawBody)
    if (!parsed.success) {
      return apiBadRequest(parsed.error.errors[0]?.message || "잘못된 요청입니다.")
    }
    const { deliverable_images, deliverable_note } = parsed.data

    // Update milestone
    await supabase
      .from("commission_milestones")
      .update({
        status: "submitted",
        deliverable_images: deliverable_images || [],
        deliverable_note: deliverable_note || "",
        submitted_at: new Date().toISOString(),
      })
      .eq("id", mid)

    // Update order status
    const updates: Record<string, unknown> = { status: "review" }
    if (!order.started_at) updates.started_at = new Date().toISOString()
    await supabase.from("commission_orders").update(updates).eq("id", id)

    // Notify client
    await supabase.from("notifications").insert({
      user_id: order.client_id,
      type: "commission_milestone_submitted",
      actor_id: user.id,
    })

    await supabase.from("commission_messages").insert({
      order_id: id,
      sender_id: "system",
      message_type: "system",
      content: `작가가 "${milestone.title}" 결과물을 제출했습니다.`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

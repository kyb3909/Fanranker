import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiUnauthorized, apiBadRequest } from "@/lib/api-error"
import type { EscrowRefundResult } from "@/lib/supabase/types"
import { z } from "zod"

const cancelOrderSchema = z.object({
  reason: z.string().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const { id } = await params
    const supabase = createServiceRoleClient()

    const { data: order } = await supabase
      .from("commission_orders")
      .select("*")
      .eq("id", id)
      .single()

    if (!order) return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 })

    const isClient = order.client_id === user.id
    const isArtist = order.artist_id === user.id
    if (!isClient && !isArtist)
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 })

    // Cannot cancel in review/revision/completed states
    if (["review", "revision", "completed", "cancelled", "cancelling"].includes(order.status)) {
      return NextResponse.json({ error: "현재 상태에서는 취소할 수 없습니다." }, { status: 400 })
    }

    // Determine refund percentage
    let refundPercent = 100
    if (order.status === "in_progress") {
      if (isArtist) {
        refundPercent = 100
      } else {
        refundPercent = 50
      }
    }

    // Atomic status lock: current → cancelling (prevents double cancel/refund)
    const allowedStatuses = ["pending", "accepted", "in_progress"]
    const { data: locked } = await supabase
      .from("commission_orders")
      .update({ status: "cancelling" })
      .eq("id", id)
      .in("status", allowedStatuses)
      .select("id")

    if (!locked || locked.length === 0) {
      return NextResponse.json({ error: "이미 처리 중이거나 취소할 수 없는 상태입니다." }, { status: 409 })
    }

    const rawBody = await request.json().catch(() => ({}))
    const parsed = cancelOrderSchema.safeParse(rawBody)
    if (!parsed.success) {
      // Rollback status
      await supabase.from("commission_orders").update({ status: order.status }).eq("id", id).eq("status", "cancelling")
      return apiBadRequest(parsed.error.errors[0]?.message || "잘못된 요청입니다.")
    }
    const body = parsed.data

    const { data: refundResult } = (await supabase
      .rpc("escrow_refund_gold", { p_order_id: id, p_refund_percent: refundPercent })
      .single()) as { data: EscrowRefundResult | null }

    if (!refundResult?.success) {
      // Rollback status on refund failure
      await supabase.from("commission_orders").update({ status: order.status }).eq("id", id).eq("status", "cancelling")
      return NextResponse.json({ error: "환불 처리 실패" }, { status: 500 })
    }

    const { error: updateError } = await supabase
      .from("commission_orders")
      .update({
        cancelled_by: user.id,
        cancel_reason: body?.reason || "",
      })
      .eq("id", id)

    if (updateError) console.error("Order update failed:", updateError)

    // used_slots is now managed by DB trigger (trg_sync_commission_used_slots)

    // Notify other party
    const notifyUserId = isClient ? order.artist_id : order.client_id
    supabase
      .from("notifications")
      .insert({
        user_id: notifyUserId,
        type: "commission_cancelled",
        actor_id: user.id,
      })
      .then(({ error: e }) => {
        if (e) console.error("Notification insert failed:", e)
      })

    supabase
      .from("commission_messages")
      .insert({
        order_id: id,
        sender_id: "system",
        message_type: "system",
        content: `주문이 취소되었습니다. (환불 ${refundPercent}%)${body?.reason ? ` 사유: ${body.reason}` : ""}`,
      })
      .then(({ error: e }) => {
        if (e) console.error("Message insert failed:", e)
      })

    return NextResponse.json({
      success: true,
      refund_percent: refundPercent,
      refunded: refundResult.refunded,
      artist_received: refundResult.artist_received,
    })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

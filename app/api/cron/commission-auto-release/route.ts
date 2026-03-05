import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import type { EscrowReleaseResult } from "@/lib/supabase/types"
import { apiError } from "@/lib/api-error"
import { verifyCronSecret } from "@/lib/cron-auth"

export async function POST(request: NextRequest) {
  try {
    const authError = verifyCronSecret(request)
    if (authError) return authError

    const supabase = createServiceRoleClient()

    // Find orders past auto_release_at
    const { data: orders, error } = await supabase
      .from("commission_orders")
      .select("id, order_number, artist_id, client_id")
      .eq("status", "review")
      .not("auto_release_at", "is", null)
      .lte("auto_release_at", new Date().toISOString())

    if (error) {
      return apiError("Query failed", 500, error)
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json({ released: 0 })
    }

    let released = 0
    const errors: string[] = []

    for (const order of orders) {
      // Atomic status lock: review → completing (prevents double release)
      const { data: locked } = await supabase
        .from("commission_orders")
        .update({ status: "completing" })
        .eq("id", order.id)
        .eq("status", "review")
        .select("id")

      if (!locked || locked.length === 0) {
        errors.push(`${order.order_number}: already processing or completed`)
        continue
      }

      const { data: result } = (await supabase
        .rpc("escrow_release_gold", { p_order_id: order.id })
        .single()) as { data: EscrowReleaseResult | null }

      if (result?.success) {
        released++

        // Decrement used_slots
        const { data: orderFull } = await supabase
          .from("commission_orders")
          .select("package_id")
          .eq("id", order.id)
          .single()

        if (orderFull) {
          const { data: pkg } = await supabase
            .from("commission_packages")
            .select("used_slots")
            .eq("id", orderFull.package_id)
            .single()

          if (pkg && pkg.used_slots > 0) {
            await supabase
              .from("commission_packages")
              .update({ used_slots: pkg.used_slots - 1 })
              .eq("id", orderFull.package_id)
          }
        }

        // Notifications
        await supabase.from("notifications").insert([
          { user_id: order.artist_id, type: "commission_completed", actor_id: "system" },
          { user_id: order.client_id, type: "commission_completed", actor_id: "system" },
        ])

        await supabase.from("commission_messages").insert({
          order_id: order.id,
          sender_id: "system",
          message_type: "system",
          content: "3일 경과로 자동 정산이 완료되었습니다.",
        })
      } else {
        // Rollback status to review on failure
        await supabase
          .from("commission_orders")
          .update({ status: "review" })
          .eq("id", order.id)
          .eq("status", "completing")
        errors.push(`${order.order_number}: ${result?.error_message || "unknown error"}`)
      }
    }

    return NextResponse.json({ released, total: orders.length, errors })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

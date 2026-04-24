import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { resolveMetaverseUser } from "@/lib/metaverse/auth"

/**
 * POST /api/metaverse/avatar/purchase
 * Body: { avatarKey: string }
 * RPC metaverse_purchase_avatar 호출 — gold 차감 + 인벤토리 삽입을 원자적으로 수행.
 * 게스트는 구매 불가 (402).
 */
export async function POST(req: Request) {
  const me = await resolveMetaverseUser(req)
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (me.isGuest) {
    return NextResponse.json({ error: "guest_cannot_purchase" }, { status: 402 })
  }

  let body: { avatarKey?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }
  const avatarKey = body.avatarKey?.trim()
  if (!avatarKey) {
    return NextResponse.json({ error: "avatarKey_required" }, { status: 400 })
  }

  const admin = createServiceRoleClient()
  const { data, error } = await admin.rpc("metaverse_purchase_avatar", {
    p_user_id: me.userId,
    p_avatar_key: avatarKey,
  })

  if (error) {
    return NextResponse.json({ error: "rpc_failed", detail: error.message }, { status: 500 })
  }

  const result = data as {
    success: boolean
    error_code?: string
    error_message?: string
    avatar_key?: string
    price_paid?: number
    remaining_gold?: number
  }

  if (!result?.success) {
    const status =
      result?.error_code === "insufficient_gold"
        ? 402
        : result?.error_code === "already_owned"
          ? 409
          : result?.error_code === "not_found"
            ? 404
            : 400
    return NextResponse.json(
      { error: result?.error_code ?? "purchase_failed", message: result?.error_message },
      { status }
    )
  }

  return NextResponse.json({
    avatarKey: result.avatar_key,
    pricePaid: result.price_paid,
    remainingGold: result.remaining_gold,
  })
}

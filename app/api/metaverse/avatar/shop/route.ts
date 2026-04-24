import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"

/**
 * GET /api/metaverse/avatar/shop
 * 판매 중인 아바타 카탈로그 (기본 무료 + 유료 유니폼들).
 */
export async function GET() {
  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from("metaverse_avatar_items")
    .select("avatar_key, name, description, price_gold, is_default, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })

  if (error) {
    return NextResponse.json({ error: "fetch_failed", detail: error.message }, { status: 500 })
  }

  return NextResponse.json({
    items: (data ?? []).map((r) => ({
      avatarKey: r.avatar_key,
      name: r.name,
      description: r.description,
      priceGold: r.price_gold,
      isDefault: r.is_default,
      sortOrder: r.sort_order,
    })),
  })
}

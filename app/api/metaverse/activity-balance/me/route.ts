import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { resolveMetaverseUser } from "@/lib/metaverse/auth"

/** dev 게스트에게 주는 테스트용 초기 잔액 (채팅방 5개 분량) */
const DEV_GUEST_STARTER_POINTS = 500

/**
 * GET /api/metaverse/activity-balance/me
 * 본인 활동 포인트 잔액(spendable) + 평생 누적(lifetime_earned).
 * 행이 없으면 0 반환 (단, dev 게스트에겐 처음 호출 시 자동 seed).
 */
export async function GET(req: Request) {
  const me = await resolveMetaverseUser(req)
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const admin = createServiceRoleClient()

  const { data, error } = await admin
    .from("metaverse_user_activity_balance")
    .select("spendable_points, lifetime_earned")
    .eq("user_id", me.userId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: "fetch_failed", detail: error.message }, { status: 500 })
  }

  // dev 게스트 & 최초 진입 → 테스트 잔액 seed
  if (!data && me.isGuest) {
    const { data: seeded, error: seedErr } = await admin
      .from("metaverse_user_activity_balance")
      .insert({
        user_id: me.userId,
        spendable_points: DEV_GUEST_STARTER_POINTS,
        lifetime_earned: DEV_GUEST_STARTER_POINTS,
      })
      .select("spendable_points, lifetime_earned")
      .single()
    if (seedErr) {
      return NextResponse.json({ error: "seed_failed", detail: seedErr.message }, { status: 500 })
    }
    return NextResponse.json({
      spendablePoints: seeded.spendable_points,
      lifetimeEarned: seeded.lifetime_earned,
      isGuest: true,
    })
  }

  return NextResponse.json({
    spendablePoints: data?.spendable_points ?? 0,
    lifetimeEarned: data?.lifetime_earned ?? 0,
    isGuest: me.isGuest,
  })
}

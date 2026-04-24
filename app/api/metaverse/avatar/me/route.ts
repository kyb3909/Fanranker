import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { resolveMetaverseUser } from "@/lib/metaverse/auth"
import { DEFAULT_AVATAR_KEY } from "@/lib/metaverse/avatar/presets"

/**
 * GET /api/metaverse/avatar/me
 * 본인 장착 아바타 키 + 소유 목록 + 골드 잔액 반환.
 * 게스트는 localStorage 기반 장착 — 이 엔드포인트는 기본값만 반환.
 */
export async function GET(req: Request) {
  const me = await resolveMetaverseUser(req)
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  if (me.isGuest) {
    return NextResponse.json({
      equippedAvatarKey: DEFAULT_AVATAR_KEY,
      ownedAvatarKeys: [DEFAULT_AVATAR_KEY],
      goldBalance: null,
      isGuest: true,
    })
  }

  const admin = createServiceRoleClient()
  const [{ data: profile, error: pe }, { data: inv, error: ie }, { data: gold, error: ge }] =
    await Promise.all([
      admin.from("profiles").select("metaverse_avatar_key").eq("id", me.userId).maybeSingle(),
      admin.from("metaverse_avatar_inventory").select("avatar_key").eq("user_id", me.userId),
      admin.from("user_gold").select("gold_balance").eq("user_id", me.userId).maybeSingle(),
    ])

  if (pe) return NextResponse.json({ error: "profile_failed", detail: pe.message }, { status: 500 })
  if (ie) return NextResponse.json({ error: "inv_failed", detail: ie.message }, { status: 500 })
  if (ge) return NextResponse.json({ error: "gold_failed", detail: ge.message }, { status: 500 })

  const ownedSet = new Set<string>([DEFAULT_AVATAR_KEY, ...(inv ?? []).map((r) => r.avatar_key)])

  return NextResponse.json({
    equippedAvatarKey:
      (profile as { metaverse_avatar_key?: string | null } | null)?.metaverse_avatar_key ??
      DEFAULT_AVATAR_KEY,
    ownedAvatarKeys: Array.from(ownedSet),
    goldBalance: gold?.gold_balance ?? 0,
    isGuest: false,
  })
}

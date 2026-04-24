import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { resolveMetaverseUser } from "@/lib/metaverse/auth"

/**
 * POST /api/metaverse/avatar/equip
 * Body: { avatarKey: string }
 * RPC metaverse_equip_avatar — 소유 여부 확인 후 profiles.metaverse_avatar_key 업데이트.
 * 게스트는 DB 쓰기 없음 — 200 으로 통과시켜 클라이언트 localStorage 에서만 반영.
 */
export async function POST(req: Request) {
  const me = await resolveMetaverseUser(req)
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

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

  // 게스트는 서버 상태 없음 — 클라이언트가 결과를 localStorage 에 저장하고 끝
  if (me.isGuest) {
    return NextResponse.json({ avatarKey, isGuest: true })
  }

  const admin = createServiceRoleClient()
  const { data, error } = await admin.rpc("metaverse_equip_avatar", {
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
  }
  if (!result?.success) {
    const status =
      result?.error_code === "not_owned" ? 403 : result?.error_code === "not_found" ? 404 : 400
    return NextResponse.json(
      { error: result?.error_code ?? "equip_failed", message: result?.error_message },
      { status }
    )
  }

  return NextResponse.json({ avatarKey: result.avatar_key })
}

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { writeAuditLog, getIpFromRequest } from "@/lib/admin/audit"
import { apiError, apiBadRequest } from "@/lib/api-error"
import { ALL_COMMUNITIES } from "@/lib/constants/communities"

const VALID_SLUGS = new Set(ALL_COMMUNITIES.map((c) => c.slug))

/** GET /api/admin/content/moderators?slug=football — 해당 게시판 MOD 목록 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { supabase } = auth

    const slug = new URL(request.url).searchParams.get("slug")
    if (!slug || !VALID_SLUGS.has(slug)) return apiBadRequest("유효한 게시판 slug가 필요합니다.")

    const { data: mods, error } = await supabase
      .from("board_moderators")
      .select("user_id, granted_at")
      .eq("community_slug", slug)
      .order("granted_at", { ascending: false })
    if (error) return apiError(error.message, 500, error)

    const ids = (mods ?? []).map((m) => m.user_id)
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("user_id, nickname, avatar_url").in("user_id", ids)
      : { data: [] as { user_id: string; nickname: string; avatar_url: string | null }[] }
    const pMap = new Map((profiles ?? []).map((p) => [p.user_id, p]))

    return NextResponse.json({
      moderators: (mods ?? []).map((m) => ({
        user_id: m.user_id,
        granted_at: m.granted_at,
        nickname: pMap.get(m.user_id)?.nickname ?? "(알 수 없음)",
        avatar_url: pMap.get(m.user_id)?.avatar_url ?? null,
      })),
    })
  } catch (e) {
    return apiError("서버 오류", 500, e)
  }
}

const GrantSchema = z.object({
  community_slug: z.string().min(1),
  nickname: z.string().min(1),
})

/** POST — 닉네임으로 MOD 부여 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { userId: adminId, supabase } = auth

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }
    const parsed = GrantSchema.safeParse(body)
    if (!parsed.success) return apiBadRequest("community_slug 와 nickname 이 필요합니다.")
    const { community_slug, nickname } = parsed.data
    if (!VALID_SLUGS.has(community_slug)) return apiBadRequest("유효한 게시판이 아닙니다.")

    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id, nickname")
      .eq("nickname", nickname)
      .maybeSingle()
    if (!profile) return apiBadRequest(`'${nickname}' 닉네임의 사용자를 찾을 수 없습니다.`)

    const { error } = await supabase
      .from("board_moderators")
      .insert({ user_id: profile.user_id, community_slug, granted_by: adminId })
    if (error) {
      if (error.code === "23505") return apiBadRequest("이미 이 게시판의 MOD입니다.")
      return apiError(error.message, 500, error)
    }

    await writeAuditLog({
      adminUserId: adminId,
      action: "grant_board_mod",
      targetType: "user",
      targetId: profile.user_id,
      details: { community_slug, nickname },
      ipAddress: getIpFromRequest(request),
    })

    return NextResponse.json({
      success: true,
      user_id: profile.user_id,
      nickname: profile.nickname,
    })
  } catch (e) {
    return apiError("서버 오류", 500, e)
  }
}

const RevokeSchema = z.object({
  community_slug: z.string().min(1),
  user_id: z.string().min(1),
})

/** DELETE — MOD 회수 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { userId: adminId, supabase } = auth

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }
    const parsed = RevokeSchema.safeParse(body)
    if (!parsed.success) return apiBadRequest("community_slug 와 user_id 가 필요합니다.")
    const { community_slug, user_id } = parsed.data

    const { error } = await supabase
      .from("board_moderators")
      .delete()
      .eq("community_slug", community_slug)
      .eq("user_id", user_id)
    if (error) return apiError(error.message, 500, error)

    await writeAuditLog({
      adminUserId: adminId,
      action: "revoke_board_mod",
      targetType: "user",
      targetId: user_id,
      details: { community_slug },
      ipAddress: getIpFromRequest(request),
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    return apiError("서버 오류", 500, e)
  }
}

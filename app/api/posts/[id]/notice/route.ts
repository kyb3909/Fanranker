import { NextRequest, NextResponse } from "next/server"
import { auth as clerkAuth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { canPostNotice } from "@/lib/board-moderator"
import { writeAuditLog, getIpFromRequest } from "@/lib/admin/audit"
import { apiError, apiBadRequest, apiUnauthorized } from "@/lib/api-error"

type Sb = ReturnType<typeof createServiceRoleClient>

/** 관리자(profiles.role='admin') 여부 — 전체 공지는 관리자 전용. */
async function isSiteAdmin(supabase: Sb, userId: string): Promise<boolean> {
  const { data } = await supabase.from("profiles").select("role").eq("user_id", userId).single()
  return data?.role === "admin"
}

/**
 * 전체 공지 컬럼(is_global_notice)을 마이그레이션 적용 전에도 안전하게 읽는다.
 * 컬럼이 아직 없으면 supabase-js 가 error+data:null 을 주므로(throw X) false 로 떨어진다.
 */
async function readGlobalNotice(supabase: Sb, id: string): Promise<boolean> {
  const { data } = await supabase
    .from("posts")
    .select("is_global_notice")
    .eq("id", id)
    .maybeSingle()
  return !!data?.is_global_notice
}

/**
 * GET /api/posts/[id]/notice
 * 현재 유저가 이 글을 (게시판 공지 / 전체 공지)로 토글할 수 있는지 + 현재 상태.
 * (수정 화면의 "공지로 추가" / "전체 공지" 버튼 노출 판단용)
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { userId } = await clerkAuth()
    const supabase = createServiceRoleClient()
    const { data: post } = await supabase
      .from("posts")
      .select("community_slug, is_notice, hero_pinned_at")
      .eq("id", id)
      .single()
    if (!post) {
      return NextResponse.json({
        canPostNotice: false,
        isNotice: false,
        canGlobalNotice: false,
        isGlobalNotice: false,
        isHero: false,
      })
    }
    const canNotice = userId ? await canPostNotice(supabase, userId, post.community_slug) : false
    const canGlobal = userId ? await isSiteAdmin(supabase, userId) : false
    const isGlobalNotice = canGlobal ? await readGlobalNotice(supabase, id) : false
    return NextResponse.json({
      canPostNotice: canNotice,
      isNotice: !!post.is_notice,
      canGlobalNotice: canGlobal,
      isGlobalNotice,
      // 히어로 고정 — 전체 공지와 같은 관리자 권한(canGlobalNotice)을 쓴다
      isHero: !!post.hero_pinned_at,
    })
  } catch (e) {
    return apiError("서버 오류", 500, e)
  }
}

const PatchSchema = z
  .object({
    is_notice: z.boolean().optional(),
    is_global_notice: z.boolean().optional(),
    /** 홈 히어로(Top Story) 수동 고정 — 관리자 전용 (2026-08-03) */
    is_hero: z.boolean().optional(),
  })
  .refine(
    (v) => v.is_notice !== undefined || v.is_global_notice !== undefined || v.is_hero !== undefined,
    { message: "is_notice / is_global_notice / is_hero 중 하나가 필요합니다." }
  )

/**
 * PATCH /api/posts/[id]/notice
 * - is_notice: 그 게시판 공지. admin / 글로벌 moderator / 해당 게시판 board MOD.
 * - is_global_notice: 전체 공지(담벼락 최상단 고정). 관리자 전용.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { userId } = await clerkAuth()
    if (!userId) return apiUnauthorized()

    const supabase = createServiceRoleClient()
    const { data: post } = await supabase
      .from("posts")
      .select("community_slug, is_notice")
      .eq("id", id)
      .single()
    if (!post) return apiBadRequest("글을 찾을 수 없습니다.")

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) {
      return apiBadRequest("is_notice 또는 is_global_notice(boolean)가 필요합니다.")
    }

    const update: {
      is_notice?: boolean
      is_global_notice?: boolean
      hero_pinned_at?: string | null
    } = {}

    // 게시판 공지 — admin / 글로벌 moderator / 해당 게시판 board MOD
    if (parsed.data.is_notice !== undefined) {
      if (!(await canPostNotice(supabase, userId, post.community_slug))) {
        return NextResponse.json({ error: "공지로 등록할 권한이 없습니다." }, { status: 403 })
      }
      update.is_notice = parsed.data.is_notice
    }

    // 전체 공지(담벼락 고정) — 관리자 전용
    if (parsed.data.is_global_notice !== undefined) {
      if (!(await isSiteAdmin(supabase, userId))) {
        return NextResponse.json(
          { error: "전체 공지는 관리자만 설정할 수 있습니다." },
          { status: 403 }
        )
      }
      update.is_global_notice = parsed.data.is_global_notice
    }

    // 홈 히어로 고정 — 관리자 전용. timestamptz 라 "최근에 건 순"이 곧 히어로 순서
    if (parsed.data.is_hero !== undefined) {
      if (!(await isSiteAdmin(supabase, userId))) {
        return NextResponse.json(
          { error: "메인 고정은 관리자만 설정할 수 있습니다." },
          { status: 403 }
        )
      }
      update.hero_pinned_at = parsed.data.is_hero ? new Date().toISOString() : null
    }

    const { error } = await supabase.from("posts").update(update).eq("id", id)
    if (error) return apiError(error.message, 500, error)

    // 전체 공지·히어로는 홈에 노출되므로 즉시 갱신
    if (update.is_global_notice !== undefined || update.hero_pinned_at !== undefined) {
      revalidatePath("/")
    }

    const action =
      update.hero_pinned_at !== undefined
        ? update.hero_pinned_at
          ? "pin_hero_post"
          : "unpin_hero_post"
        : update.is_global_notice !== undefined
          ? update.is_global_notice
            ? "pin_global_post"
            : "unpin_global_post"
          : update.is_notice
            ? "pin_post"
            : "unpin_post"
    await writeAuditLog({
      adminUserId: userId,
      action,
      targetType: "post",
      targetId: id,
      details: { community_slug: post.community_slug, source: "edit", ...update },
      ipAddress: getIpFromRequest(request),
    })

    return NextResponse.json({
      success: true,
      isNotice: update.is_notice,
      isGlobalNotice: update.is_global_notice,
      isHero: update.hero_pinned_at !== undefined ? !!update.hero_pinned_at : undefined,
    })
  } catch (e) {
    return apiError("서버 오류", 500, e)
  }
}

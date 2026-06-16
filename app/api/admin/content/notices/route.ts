import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { writeAuditLog, getIpFromRequest } from "@/lib/admin/audit"
import { apiError, apiBadRequest } from "@/lib/api-error"
import { ALL_COMMUNITIES } from "@/lib/constants/communities"
import { sanitizeTipTapJSON } from "@/lib/tiptap/sanitize"
import { extractFirstImageSrcFromTipTapJSON } from "@/lib/utils/tiptap-embeds"

const VALID_SLUGS = new Set(ALL_COMMUNITIES.map((c) => c.slug))
const MAX_CONTENT_SIZE = 100_000 // 100KB

const BulkNoticeSchema = z.object({
  title: z.string().min(1, "제목을 입력해주세요.").max(200, "제목은 200자 이하여야 합니다."),
  content: z
    .any()
    .refine((v) => v !== undefined && v !== null && v !== "", { message: "내용을 입력해주세요." })
    .refine(
      (v) => {
        try {
          return JSON.stringify(v).length <= MAX_CONTENT_SIZE
        } catch {
          return false
        }
      },
      { message: "내용이 너무 깁니다. (최대 100KB)" }
    ),
  community_slugs: z.array(z.string().min(1)).min(1, "게시판을 1개 이상 선택해주세요."),
})

/**
 * POST /api/admin/content/notices
 * 선택한 게시판마다 상단 고정 공지(is_notice=true) 글을 일괄 생성. 관리자 전용.
 * 본문은 TipTap JSON (이미지/임베드 포함) — /write 와 동일한 에디터로 작성.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminApi()
    if (isErrorResponse(auth)) return auth
    const { userId, supabase } = auth

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }
    const parsed = BulkNoticeSchema.safeParse(body)
    if (!parsed.success)
      return apiBadRequest(parsed.error.errors[0]?.message || "잘못된 입력입니다.")
    const { title, content: rawContent, community_slugs } = parsed.data

    // TipTap JSON sanitization (저장형 XSS 방지) — /write 와 동일
    const content = sanitizeTipTapJSON(rawContent)
    if (!content) return apiBadRequest("본문 형식이 올바르지 않습니다.")

    const slugs = [...new Set(community_slugs)].filter((s) => VALID_SLUGS.has(s))
    if (slugs.length === 0) return apiBadRequest("유효한 게시판이 없습니다.")

    // 대표 이미지 (본문 첫 이미지) — 카드 썸네일용
    const image = extractFirstImageSrcFromTipTapJSON(content)

    const rows = slugs.map((slug) => ({
      user_id: userId,
      community_slug: slug,
      title,
      content,
      image,
      is_notice: true,
    }))

    const { data, error } = await supabase.from("posts").insert(rows).select("id")
    if (error) return apiError(error.message, 500, error)

    await writeAuditLog({
      adminUserId: userId,
      action: "bulk_notice",
      targetType: "post",
      targetId: slugs.join(","),
      details: {
        title,
        community_slugs: slugs,
        postIds: (data ?? []).map((p) => p.id),
        count: data?.length ?? 0,
      },
      ipAddress: getIpFromRequest(request),
    })

    return NextResponse.json({ success: true, count: data?.length ?? 0, boards: slugs })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

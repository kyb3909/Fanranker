import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireAdminApi, isErrorResponse } from "@/lib/admin/require-admin-api"
import { writeAuditLog, getIpFromRequest } from "@/lib/admin/audit"
import { apiError, apiBadRequest } from "@/lib/api-error"
import { ALL_COMMUNITIES } from "@/lib/constants/communities"

const VALID_SLUGS = new Set(ALL_COMMUNITIES.map((c) => c.slug))

const BulkNoticeSchema = z.object({
  title: z.string().min(1, "제목을 입력해주세요.").max(200, "제목은 200자 이하여야 합니다."),
  body: z.string().min(1, "내용을 입력해주세요.").max(5000, "내용은 5000자 이하여야 합니다."),
  community_slugs: z.array(z.string().min(1)).min(1, "게시판을 1개 이상 선택해주세요."),
})

// 평문 → 최소 TipTap doc (줄바꿈 = 문단). 관리자 입력이므로 텍스트 노드만 → 본질적으로 안전.
function textToTipTap(text: string) {
  return {
    type: "doc",
    content: text
      .split("\n")
      .map((line) =>
        line.length
          ? { type: "paragraph", content: [{ type: "text", text: line }] }
          : { type: "paragraph" }
      ),
  }
}

/**
 * POST /api/admin/content/notices
 * 선택한 게시판마다 상단 고정 공지(is_notice=true) 글을 일괄 생성. 관리자 전용.
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
    const { title, body: noticeBody, community_slugs } = parsed.data

    const slugs = [...new Set(community_slugs)].filter((s) => VALID_SLUGS.has(s))
    if (slugs.length === 0) return apiBadRequest("유효한 게시판이 없습니다.")

    const content = textToTipTap(noticeBody)
    const rows = slugs.map((slug) => ({
      user_id: userId,
      community_slug: slug,
      title,
      content,
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

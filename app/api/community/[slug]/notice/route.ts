import { NextRequest, NextResponse } from "next/server"
import { auth as clerkAuth } from "@clerk/nextjs/server"
import { z } from "zod"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { canPostNotice } from "@/lib/board-moderator"
import { apiError, apiBadRequest, apiUnauthorized } from "@/lib/api-error"

// 평문 → 최소 TipTap doc (줄바꿈 = 문단). 텍스트 노드만 → 안전.
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
 * GET /api/community/[slug]/notice — 현재 유저가 이 게시판에 공지를 쓸 수 있는지.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const { userId } = await clerkAuth()
    if (!userId) return NextResponse.json({ canPostNotice: false })
    const supabase = createServiceRoleClient()
    return NextResponse.json({ canPostNotice: await canPostNotice(supabase, userId, slug) })
  } catch (e) {
    return apiError("서버 오류", 500, e)
  }
}

const NoticeSchema = z.object({
  title: z.string().min(1, "제목을 입력해주세요.").max(200, "제목은 200자 이하여야 합니다."),
  body: z.string().min(1, "내용을 입력해주세요.").max(5000, "내용은 5000자 이하여야 합니다."),
})

/**
 * POST /api/community/[slug]/notice — MOD/관리자가 해당 게시판에 상단 고정 공지 작성.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const { userId } = await clerkAuth()
    if (!userId) return apiUnauthorized()

    const supabase = createServiceRoleClient()
    if (!(await canPostNotice(supabase, userId, slug))) {
      return NextResponse.json(
        { error: "이 게시판에 공지를 작성할 권한이 없습니다." },
        { status: 403 }
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiBadRequest("잘못된 요청 본문입니다.")
    }
    const parsed = NoticeSchema.safeParse(body)
    if (!parsed.success)
      return apiBadRequest(parsed.error.errors[0]?.message || "잘못된 입력입니다.")
    const { title, body: noticeBody } = parsed.data

    const { data, error } = await supabase
      .from("posts")
      .insert({
        user_id: userId,
        community_slug: slug,
        title,
        content: textToTipTap(noticeBody),
        is_notice: true,
      })
      .select("id")
      .single()
    if (error) return apiError(error.message, 500, error)

    return NextResponse.json({ success: true, id: data.id })
  } catch (e) {
    return apiError("서버 오류", 500, e)
  }
}

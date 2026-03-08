import { NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { currentUser } from "@clerk/nextjs/server"
import { apiError, apiUnauthorized } from "@/lib/api-error"

/**
 * GET /api/ticker/[id]/comments
 * 트래커 아이템의 댓글 목록 조회 (최신순)
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const tickerItemId = Number(id)
    if (!tickerItemId || isNaN(tickerItemId)) {
      return NextResponse.json({ error: "유효하지 않은 ID입니다." }, { status: 400 })
    }

    const supabase = createServiceRoleClient()

    const { data: comments, error } = await supabase
      .from("ticker_comments")
      .select("id, user_id, nickname, content, likes, created_at")
      .eq("ticker_item_id", tickerItemId)
      .order("created_at", { ascending: false })
      .limit(100)

    if (error) {
      return apiError("댓글 조회 오류", 500, error)
    }

    return NextResponse.json(
      { comments: comments || [] },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

/**
 * POST /api/ticker/[id]/comments
 * 트래커 아이템에 댓글 작성 (인증 필요, 300자 제한)
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const tickerItemId = Number(id)
    if (!tickerItemId || isNaN(tickerItemId)) {
      return NextResponse.json({ error: "유효하지 않은 ID입니다." }, { status: 400 })
    }

    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const userId = user.id

    // 정지 유저 차단
    const { isUserSuspended } = await import("@/lib/check-suspension")
    if (await isUserSuspended(userId)) {
      return NextResponse.json({ error: "활동이 정지된 계정입니다." }, { status: 403 })
    }

    let body: { content?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 })
    }

    const content = body.content?.trim()
    if (!content || content.length < 1 || content.length > 300) {
      return NextResponse.json({ error: "댓글은 1~300자로 입력해주세요." }, { status: 400 })
    }

    const supabase = createServiceRoleClient()

    // 15초 쿨타임 체크
    const { data: lastComment } = await supabase
      .from("ticker_comments")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    if (lastComment) {
      const elapsed = Date.now() - new Date(lastComment.created_at).getTime()
      const cooldown = 15 * 1000
      if (elapsed < cooldown) {
        const remaining = Math.ceil((cooldown - elapsed) / 1000)
        return NextResponse.json(
          { error: `${remaining}초 후에 다시 작성할 수 있습니다.` },
          { status: 429 }
        )
      }
    }

    // 닉네임 조회
    const { data: profile } = await supabase
      .from("profiles")
      .select("nickname")
      .eq("user_id", userId)
      .single()

    const nickname = profile?.nickname || "익명"

    const { data: comment, error: insertError } = await supabase
      .from("ticker_comments")
      .insert({
        ticker_item_id: tickerItemId,
        user_id: userId,
        nickname,
        content,
      })
      .select("id, user_id, nickname, content, likes, created_at")
      .single()

    if (insertError) {
      return apiError("댓글 저장 오류", 500, insertError)
    }

    return NextResponse.json(comment, { status: 201 })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

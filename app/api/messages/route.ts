import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { apiError, apiBadRequest, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import { z } from "zod"

const SendMessageSchema = z.object({
  receiver_id: z.string().min(1),
  content: z.string().min(1, "내용을 입력해주세요.").max(2000, "2000자 이하로 작성해주세요."),
})

/**
 * GET /api/messages
 * 대화 목록 (최근 대화 상대별 마지막 메시지)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const partnerId = request.nextUrl.searchParams.get("partner_id")
    const supabase = createServiceRoleClient()

    if (partnerId) {
      // 특정 상대와의 대화 내역
      const { data: messages, error } = await supabase
        .from("direct_messages")
        .select("*")
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${partnerId},deleted_by_sender.eq.false),and(sender_id.eq.${partnerId},receiver_id.eq.${user.id},deleted_by_receiver.eq.false)`
        )
        .order("created_at", { ascending: true })
        .limit(100)

      if (error) return apiError("메시지 조회 실패", 500, error)

      // 읽음 처리
      await supabase
        .from("direct_messages")
        .update({ is_read: true })
        .eq("sender_id", partnerId)
        .eq("receiver_id", user.id)
        .eq("is_read", false)

      // 상대 프로필
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id, nickname, avatar_url")
        .eq("user_id", partnerId)
        .single()

      return NextResponse.json({ messages: messages || [], partner: profile })
    }

    // 대화 목록: 최근 메시지 기준
    const { data: allMessages, error } = await supabase
      .from("direct_messages")
      .select("*")
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(500)

    if (error) return apiError("대화 목록 조회 실패", 500, error)

    // 대화 상대별 마지막 메시지 그룹핑
    const conversationMap = new Map<
      string,
      { partnerId: string; lastMessage: (typeof allMessages)[0]; unreadCount: number }
    >()

    for (const msg of allMessages || []) {
      const isSender = msg.sender_id === user.id
      if (isSender && msg.deleted_by_sender) continue
      if (!isSender && msg.deleted_by_receiver) continue

      const partnerId = isSender ? msg.receiver_id : msg.sender_id
      if (!conversationMap.has(partnerId)) {
        conversationMap.set(partnerId, { partnerId, lastMessage: msg, unreadCount: 0 })
      }
      const conv = conversationMap.get(partnerId)!
      if (!isSender && !msg.is_read) {
        conv.unreadCount++
      }
    }

    const conversations = Array.from(conversationMap.values()).sort(
      (a, b) =>
        new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime()
    )

    // 상대 프로필 조회
    const partnerIds = conversations.map((c) => c.partnerId)
    let profiles: { user_id: string; nickname: string; avatar_url: string | null }[] = []
    if (partnerIds.length > 0) {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, nickname, avatar_url")
        .in("user_id", partnerIds)
      profiles = data || []
    }

    return NextResponse.json({ conversations, profiles })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

/**
 * POST /api/messages
 * 쪽지 보내기
 */
export async function POST(request: NextRequest) {
  try {
    const limited = checkRateLimit(request, "STANDARD")
    if (limited) return limited

    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const body = await request.json()
    const result = SendMessageSchema.safeParse(body)
    if (!result.success) {
      return apiBadRequest(result.error.issues[0]?.message || "잘못된 요청입니다.")
    }

    const { receiver_id, content } = result.data

    if (receiver_id === user.id) {
      return apiBadRequest("자기 자신에게 쪽지를 보낼 수 없습니다.")
    }

    const supabase = createServiceRoleClient()

    // 차단 여부 확인
    const { data: blocked } = await supabase
      .from("user_blocks")
      .select("id")
      .or(
        `and(blocker_id.eq.${user.id},blocked_id.eq.${receiver_id}),and(blocker_id.eq.${receiver_id},blocked_id.eq.${user.id})`
      )
      .limit(1)
      .single()

    if (blocked) {
      return NextResponse.json(
        { error: "차단된 유저에게 쪽지를 보낼 수 없습니다." },
        { status: 403 }
      )
    }

    const { data: message, error } = await supabase
      .from("direct_messages")
      .insert({
        sender_id: user.id,
        receiver_id,
        content: content.trim(),
      })
      .select()
      .single()

    if (error) return apiError("쪽지 전송 실패", 500, error)

    // 알림 생성 (비동기)
    supabase
      .from("notifications")
      .insert({
        user_id: receiver_id,
        type: "message",
        actor_id: user.id,
        is_read: false,
      })
      .then(
        () => {},
        () => {}
      )

    return NextResponse.json({ message }, { status: 201 })
  } catch (error) {
    return apiError("서버 오류", 500, error)
  }
}

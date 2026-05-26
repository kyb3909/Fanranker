import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { z } from "zod"
import { apiError, apiBadRequest, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import { createServiceRoleClient } from "@/lib/supabase/server"

const MAX_BODY = 200

const Body = z.object({
  body: z
    .string()
    .min(1)
    .max(MAX_BODY)
    .transform((s) => s.trim()),
})

interface MessageRow {
  id: string
  room_id: string
  user_id: string | null
  display_name: string
  kind: string
  body: string | null
  payload: unknown
  created_at: string
}

interface SeatRow {
  user_id: string | null
  display_name: string
  left_at: string | null
}

/**
 * POST /api/draft-rooms/[id]/chat
 *
 * 방 멤버만. rate-limit 적용. body ≤ 200자. trim 후 빈 문자열이면 거부.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = checkRateLimit(request, "STRICT")
    if (limited) return limited

    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const { id: roomId } = await params
    const body = await request.json().catch(() => ({}))
    const parsed = Body.safeParse(body)
    if (!parsed.success) return apiBadRequest("invalid body")
    const text = parsed.data.body
    if (text.length === 0) return apiBadRequest("empty")

    const supabase = createServiceRoleClient()

    // 멤버십 확인
    const { data: seat } = await supabase
      .from("draft_room_seats")
      .select("user_id, display_name, left_at")
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .is("left_at", null)
      .maybeSingle<SeatRow>()
    if (!seat) {
      return NextResponse.json({ error: "방 멤버가 아닙니다" }, { status: 403 })
    }

    const { data: inserted, error } = await supabase
      .from("draft_room_messages")
      .insert({
        room_id: roomId,
        user_id: user.id,
        display_name: seat.display_name,
        kind: "chat",
        body: text,
        payload: null,
      })
      .select("*")
      .single<MessageRow>()
    if (error) {
      return apiError("메시지 저장 실패", 500, error)
    }

    return NextResponse.json({ message: inserted })
  } catch (e) {
    return apiError("채팅 실패", 500, e)
  }
}

/**
 * GET /api/draft-rooms/[id]/chat?limit=N
 *
 * 최근 N개 메시지. 방 멤버만 (서버에서 검증).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const { id: roomId } = await params
    const url = new URL(request.url)
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200)

    const supabase = createServiceRoleClient()
    const { data: seat } = await supabase
      .from("draft_room_seats")
      .select("user_id")
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .maybeSingle<{ user_id: string | null }>()
    if (!seat) {
      return NextResponse.json({ error: "방 멤버가 아닙니다" }, { status: 403 })
    }

    const { data } = await supabase
      .from("draft_room_messages")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(limit)
      .returns<MessageRow[]>()

    return NextResponse.json({ messages: (data ?? []).reverse() })
  } catch (e) {
    return apiError("메시지 조회 실패", 500, e)
  }
}

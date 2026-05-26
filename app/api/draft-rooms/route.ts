import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { z } from "zod"
import { apiError, apiBadRequest, apiUnauthorized, checkRateLimit } from "@/lib/api-error"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { createRoom, listOpenRooms } from "@/lib/draft/rooms"

const CreateRoomSchema = z.object({
  gameSlug: z.string().default("epl"),
  formation: z.string().default("4-3-3"),
  isPrivate: z.boolean().default(false),
  maxParticipants: z.number().int().min(2).max(4).default(4),
})

/**
 * GET /api/draft-rooms
 *
 * 공개 대기 방 목록 (status='waiting' AND NOT private).
 * 익명도 호출 가능.
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "24", 10) || 24, 100)
    const rooms = await listOpenRooms(limit)
    return NextResponse.json({ rooms })
  } catch (e) {
    return apiError("방 목록 조회 실패", 500, e)
  }
}

/**
 * POST /api/draft-rooms
 *
 * 방 생성. 호스트는 자동으로 좌석 0에 점유.
 * 동시에 같은 사용자가 다른 active 방에 있으면 자동 leave.
 */
export async function POST(request: NextRequest) {
  try {
    const limited = checkRateLimit(request, "STRICT")
    if (limited) return limited

    const user = await currentUser()
    if (!user) return apiUnauthorized()

    const body = await request.json().catch(() => ({}))
    const parsed = CreateRoomSchema.safeParse(body)
    if (!parsed.success) return apiBadRequest("invalid body")

    const displayName = await getDisplayName(user.id, user.firstName)
    if (!displayName) return apiBadRequest("profile not found")

    const room = await createRoom({
      hostUserId: user.id,
      hostDisplayName: displayName,
      gameSlug: parsed.data.gameSlug,
      formation: parsed.data.formation,
      isPrivate: parsed.data.isPrivate,
      maxParticipants: parsed.data.maxParticipants,
    })

    return NextResponse.json({ room })
  } catch (e) {
    return apiError("방 생성 실패", 500, e)
  }
}

/**
 * Clerk user id → profiles.nickname.
 * 닉네임 없으면 Clerk firstName fallback.
 */
async function getDisplayName(userId: string, firstName: string | null): Promise<string | null> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from("profiles")
    .select("nickname")
    .eq("user_id", userId)
    .maybeSingle<{ nickname: string | null }>()
  return data?.nickname ?? firstName ?? null
}

/**
 * 메타버스 API 공용 인증 헬퍼.
 *
 * Clerk 인증 유저 또는 (dev 환경에서만) 게스트 식별자를 resolve.
 * 프로덕션에선 반드시 Clerk userId만 허용됨.
 */

import { auth } from "@clerk/nextjs/server"
import { METAVERSE_GUEST_HEADER } from "@/lib/metaverse/constants"

const GUEST_ID_PATTERN = /^guest-[a-z0-9-]{4,40}$/i

interface ResolvedMetaverseUser {
  userId: string
  isGuest: boolean
}

export async function resolveMetaverseUser(req: Request): Promise<ResolvedMetaverseUser | null> {
  const { userId: clerkUserId } = await auth()
  if (clerkUserId) {
    return { userId: clerkUserId, isGuest: false }
  }

  // 프로덕션에선 반드시 Clerk — 게스트 거부
  if (process.env.NODE_ENV !== "development") return null

  const guestId = req.headers.get(METAVERSE_GUEST_HEADER)
  if (guestId && GUEST_ID_PATTERN.test(guestId)) {
    return { userId: guestId, isGuest: true }
  }
  return null
}

// 하위 호환 재수출 — 기존 server-side import 경로 유지.
// 클라이언트 컴포넌트는 `lib/metaverse/constants` 에서 직접 import 할 것.
export { METAVERSE_GUEST_HEADER }

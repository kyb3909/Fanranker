import { currentUser } from '@clerk/nextjs/server'

// Re-export bot utils (서버 전용 파일에서도 접근 가능하도록)
export { BOT_IDS, isBotUser, getBotProfile } from './bot'

export interface DraftUser {
  id: string
  displayName: string
  avatarUrl: string | null
  isGuest: boolean
}

const GUEST_NAMES = [
  '축구왕', '드래프트고수', '선수덕후', '감독님', '스카우터',
  '전술가', '에이스', '캡틴', '골잡이', '수비신',
  '미드마에스트로', '프리킥왕', '파이터', '챔피언', '루키',
]

/**
 * 드래프트 유저 식별: Clerk 로그인 → 게스트 ID 헤더 순서
 * 게스트는 x-guest-id 헤더로 식별
 */
export async function getDraftUser(request: Request): Promise<DraftUser | null> {
  // 1. Clerk 인증 시도
  try {
    const user = await currentUser()
    if (user) {
      return {
        id: user.id,
        displayName: user.username || user.firstName || '유저',
        avatarUrl: user.imageUrl || null,
        isGuest: false,
      }
    }
  } catch {
    // Clerk 실패 시 게스트로 진행
  }

  // 2. 게스트 ID
  const guestId = request.headers.get('x-guest-id')
  if (guestId && guestId.startsWith('guest_')) {
    const hash = guestId.slice(6)
    const nameIndex = Math.abs(hashCode(hash)) % GUEST_NAMES.length
    return {
      id: guestId,
      displayName: `${GUEST_NAMES[nameIndex]}#${hash.slice(0, 4)}`,
      avatarUrl: null,
      isGuest: true,
    }
  }

  return null
}

function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return hash
}

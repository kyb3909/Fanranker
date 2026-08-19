/**
 * 봇 계정 판별 (2026-08-20 — "담벼락 지금" 인터리브에서 사람 글만 골라내기 위해 승격).
 *
 * 정규식은 app/api/profile/[userId]/route.ts 의 is_bot 판정과 같은 값이다 — 거기서
 * 복제해 왔고, 그쪽도 이 모듈을 쓰도록 바꿨다. 클라이언트 컴포넌트가 import 하므로
 * 서버 전용 모듈(lib/news/publish.ts 등)에 두면 안 된다.
 */
const BOT_USER_ID_RE = /(_bot$|seed_bot|^user_bot_|^user_reddit_)/

export function isBotUserId(userId: string | null | undefined): boolean {
  return !!userId && BOT_USER_ID_RE.test(userId)
}

/** 불판(라이브 매치 스레드) 봇 — 닉네임 "중계불판" (2026-08-20 운영자 지정) */
export const MATCH_THREAD_BOT_USER_ID = "user_bot_matchthread"

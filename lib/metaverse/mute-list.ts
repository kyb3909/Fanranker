/**
 * 개인 뮤트 목록 — localStorage 기반, 서버 동기 안 함.
 *
 * "이 사람 내 눈에만 안 보이게" 개인 설정. 서버에 저장하지 않으므로
 * 탭/기기별로 별개. 신고·차단 (서버 동기 필요한 경우) 은 별도 플로우.
 */

const STORAGE_KEY = "metaverse:muted-users"
const EVENT_NAME = "metaverse:mute:changed"

function readSet(): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((x): x is string => typeof x === "string"))
  } catch {
    return new Set()
  }
}

function writeSet(next: Set<string>): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
    window.dispatchEvent(new CustomEvent(EVENT_NAME))
  } catch {
    /* quota exceeded 등 — 무시 */
  }
}

export function getMutedUsers(): Set<string> {
  return readSet()
}

export function isMuted(userId: string): boolean {
  return readSet().has(userId)
}

export function muteUser(userId: string): void {
  if (!userId) return
  const s = readSet()
  if (s.has(userId)) return
  s.add(userId)
  writeSet(s)
}

export function unmuteUser(userId: string): void {
  const s = readSet()
  if (!s.delete(userId)) return
  writeSet(s)
}

export function toggleMute(userId: string): boolean {
  const next = !isMuted(userId)
  if (next) muteUser(userId)
  else unmuteUser(userId)
  return next
}

/** 뮤트 목록 변경 시 콜백. 반환값 호출하면 구독 해제. */
export function onMuteChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(EVENT_NAME, cb)
  return () => window.removeEventListener(EVENT_NAME, cb)
}

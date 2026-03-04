/**
 * 드래프트 API 호출 헬퍼
 * 게스트 ID를 x-guest-id 헤더로 자동 포함
 */

function getGuestId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('draft_guest_id')
  if (!id) {
    id = `guest_${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem('draft_guest_id', id)
  }
  return id
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const guestId = getGuestId()
  if (guestId) h['x-guest-id'] = guestId
  return h
}

export async function draftFetch(url: string, options?: RequestInit) {
  return fetch(url, {
    ...options,
    headers: {
      ...headers(),
      ...(options?.headers || {}),
    },
  })
}

export async function draftPost(url: string, body?: unknown) {
  return draftFetch(url, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  })
}

export async function draftGet(url: string) {
  return draftFetch(url)
}

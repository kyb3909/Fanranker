/**
 * 운영 할 일 보드 — 순수 모듈 (2026-09-08).
 *
 * 운영자: "해야 할 것들을 Trello 칸반처럼 옆으로 옮기는 식으로 어드민에 표시해줘."
 *
 * 카드는 `admin_board_cards` 한 표에 살고, 위치는 열(`status`)과 열 안 순서(`position`)
 * 둘로만 정해진다. 옮기기 계산은 여기서만 한다 — 드래그·화살표·API 가 같은 답을 내야
 * "화면에선 옮겼는데 새로고침하면 제자리"가 안 생긴다.
 */

export const BOARD_STATUSES = ["todo", "doing", "review", "done"] as const
export type BoardStatus = (typeof BOARD_STATUSES)[number]

export const BOARD_STATUS_LABEL: Record<BoardStatus, string> = {
  todo: "할 일",
  doing: "진행 중",
  review: "확인 중",
  done: "완료",
}

export function isBoardStatus(v: unknown): v is BoardStatus {
  return typeof v === "string" && (BOARD_STATUSES as readonly string[]).includes(v)
}

export interface BoardCard {
  id: string
  title: string
  detail: string
  tag: string | null
  effort: string | null
  status: BoardStatus
  position: number
  created_at: string
  updated_at: string
}

/** 서버에 보낼 위치 변경 한 건 */
export interface CardMove {
  id: string
  status: BoardStatus
  position: number
}

/** 열 안 순서 — position 이 같으면 먼저 고친 것이 앞 */
export function sortCards<T extends { position: number; updated_at: string }>(cards: T[]): T[] {
  return [...cards].sort(
    (a, b) => a.position - b.position || a.updated_at.localeCompare(b.updated_at)
  )
}

export function columnOf<T extends BoardCard>(cards: T[], status: BoardStatus): T[] {
  return sortCards(cards.filter((c) => c.status === status))
}

/**
 * 카드를 다른 열이나 다른 자리로 옮긴다.
 * 바뀐 열의 position 을 0부터 다시 매기고, 실제로 값이 달라진 카드만 `moves` 에 담는다.
 * `toIndex` 를 안 주거나 범위를 넘으면 맨 끝. 같은 자리면 `moves` 는 비어 있다.
 */
export function moveCard<T extends BoardCard>(
  cards: T[],
  id: string,
  toStatus: BoardStatus,
  toIndex?: number
): { cards: T[]; moves: CardMove[] } {
  const card = cards.find((c) => c.id === id)
  if (!card) return { cards, moves: [] }

  const fromStatus = card.status
  const source = columnOf(cards, fromStatus).filter((c) => c.id !== id)
  const target = fromStatus === toStatus ? source : columnOf(cards, toStatus)
  const idx = toIndex === undefined ? target.length : Math.max(0, Math.min(toIndex, target.length))
  const nextTarget = [...target.slice(0, idx), { ...card, status: toStatus }, ...target.slice(idx)]

  const touched = new Map<string, T>()
  nextTarget.forEach((c, i) => touched.set(c.id, { ...c, position: i }))
  if (fromStatus !== toStatus) source.forEach((c, i) => touched.set(c.id, { ...c, position: i }))

  const moves: CardMove[] = []
  const next = cards.map((c) => {
    const t = touched.get(c.id)
    if (!t) return c
    if (t.status !== c.status || t.position !== c.position) {
      moves.push({ id: c.id, status: t.status, position: t.position })
    }
    return t
  })
  return { cards: next, moves }
}

/** 화살표 버튼용 — 왼쪽/오른쪽 열. 끝이면 null */
export function stepStatus(status: BoardStatus, dir: -1 | 1): BoardStatus | null {
  const i = BOARD_STATUSES.indexOf(status) + dir
  return BOARD_STATUSES[i] ?? null
}

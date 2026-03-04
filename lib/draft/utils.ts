/**
 * 6자리 영숫자 방 코드 생성 (혼동 문자 제외)
 */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 0,O,I,1 제외
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

/**
 * 스네이크 드래프트 순서 생성
 * 예: 4팀 11픽 → [0,1,2,3, 3,2,1,0, 0,1,2,3, ...]
 */
export function generateSnakeDraftOrder(totalPicks: number, teamCount: number = 4): number[] {
  const order: number[] = []
  const rounds = Math.ceil(totalPicks / teamCount)

  for (let round = 0; round < rounds; round++) {
    const isReverse = round % 2 === 1
    for (let team = 0; team < teamCount; team++) {
      if (order.length >= totalPicks) break
      order.push(isReverse ? teamCount - 1 - team : team)
    }
  }

  return order.slice(0, totalPicks)
}

/**
 * 좌석 인덱스에 대한 팀 색상
 */
export const SEAT_COLORS = [
  { bg: 'bg-blue-500', text: 'text-blue-500', light: 'bg-blue-50', ring: 'ring-blue-500', name: '블루' },
  { bg: 'bg-red-500', text: 'text-red-500', light: 'bg-red-50', ring: 'ring-red-500', name: '레드' },
  { bg: 'bg-green-500', text: 'text-green-500', light: 'bg-green-50', ring: 'ring-green-500', name: '그린' },
  { bg: 'bg-amber-500', text: 'text-amber-500', light: 'bg-amber-50', ring: 'ring-amber-500', name: '옐로' },
] as const

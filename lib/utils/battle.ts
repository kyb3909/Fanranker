// ============================================
// 배틀 유틸 함수
// ============================================

export function formatBattleTime(dateStr: string): string {
  const d = new Date(dateStr)
  const month = d.getMonth() + 1
  const day = d.getDate()
  const hours = d.getHours().toString().padStart(2, "0")
  const mins = d.getMinutes().toString().padStart(2, "0")
  return `${month}/${day} ${hours}:${mins}`
}

export function getBattleProgress(side_a_score: number, side_b_score: number): number {
  const total = side_a_score + side_b_score
  if (total === 0) return 50
  return Math.round((side_a_score / total) * 100)
}

export function getRoundLabel(bracketSize: number, round: number): string {
  const remaining = bracketSize / Math.pow(2, round - 1)
  if (remaining === 2) return "결승"
  if (remaining === 4) return "4강"
  return `${remaining}강`
}

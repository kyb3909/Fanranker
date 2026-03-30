/**
 * 두 수치의 변화율(%) 계산.
 * previous=0이면 current>0일 때 100, 아니면 0 반환.
 * 소수점 1자리 반올림.
 */
export function changePercent(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 1000) / 10
}

/**
 * 게시물 "온도" 계산 (인기 점수)
 *
 * - 기본 점수: (추천×2 + 댓글×3) / 10
 * - 시간 경과에 따른 반감기 decay: base × 0.5^(경과시간/반감기)
 * - 반감기 기본값: 24시간 (HALF_LIFE_HOURS)
 *
 * @see TEMPERATURE_FORMULA.md
 */

export const HALF_LIFE_HOURS = 24

export interface TemperatureInput {
  vote_count: number
  comment_count: number
  created_at: string
}

/**
 * 반감기를 적용한 온도 계산
 *
 * @param post - vote_count, comment_count, created_at
 * @param now - 기준 시각 (기본: 현재)
 * @returns 0~100 범위의 온도 (소수 첫째자리)
 */
export function computeTemperature(
  post: TemperatureInput,
  now: Date = new Date()
): number {
  const base = (post.vote_count * 2 + post.comment_count * 3) / 10
  const created = new Date(post.created_at).getTime()
  const ageHours = (now.getTime() - created) / (1000 * 60 * 60)
  const decay = Math.pow(0.5, ageHours / HALF_LIFE_HOURS)
  const value = base * decay
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10))
}

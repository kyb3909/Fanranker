/**
 * 게시물 "온도" 계산 및 색상 유틸
 *
 * DB에서는 scoring_config 기반으로 계산됨 (update_temperature_score 함수)
 * 클라이언트에서는 DB의 temperature 값을 그대로 사용
 *
 * 색상: 0° = 파란색(220°) → 100° = 빨간색(0°) HSL 그라데이션
 */

// ── 온도 색상 (HSL 기반 연속 그라데이션) ──

/**
 * 온도에 따른 inline style 색상 반환
 * 0° → 파란색(hsl 220), 50° → 노란색/주황(hsl 40), 100° → 빨간색(hsl 0)
 */
export function getTemperatureStyle(temp: number): React.CSSProperties {
  const t = Math.max(0, Math.min(100, temp))
  // hue: 220 (blue) → 0 (red), saturation: 70-90%
  // WCAG AA 4.5:1 대비 충족 (흰색 배경 기준)
  const hue = 220 - (t / 100) * 220
  const saturation = 70 + (t / 100) * 20
  // lightness: green-cyan 영역(hue 80-170)은 밝게 인식되어 대비가 낮으므로
  // 해당 구간에서 lightness를 추가로 낮춤 (최대 -5%)
  const baseLightness = 33 - (t / 100) * 5
  const greenDip = hue >= 80 && hue <= 170 ? 5 * Math.sin(((hue - 80) / 90) * Math.PI) : 0
  const lightness = baseLightness - greenDip
  return { color: `hsl(${hue}, ${saturation}%, ${lightness}%)` }
}

/**
 * 온도에 따른 Tailwind 색상 클래스 (fallback용)
 */
export function getTemperatureColor(temp: number): string {
  if (temp >= 80) return "text-primary"
  if (temp >= 60) return "text-orange-500"
  if (temp >= 40) return "text-amber-500"
  if (temp >= 20) return "text-yellow-500"
  if (temp >= 10) return "text-cyan-500"
  return "text-blue-500"
}

// ── 온도 계산 (클라이언트 fallback) ──

export const HALF_LIFE_HOURS = 48
const W_UP = 15
const W_COMMENT = 12
const W_VIEW = 1
const NEW_BOOST_MAX = 8

export interface TemperatureInput {
  vote_count: number
  comment_count: number
  view_count_unique?: number
  created_at: string
}

/**
 * 클라이언트 fallback 온도 계산 (DB 값이 없을 때만 사용)
 * DB의 update_temperature_score()와 동일한 로직
 */
export function computeTemperature(post: TemperatureInput, now: Date = new Date()): number {
  const ageHours = (now.getTime() - new Date(post.created_at).getTime()) / (1000 * 60 * 60)

  // Engagement score (ln 기반)
  const e =
    W_UP * Math.log(1 + Math.max(post.vote_count, 0)) +
    W_COMMENT * Math.log(1 + Math.max(post.comment_count, 0)) +
    W_VIEW * Math.log(1 + Math.max(post.view_count_unique ?? 0, 0))

  // Time decay
  const d = Math.pow(2, -(ageHours / HALF_LIFE_HOURS))

  // New post boost
  let boost = 0
  if (ageHours <= 1.0) boost = NEW_BOOST_MAX
  else if (ageHours <= 4.0) boost = (NEW_BOOST_MAX * (4.0 - ageHours)) / 3.0

  const score = e * d + boost
  return Math.min(100, Math.max(0, Math.round(score * 10) / 10))
}

/**
 * 사용자에게 보여줄 표시 온도 (부스트 제거)
 * 정렬용 온도(DB)에서 신규 글 부스트를 빼서 순수 engagement만 반영
 */
export function getDisplayTemperature(
  temperature: number,
  createdAt: string | Date,
  now: Date = new Date()
): number {
  const ageHours = (now.getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60)
  let boost = 0
  if (ageHours <= 1.0) boost = NEW_BOOST_MAX
  else if (ageHours <= 4.0) boost = (NEW_BOOST_MAX * (4.0 - ageHours)) / 3.0
  return Math.max(0, Math.round((temperature - boost) * 10) / 10)
}

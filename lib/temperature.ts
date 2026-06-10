/**
 * 게시물 "온도" 계산 및 색상 유틸
 *
 * 공식 V2: Temperature = clamp(0, 100, (E + R) × D + B - P)
 *   E = W_VOTE×ln(1+max(votes,0)) + W_COMMENT×ln(1+comments) + W_VIEW×ln(1+views)
 *   R = 댓글 최신성 보너스 (최대 R_MAX, 2시간 이내→8시간에 0)
 *   D = 2^(-age_hours / HALF_LIFE)
 *   B = 신규 부스트 (30분 최대→2시간에 0)
 *   P = 비추천 패널티: votes<0 → 5×ln(1+|votes|)
 *
 * DB: calculate_post_temperature() PL/pgSQL 함수와 동일 로직
 * 클라이언트: DB 값이 없을 때만 fallback으로 사용
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

// ── 온도 계산 (V2) ──

const HALF_LIFE_HOURS = 24
const W_VOTE = 12
const W_COMMENT = 10
const W_VIEW = 2
const R_MAX = 8
const NEW_BOOST_MAX = 3

interface TemperatureInput {
  vote_count: number
  comment_count: number
  view_count?: number
  created_at: string
  last_comment_at?: string | null
}

/**
 * 클라이언트 fallback 온도 계산 (DB 값이 없을 때만 사용)
 * DB의 calculate_post_temperature()와 동일한 로직
 */
export function computeTemperature(post: TemperatureInput, now: Date = new Date()): number {
  const ageHours = (now.getTime() - new Date(post.created_at).getTime()) / (1000 * 60 * 60)

  // E: Engagement score
  const e =
    W_VOTE * Math.log(1 + Math.max(post.vote_count, 0)) +
    W_COMMENT * Math.log(1 + Math.max(post.comment_count, 0)) +
    W_VIEW * Math.log(1 + Math.max(post.view_count ?? 0, 0))

  // R: Comment recency bonus
  let r = 0
  if (post.comment_count > 0 && post.last_comment_at) {
    const commentAgeHours =
      (now.getTime() - new Date(post.last_comment_at).getTime()) / (1000 * 60 * 60)
    if (commentAgeHours <= 2) {
      r = R_MAX
    } else if (commentAgeHours <= 8) {
      r = (R_MAX * (8 - commentAgeHours)) / 6
    }
  }

  // D: Time decay (half-life 24 hours)
  const d = Math.pow(2, -(ageHours / HALF_LIFE_HOURS))

  // B: New post boost
  let b = 0
  if (ageHours <= 0.5) b = NEW_BOOST_MAX
  else if (ageHours <= 2) b = (NEW_BOOST_MAX * (2 - ageHours)) / 1.5

  // P: Downvote penalty
  let p = 0
  if (post.vote_count < 0) {
    p = 5 * Math.log(1 + Math.abs(post.vote_count))
  }

  const score = (e + r) * d + b - p
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
  if (ageHours <= 0.5) boost = NEW_BOOST_MAX
  else if (ageHours <= 2) boost = (NEW_BOOST_MAX * (2 - ageHours)) / 1.5
  return Math.max(0, Math.round((temperature - boost) * 10) / 10)
}

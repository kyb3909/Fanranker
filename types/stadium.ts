/**
 * 스타디움 지도 공유 타입.
 *
 * 원래 components/stadium/region-map.tsx 에 살던 타입 — stadium-info-card 가
 * 역방향 import 하면서 region-map ↔ info-card 순환 의존이 생겨 추출했다
 * (madge --circular 1건 해소, 2026-06-11).
 */

export interface MapPin {
  team_id: string
  name: string
  team_name: string
  team_short_name: string
  pin_x: number // 0-100
  pin_y: number // 0-100
  color: string
  level: number
  total_points: number
  fan_count: number
  progress_pct: number
  pinImage?: string // optional custom pin image URL
}

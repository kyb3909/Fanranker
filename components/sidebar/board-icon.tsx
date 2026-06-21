/**
 * 게시판 메뉴 아이콘 — shadcn(lucide) 라인 아이콘으로 통일.
 *
 * 라이프 보드(게임·영화·음악·아이돌·애니·자유) + 배구는 lucide 기본 아이콘을 쓰고,
 * lucide 에 공 아이콘이 없는 축구·야구·농구는 lucide 톤(24×24, stroke=currentColor 2, round)에
 * 맞춘 커스텀 라인 SVG 로 그린다. 색은 부모 span 의 color(currentColor) 를 상속.
 *
 * slug 기준 매핑 (legacy 별칭 포함 — lib/constants/communities.ts COMMUNITY_NAMES 참고).
 */
import { Gamepad2, Film, Music, Mic, Tv, MessageSquare, Volleyball, Hash } from "lucide-react"

interface IconProps {
  className?: string
}

const SVG_BASE = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
}

/** 축구공 — 외곽 원 + 중앙 오각형 + 5방향 스포크 */
function SoccerBall({ className }: IconProps) {
  return (
    <svg {...SVG_BASE} className={className} aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8.5 15.33 10.92 14.06 14.83 9.94 14.83 8.67 10.92Z" />
      <path d="M12 8.5V2 M15.33 10.92 21.51 8.91 M14.06 14.83 17.9 20.09 M9.94 14.83 6.1 20.09 M8.67 10.92 2.49 8.91" />
    </svg>
  )
}

/** 야구공 — 좌우 곡선 솔기 2줄 */
function Baseball({ className }: IconProps) {
  return (
    <svg {...SVG_BASE} className={className} aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M5.5 4.5C8 7 8 17 5.5 19.5" />
      <path d="M18.5 4.5C16 7 16 17 18.5 19.5" />
    </svg>
  )
}

/** 농구공 — 세로·가로 + 좌우 곡선 솔기 */
function Basketball({ className }: IconProps) {
  return (
    <svg {...SVG_BASE} className={className} aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2v20 M2 12h20 M5 5C9 9 9 15 5 19 M19 5C15 9 15 15 19 19" />
    </svg>
  )
}

/**
 * slug 또는 한글 이름(축구/야구/…) 둘 다 허용 — 게시판 아이콘 단일 출처.
 * 곳곳에 흩어진 이모지/맵 대신 이걸 쓰면 사이트 전체 게시판 아이콘이 통일된다.
 */
export function BoardIcon({ slug, className }: { slug: string; className?: string }) {
  switch (slug) {
    case "football":
    case "soccer":
    case "overseas-football":
    case "domestic-football":
    case "축구":
      return <SoccerBall className={className} />
    case "baseball":
    case "야구":
      return <Baseball className={className} />
    case "basketball":
    case "농구":
      return <Basketball className={className} />
    case "volleyball":
    case "배구":
      return <Volleyball className={className} aria-hidden />
    case "game":
    case "esports":
    case "게임":
      return <Gamepad2 className={className} aria-hidden />
    case "movies":
    case "영화":
      return <Film className={className} aria-hidden />
    case "music":
    case "음악":
      return <Music className={className} aria-hidden />
    case "idol":
    case "아이돌":
      return <Mic className={className} aria-hidden />
    case "anime":
    case "애니":
      return <Tv className={className} aria-hidden />
    case "free-board":
    case "free":
    case "tips":
    case "자유":
      return <MessageSquare className={className} aria-hidden />
    default:
      return <Hash className={className} aria-hidden />
  }
}

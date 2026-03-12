import { z } from "zod"

// ── Types ──
export interface UnsettledGame {
  id: string
  game_no: number
  sport: string
  game_type: string
  home_team: string
  away_team: string
  match_time: string
  status: string
  result: string | null
  home_score: number | null
  away_score: number | null
  daily_round_id: string | null
  has_result: boolean
  handicap: number | null
  over_under_line: number | null
}

// ── Constants ──
export const sportLabels: Record<string, string> = {
  soccer: "축구",
  basketball: "농구",
  baseball: "야구",
  volleyball: "배구",
  hockey: "하키",
  esports: "e스포츠",
}

export const statusLabels: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  scheduled: { label: "예정", variant: "outline" },
  in_progress: { label: "진행중", variant: "default" },
  completed: { label: "완료", variant: "secondary" },
  cancelled: { label: "취소", variant: "destructive" },
}

const RESULT_OPTIONS: Record<string, { label: string; value: string }[]> = {
  일반: [
    { label: "홈 승", value: "home" },
    { label: "무승부", value: "draw" },
    { label: "원정 승", value: "away" },
  ],
  핸디캡: [
    { label: "홈 승", value: "home" },
    { label: "무승부", value: "draw" },
    { label: "원정 승", value: "away" },
  ],
  S핸디캡: [
    { label: "홈 승", value: "home" },
    { label: "무승부", value: "draw" },
    { label: "원정 승", value: "away" },
  ],
  언더오버: [
    { label: "오버", value: "over" },
    { label: "언더", value: "under" },
  ],
  S언더오버: [
    { label: "오버", value: "over" },
    { label: "언더", value: "under" },
  ],
  SUM: [
    { label: "홀", value: "odd" },
    { label: "짝", value: "even" },
  ],
}

export function getResultOptions(gameType: string) {
  return RESULT_OPTIONS[gameType] || RESULT_OPTIONS["일반"]
}

export function deriveResult(
  gameType: string,
  homeScore: number,
  awayScore: number,
  handicap: number | null,
  overUnderLine: number | null
): string {
  if (gameType === "핸디캡" || gameType === "S핸디캡") {
    const h = handicap ?? 0
    const adjusted = homeScore + h
    if (adjusted > awayScore) return "home"
    if (adjusted < awayScore) return "away"
    return "draw"
  }
  if (gameType === "언더오버" || gameType === "S언더오버") {
    const total = homeScore + awayScore
    const line = overUnderLine ?? 0
    if (line === 0) return ""
    if (total > line) return "over"
    if (total < line) return "under"
    return ""
  }
  if (gameType === "SUM") {
    const total = homeScore + awayScore
    return total % 2 === 0 ? "even" : "odd"
  }
  if (homeScore > awayScore) return "home"
  if (homeScore < awayScore) return "away"
  return "draw"
}

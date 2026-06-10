/**
 * 드래프트 게임 시각화 헬퍼.
 *
 * Player 데이터(`lib/draft/players.ts`)에는 가격/포지션만 있고
 * tier(S/A/B/C) 나 팀별 액센트 컬러가 없으므로 여기서 derived.
 */

import type { Player, Position } from "./players"

type Tier = "S" | "A" | "B" | "C"

/** 가격 기반 등급 — FPL 가격대 기준 (£14↑ S, £8↑ A, £5↑ B, 나머지 C). */
function getTier(price: number): Tier {
  if (price >= 14) return "S"
  if (price >= 8) return "A"
  if (price >= 5) return "B"
  return "C"
}

/** 포지션별 배경 컬러 (디자인 PositionBadge 의 기본 매핑). */
export const POSITION_HEX: Record<Position, string> = {
  GK: "#c98615",
  DF: "#1f4d7a",
  MF: "#2a6a4a",
  FW: "#a0203b",
}

const POSITION_LABEL_KO: Record<Position, string> = {
  GK: "골키퍼",
  DF: "수비",
  MF: "미드",
  FW: "공격",
}

/** 팀별 액센트 컬러 (face block 그라디언트용). 알려진 팀만 매핑, 나머지는 포지션 색 fallback. */
const TEAM_ACCENT: Record<string, string> = {
  맨시티: "#6cabdd",
  리버풀: "#c8102e",
  토트넘: "#132257",
  아스널: "#ef0107",
  첼시: "#034694",
  맨유: "#da291c",
  뉴캐슬: "#241f20",
  "아스턴 빌라": "#670e36",
  아스턴빌라: "#670e36",
  브라이튼: "#0057b8",
  브렌트포드: "#e30613",
  웨스트햄: "#7a263a",
  풀럼: "#000000",
  에버튼: "#003399",
  노팅엄: "#dd0000",
  본머스: "#da291c",
  울버햄튼: "#fdb913",
  레스터: "#003090",
  사우샘프턴: "#d71920",
  입스위치: "#3764a9",
  "크리스탈 팰리스": "#1b458f",
  크리스탈팰리스: "#1b458f",
}

export function getTeamAccent(teamKo: string, position: Position): string {
  return TEAM_ACCENT[teamKo] ?? POSITION_HEX[position]
}

/** Player 의 face block 이모지 fallback (img 없으니 포지션 이니셜 표시용). */
export function getPlayerInitial(p: Player): string {
  // Korean first character
  return p.nameKo.charAt(0)
}

/** 평균 tier 계산 (S=4, A=3, B=2, C=1). */
function getAvgTier(players: Player[]): { avg: number | null; label: string } {
  if (players.length === 0) return { avg: null, label: "–" }
  const val: Record<Tier, number> = { S: 4, A: 3, B: 2, C: 1 }
  const avg = players.reduce((s, p) => s + val[getTier(p.price)], 0) / players.length
  const label = avg >= 3.5 ? "S" : avg >= 2.5 ? "A" : avg >= 1.5 ? "B" : "C"
  return { avg, label }
}

/** 라인업의 결 분석 — 강점/약점 자동 산출. */
export function analyzeLineup(players: Player[]): {
  strengths: string[]
  weaknesses: string[]
} {
  const val: Record<Tier, number> = { S: 4, A: 3, B: 2, C: 1 }
  const byPos: Record<Position, number> = { GK: 0, DF: 0, MF: 0, FW: 0 }
  players.forEach((p) => {
    byPos[p.position] += val[getTier(p.price)]
  })

  const strengths: string[] = []
  const weaknesses: string[] = []
  if (byPos.FW >= 10) strengths.push("전방 무게감")
  if (byPos.MF >= 9) strengths.push("미드 장악")
  if (byPos.DF >= 12) strengths.push("수비 안정")
  if (byPos.GK >= 3) strengths.push("골문 든든")

  if (players.length >= 6 && byPos.DF < 6) weaknesses.push("수비 가성비형")
  if (players.length >= 4 && byPos.FW < 3) weaknesses.push("공격 미흡")
  if (players.length >= 8 && byPos.MF < 5) weaknesses.push("중원 얇음")

  return { strengths, weaknesses }
}

import type { LfaStatRow } from "@/lib/lfa/match"

/** Display policy only: keep collecting all available statistics. */
export const PRIMARY_MATCH_STATS = [
  "기대득점 (xG)",
  "점유율",
  "슈팅",
  "유효 슈팅",
  "코너킥",
  "상대 박스 터치",
  "패스 성공률",
  "파울",
  "오프사이드",
  "빅찬스 미스",
  "크로스",
  "경고",
  "퇴장",
] as const

export function splitMatchStats(stats: LfaStatRow[]) {
  const byLabel = new Map(stats.map((s) => [s.label, s]))
  const primary = PRIMARY_MATCH_STATS.flatMap((label) => {
    const row = byLabel.get(label)
    return row ? [row] : []
  })
  const primaryLabels = new Set<string>(PRIMARY_MATCH_STATS)
  const additional = stats.filter((s) => !primaryLabels.has(s.label))
  return { primary, additional }
}

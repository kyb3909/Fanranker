/** 운영자가 정한 발매 범위. 팀명은 LFA 영문 원명만 정확히 대조한다. */
export type BetmanListing = "will_list" | "never" | "unknown"

const ALWAYS_LISTED = new Set([
  "EPL",
  "라리가",
  "세리에A",
  "분데스리",
  "프리그1",
  "UCL",
  "UEL",
  "UECL",
  "U슈퍼컵",
])
const CUP_LEAGUES: Readonly<Record<string, readonly string[]>> = {
  잉글FA컵: ["EPL", "EFL챔"],
  잉리그컵: ["EPL", "EFL챔"],
  잉슈퍼컵: ["EPL", "EFL챔"],
  스페FA컵: ["라리가"],
  이탈FA컵: ["세리에A"],
  독일FA컵: ["분데스리"],
  프랑FA컵: ["프리그1"],
  프슈퍼컵: ["프리그1"],
}

export function predictBetmanListing(
  f: {
    leagueCode: string
    homeTeamEn?: string
    awayTeamEn?: string
    homeTeam: string
    awayTeam: string
  },
  members: (leagueCode: string) => ReadonlySet<string>
): BetmanListing {
  if (ALWAYS_LISTED.has(f.leagueCode)) return "will_list"
  const leagues = CUP_LEAGUES[f.leagueCode]
  if (!leagues || !f.homeTeamEn?.trim() || !f.awayTeamEn?.trim()) return "unknown"
  const sets = leagues.map(members)
  // EPL만 있고 챔피언십 목록이 없으면 2부 팀을 미판매로 오판할 수 있다.
  if (sets.some((set) => set.size === 0)) return "unknown"
  return sets.some((set) => set.has(f.homeTeamEn!.trim())) &&
    sets.some((set) => set.has(f.awayTeamEn!.trim()))
    ? "will_list"
    : "never"
}

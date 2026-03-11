/**
 * 스크래퍼가 가져온 row 객체에서 순위 표시에 필요한 값 추출.
 * 네이버/영문 등 컬럼명 변동에 대응.
 */
export interface StandingsRow {
  teamName: string
  played: number
  points: number
  goalDiff: number
  wins: number
  losses: number
  draws: number
  /** 컨퍼런스/리그 (NBA: EASTERN/WESTERN, MLB: AL/NL, NPB: CL/PL) */
  group: string
  /** 디비전 (MLB: EAST/CENT/WEST) */
  division: string
}

const TEAM_KEYS = ["팀명", "팀", "team", "Team", "name", "Name", "클럽", "클럽명"]
const PLAYED_KEYS = ["경기", "경기수", "경기 수", "GP", "G", "P", "played", "Matches"]
const POINTS_KEYS = ["승점", "승점수", "점수", "Pts", "PTS", "pts", "points", "Points"]
const GD_KEYS = ["골득실", "득실차", "득실", "GD", "골득실차", "goalDiff", "Goal diff"]
const WINS_KEYS = ["승", "wins", "Wins", "W", "win"]
const LOSSES_KEYS = ["패", "losses", "Losses", "L", "lose", "loss"]
const DRAWS_KEYS = ["무", "draws", "Draws", "D", "draw"]
const GROUP_KEYS = ["group", "conf", "league", "conference"]
const DIVISION_KEYS = ["division", "div"]

function pickFirstNumber(row: Record<string, string | number>, keys: string[]): number {
  for (const k of keys) {
    const v = row[k]
    if (v !== undefined && v !== null && v !== "") {
      const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d-]/g, ""))
      if (!Number.isNaN(n)) return n
    }
  }
  return 0
}

function pickFirstString(row: Record<string, string | number>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k]
    if (v !== undefined && v !== null && v !== "") {
      return String(v).trim()
    }
  }
  return ""
}

export function mapRowToStandings(row: Record<string, string | number>): StandingsRow {
  return {
    teamName: pickFirstString(row, TEAM_KEYS) || String(row[Object.keys(row)[0]] ?? ""),
    played: pickFirstNumber(row, PLAYED_KEYS),
    points: pickFirstNumber(row, POINTS_KEYS),
    goalDiff: pickFirstNumber(row, GD_KEYS),
    wins: pickFirstNumber(row, WINS_KEYS),
    losses: pickFirstNumber(row, LOSSES_KEYS),
    draws: pickFirstNumber(row, DRAWS_KEYS),
    group: pickFirstString(row, GROUP_KEYS),
    division: pickFirstString(row, DIVISION_KEYS),
  }
}

export function mapRowsToStandings(rows: Record<string, string | number>[]): StandingsRow[] {
  return rows.map(mapRowToStandings)
}

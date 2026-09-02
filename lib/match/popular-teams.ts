/**
 * 인기 팀 — 일정에 **betman 이 없어도** 싣는 예외 (순수 모듈, 2026-09-02).
 *
 * 운영자: "일정은 오직 베트맨 기준 — 그 경기들만이 한국에서 인기가 있을 최소 기준치. 다만 빅6 와
 * 인기 팀으로 구분한 팀들은 예외. 포칼이나 컵대회에서 하부리그 팀과 만나도 그 팀들이 나왔으면."
 *
 * 인기 팀의 정의는 팀 게시판 레지스트리(lib/constants/team-boards.ts, EPL 6 + 유럽 8)와 같다 —
 * 운영자가 "인기 팀"으로 게시판을 열어 준 팀들이다. 시험이 두 목록이 갈라지지 않게 잡는다.
 *
 * ## 대조는 정확일치 별칭으로만
 * LFA 는 같은 이름을 여러 구단에 쓴다 (2026-08-10~ 실측: "Arsenal" 5개 id — 툴라·사란디·여자팀,
 * "Barcelona SC"(에콰도르), "Liverpool"(우루과이), "Inter Turku"·"Inter Miami", "Bayern II").
 * 토큰 겹침(teamMatches)으로 잡으면 이들이 전부 인기 팀이 된다. 그래서 LFA 가 실제로 쓰는
 * 표기와 사전 한글 표기를 **정확일치**로만 본다. 호출부(getFixturesForDay)는 대상 리그 안의
 * 행만 넘기므로 남미·유소년 동명 구단은 애초에 들어오지 않지만, 여기서도 걸러 둔다.
 */

import { TEAM_BOARDS } from "@/lib/constants/team-boards"
import { normTeam } from "@/lib/match/pair-fixtures"

/** 팀 게시판 slug → LFA 표기·사전 한글 표기 별칭 (전부 정확일치) */
export const POPULAR_TEAM_ALIASES: Record<string, readonly string[]> = {
  arsenal: ["Arsenal", "아스널", "아스날"],
  chelsea: ["Chelsea", "첼시"],
  liverpool: ["Liverpool", "리버풀"],
  mancity: ["Man. City", "Man City", "Manchester City", "맨체스터 시티", "맨시티"],
  manutd: [
    "Man. United",
    "Man Utd",
    "Man United",
    "Manchester United",
    "맨체스터 유나이티드",
    "맨유",
  ],
  tottenham: ["Tottenham", "Tottenham Hotspur", "Spurs", "토트넘 홋스퍼", "토트넘"],
  realmadrid: ["Real Madrid", "R. Madrid", "레알 마드리드"],
  barcelona: ["Barcelona", "FC Barcelona", "바르셀로나"],
  atletico: [
    "Atl. Madrid",
    "Atl Madrid",
    "Atletico Madrid",
    "Atlético Madrid",
    "아틀레티코 마드리드",
    "아틀레티코",
  ],
  bayern: [
    "Bayern Munich",
    "Bayern München",
    "Bayern Münih",
    "FC Bayern",
    "Bayern",
    "바이에른 뮌헨",
  ],
  dortmund: ["Dortmund", "B. Dortmund", "Borussia Dortmund", "보루시아 도르트문트", "도르트문트"],
  milan: ["Milan", "AC Milan", "AC밀란", "밀란"],
  juventus: ["Juventus", "유벤투스"],
  inter: ["Inter", "Internazionale", "Inter Milan", "인테르", "인테르나치오날레 밀라노"],
}

const NORMALIZED: ReadonlySet<string> = new Set(
  Object.values(POPULAR_TEAM_ALIASES)
    .flat()
    .map((a) => normTeam(a))
    .filter((a) => a.length > 0)
)

/** 이 이름(LFA 영문 또는 사전 한글)이 인기 팀인가 — 정확일치 */
export function isPopularTeamName(name: string | null | undefined): boolean {
  if (!name) return false
  const n = normTeam(name)
  return n.length > 0 && NORMALIZED.has(n)
}

/** 양 팀 중 하나라도 인기 팀이면 참. 한글화된 이름과 LFA 원명을 둘 다 본다 */
export function isPopularFixture(f: {
  homeTeam: string
  awayTeam: string
  homeTeamEn?: string
  awayTeamEn?: string
}): boolean {
  return (
    isPopularTeamName(f.homeTeam) ||
    isPopularTeamName(f.awayTeam) ||
    isPopularTeamName(f.homeTeamEn) ||
    isPopularTeamName(f.awayTeamEn)
  )
}

/** 레지스트리와 별칭 표가 갈라졌는지 — 시험이 부른다 */
export function popularTeamSlugsMissingAliases(): string[] {
  return Object.keys(TEAM_BOARDS).filter((slug) => !POPULAR_TEAM_ALIASES[slug]?.length)
}

/**
 * 매치 페이지 대상 리그 화이트리스트 (2026-08-16 운영자 확정).
 *
 * "모든 리그는 할 필요 없고 — 챔피언스·유로파·컨퍼런스, 유럽 5대 리그, 그리고
 * 5대 리그 주요 컵대회만." 매치 페이지 링크·라우팅이 이 목록을 본다.
 *
 * 코드는 betman `league_code` **실측값**이다 (2026-08-16 DB 조회) — 임의 축약이라
 * 추측으로 넣으면 안 맞는다 (예: 분데스리가는 '분데스리', 리그1은 '프리그1').
 * 아직 발매된 적 없는 대회(독일 슈퍼컵, 스페인 수페르코파 등)는 코드가 관측되면
 * 여기 한 줄 추가한다.
 */
export const MATCH_PAGE_LEAGUES: ReadonlySet<string> = new Set([
  // 유럽 대항전
  "UCL", // 챔피언스리그
  "UEL", // 유로파리그
  "UECL", // 컨퍼런스리그
  "U슈퍼컵", // UEFA 슈퍼컵

  // 유럽 5대 리그
  "EPL",
  "라리가",
  "세리에A",
  "분데스리",
  "프리그1",

  // 5대 리그 주요 컵대회
  "잉글FA컵",
  "잉리그컵", // 카라바오컵
  "잉슈퍼컵", // 커뮤니티 실드
  "스페FA컵", // 코파 델 레이
  "이탈FA컵", // 코파 이탈리아
  "독일FA컵", // DFB 포칼
  "프랑FA컵", // 쿠프 드 프랑스
  "프슈퍼컵", // 트로페 데 샹피옹
])

export function isMatchPageLeague(leagueCode: string | null | undefined): boolean {
  return !!leagueCode && MATCH_PAGE_LEAGUES.has(leagueCode)
}

/**
 * 경기 리포트 + 기초 스탯 대상 (2026-08-16 운영자: "5대 리그와 챔피언스리그 관련된
 * 것만"). 매치 페이지·일정 자체는 MATCH_PAGE_LEAGUES 전체가 대상이지만, FT 후
 * 리포트·스탯 파이프라인(LLM 비용 포함)은 이 목록에만 붙는다.
 */
export const MATCH_EXTRAS_LEAGUES: ReadonlySet<string> = new Set([
  "UCL",
  "EPL",
  "라리가",
  "세리에A",
  "분데스리",
  "프리그1",
  // EPL 팀 간 경기라 "5대 리그 관련"으로 포함 (2026-08-16 운영자 — 커뮤니티 실드)
  "잉슈퍼컵",
])

export function isMatchExtrasLeague(leagueCode: string | null | undefined): boolean {
  return !!leagueCode && MATCH_EXTRAS_LEAGUES.has(leagueCode)
}

/**
 * 일정 페이지 표시명 — betman 코드는 지면에 그대로 못 쓴다 ('분데스리', '프리그1').
 * 순서 = 지면 섹션 순서: 유럽 대항전 → 5대 리그 → 컵. Map 이라 삽입 순서가 곧 정렬이다.
 */
const LEAGUE_LABELS: ReadonlyMap<string, string> = new Map([
  ["UCL", "챔피언스리그"],
  ["UEL", "유로파리그"],
  ["UECL", "컨퍼런스리그"],
  ["U슈퍼컵", "UEFA 슈퍼컵"],
  ["EPL", "프리미어리그"],
  ["라리가", "라리가"],
  ["세리에A", "세리에 A"],
  ["분데스리", "분데스리가"],
  ["프리그1", "리그 1"],
  ["잉글FA컵", "FA컵"],
  ["잉리그컵", "카라바오컵"],
  ["잉슈퍼컵", "커뮤니티 실드"],
  ["스페FA컵", "코파 델 레이"],
  ["이탈FA컵", "코파 이탈리아"],
  ["독일FA컵", "DFB 포칼"],
  ["프랑FA컵", "쿠프 드 프랑스"],
  ["프슈퍼컵", "트로페 데 샹피옹"],
])

export function leagueLabel(code: string): string {
  return LEAGUE_LABELS.get(code) ?? code
}

/** 지면 섹션 정렬 키 — LEAGUE_LABELS 삽입 순서 기준, 목록 밖은 맨 뒤 */
export function leagueOrder(code: string): number {
  const i = [...LEAGUE_LABELS.keys()].indexOf(code)
  return i === -1 ? 999 : i
}

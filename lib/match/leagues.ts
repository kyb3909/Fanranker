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

/**
 * 밴드 키커용 **라틴** 표기 (2026-08-19 감리 A-1).
 *
 * 매치센터 밴드의 키커 슬롯은 `.gn-num`(Barlow Condensed, 라틴 전용) — 여기에 betman
 * 코드를 그대로 넣었더니 5대 리그 코드가 한글이라("라리가") 폴백 서체에 0.2em 라틴
 * 자간까지 얹혀 깨졌고, 옆의 `leagueLabel()` 과 같은 단어가 두 번 찍혔다
 * ("라리가 라리가"). 키커는 라틴, 본문 라벨은 한글 — 밴드 문법(스몰캡스 키커 + 한글)의
 * 짝을 지키려면 라틴 표기가 따로 있어야 한다. 목록 밖 코드는 null — 키커를 그리지 않는다.
 */
const LEAGUE_KICKERS: ReadonlyMap<string, string> = new Map([
  ["UCL", "CHAMPIONS LEAGUE"],
  ["UEL", "EUROPA LEAGUE"],
  ["UECL", "CONFERENCE LEAGUE"],
  ["U슈퍼컵", "UEFA SUPER CUP"],
  ["EPL", "PREMIER LEAGUE"],
  ["라리가", "LALIGA"],
  ["세리에A", "SERIE A"],
  ["분데스리", "BUNDESLIGA"],
  ["프리그1", "LIGUE 1"],
  ["잉글FA컵", "FA CUP"],
  ["잉리그컵", "CARABAO CUP"],
  ["잉슈퍼컵", "COMMUNITY SHIELD"],
  ["스페FA컵", "COPA DEL REY"],
  ["이탈FA컵", "COPPA ITALIA"],
  ["독일FA컵", "DFB-POKAL"],
  ["프랑FA컵", "COUPE DE FRANCE"],
  ["프슈퍼컵", "TROPHEE DES CHAMPIONS"],
])

export function leagueKicker(code: string): string | null {
  return LEAGUE_KICKERS.get(code) ?? null
}

/**
 * 매치센터 밴드 워터마크 (2026-08-20 P2 — scripts/gen-polish-assets.mjs 산출물).
 *
 * 크림 에칭 라인 일러스트를 밴드 우하단에 8~12% 불투명으로 깐다. 모티프가 리그가
 * 아니라 **나라의 추상**(콜로세움 아치=이탈리아, 이베리아 아치=스페인, 고딕 첨탑=독일,
 * 육각 격자=프랑스, 스타디움 보울=잉글랜드)이라 같은 나라 컵 대회도 리그 마크를
 * 같이 쓴다. 목록 밖(UECL·슈퍼컵 등)은 null — 워터마크 없이도 밴드는 완성이다.
 */
const LEAGUE_MARKS: ReadonlyMap<string, string> = new Map([
  ["EPL", "mark-epl"],
  ["잉글FA컵", "mark-epl"],
  ["잉리그컵", "mark-epl"],
  ["라리가", "mark-laliga"],
  ["스페FA컵", "mark-laliga"],
  ["세리에A", "mark-seriea"],
  ["이탈FA컵", "mark-seriea"],
  ["분데스리", "mark-bundesliga"],
  ["독일FA컵", "mark-bundesliga"],
  ["프리그1", "mark-ligue1"],
  ["프랑FA컵", "mark-ligue1"],
  ["UCL", "mark-ucl"],
  ["UEL", "mark-uel"],
])

export function leagueMarkSrc(code: string): string | null {
  const id = LEAGUE_MARKS.get(code)
  return id ? `/images/league-marks/${id}.webp` : null
}

/** 지면 섹션 정렬 키 — LEAGUE_LABELS 삽입 순서 기준, 목록 밖은 맨 뒤 */
export function leagueOrder(code: string): number {
  const i = [...LEAGUE_LABELS.keys()].indexOf(code)
  return i === -1 ? 999 : i
}

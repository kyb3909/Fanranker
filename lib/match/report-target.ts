/**
 * 리포트·스탯 체인이 쓸 **베트맨 행 id** — 순수 모듈 (2026-09-07).
 *
 * 리포트(`match_reports`)와 실패 원장은 베트맨 행 id 아래 쌓이고, `getMatchExtras` 의 입구도
 * 베트맨 행을 찾는다. LFA 전용 경기(`source: "lfa"`, gameId = lfa_fixtures uuid)는 그래서
 * 원래 리포트 대상이 아니다(LFA_ONLY_FIXTURES.md). 다만 등록 뒤 베트맨이 **연결된** 경기는
 * 베트맨이 파는 경기이므로 그 id 로 리포트를 만들고 보여준다 — 유벤투스–AC밀란(9/7)이
 * 이중 등록 뒤 리포트 크론에서 탈락하고 매치 페이지가 리포트 탭을 숨긴 사고의 수리다.
 *
 * 한 곳에서 정한다: 리포트 크론·매치 페이지가 같은 답을 내야 "크론은 만들었는데 화면엔 없다"가
 * 생기지 않는다.
 */
export function reportGameIdOf(f: {
  gameId: string | null
  source?: "lfa"
  betmanGameId?: string | null
}): string | null {
  if (!f.gameId) return null
  if (f.source === "lfa") return f.betmanGameId ?? null
  return f.gameId
}

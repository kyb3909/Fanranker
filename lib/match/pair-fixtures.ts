/**
 * betman ↔ LFA 경기 짝짓기 — **순수 모듈** (2026-08-30 분리).
 *
 * ## 왜 따로 나왔나
 * 이 로직이 실패하면 그 경기는 betman `gameId` 를 잃는다. gameId 가 없으면 일정 페이지에
 * 매치 링크가 안 걸리고, 불판도 안 깔리고, lfa-warm 예열 대상에서도 빠진다 — 라인업·
 * 스탯·타임라인·MOM·리포트가 **통째로** 끊긴다.
 *
 * 2026-08-30 실사고: 일요일 EPL 3경기(22:00)와 세리에A 2경기(03:45)가 그렇게 끊겼다.
 * 첼시가 2-0 으로 뛰는 동안 사용자가 그 매치 페이지에 들어갈 방법이 없었다.
 * 판별자는 **같은 (리그, 킥오프) 슬롯에 경기가 2개 이상이면 전멸, 1개면 전부 성공**.
 *
 * 그런데 원인을 좁히려 해도 시험을 붙일 수 없었다 — 이 로직이 `get-fixtures.ts` 안에
 * 있었고 그 파일이 `lib/supabase/server` → `lib/env` 를 최상위에서 끌어와, 단위 시험이
 * 뜨자마자 환경변수 부재로 죽었다. 이 저장소가 이미 아는 함정이다
 * ("순수 모듈에 lib/env·supabase/server 최상위 import 금지").
 * 그래서 판정만 여기로 뗀다 — I/O 는 호출부가 하고, 여기는 문자열만 본다.
 */

/** 팀명 대조용 정규화 (한글은 그대로, 영문은 소문자·기호 제거) */
export function normTeam(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, "")
}

export function tokens(s: string): string[] {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      // 3글자 미만은 버린다 — "fc"·"sc" 같은 접미가 서로 다른 팀을 이어붙인다
      .filter((t) => t.length >= 3 && !["afc", "the"].includes(t))
  )
}

/** LFA 축약명과 우리 영문명이 같은 팀인가 — **느슨한 양방향 접두 겹침** */
export function teamMatches(lfaName: string, ourEn: string): boolean {
  const a = tokens(lfaName)
  const b = tokens(ourEn)
  if (a.length === 0 || b.length === 0) return false
  return a.some((t) => b.some((u) => u.startsWith(t) || t.startsWith(u)))
}

export interface TeamSided {
  homeTeam: string
  awayTeam: string
}

/**
 * betman 행이 어느 LFA 경기인가 — 같은 슬롯 후보 중에서 고른다.
 * 후보가 하나면 그대로, 여럿이면 팀명 대조로 좁힌다. 못 고르면 null.
 *
 * ⚠️ `teamEn` (한글 팀명 → 영문) 이 비면 **여럿인 슬롯은 전부 실패한다.** 영문 후보명과
 *    한글 betman 명은 접두가 겹칠 수 없기 때문이다. 그 경우 증상이 "동시 킥오프가 있는
 *    리그만 통째로 링크가 사라짐" 으로 나타난다 — 사전을 의심할 것.
 */
export function pickLfaCounterpart<T extends TeamSided>(
  betman: TeamSided,
  candidates: T[],
  teamEn: Map<string, string>
): T | null {
  if (candidates.length === 1) return candidates[0]
  const bh = normTeam(betman.homeTeam)
  const ba = normTeam(betman.awayTeam)
  const bhEn = teamEn.get(betman.homeTeam.trim())
  const baEn = teamEn.get(betman.awayTeam.trim())
  const overlaps = (x: string, y: string) =>
    x.length >= 2 && y.length >= 2 && (x.startsWith(y) || y.startsWith(x))
  const sideMatch = (candName: string, korNorm: string, en: string | undefined) =>
    overlaps(normTeam(candName), korNorm) || (!!en && teamMatches(candName, en))
  const hits = candidates.filter(
    (c) => sideMatch(c.homeTeam, bh, bhEn) && sideMatch(c.awayTeam, ba, baEn)
  )
  return hits.length === 1 ? hits[0] : null
}

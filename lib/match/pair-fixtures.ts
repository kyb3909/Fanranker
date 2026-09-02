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
import { foldLatin } from "@/lib/text/fold-latin"

/**
 * 팀명 대조용 정규화 (한글은 그대로, 영문은 소문자·기호 제거).
 *
 * ⚠️ **NFD 뒤에 NFC 로 반드시 되돌린다** (2026-08-30 실사고의 근본 원인).
 *    NFD 는 한글 음절을 한글 **자모**(U+1100~)로 분해하는데, 아래 화이트리스트는
 *    **완성형**(가-힣, U+AC00~D7A3)만 남긴다 — 그래서 모든 한글 팀명이 **빈 문자열**이
 *    됐다. 빈 문자열은 `overlaps` 의 `length >= 2` 에서 탈락하므로 한글↔한글 대조가
 *    **한 번도 성공한 적이 없었다.**
 *
 *    증상은 "같은 (리그, 킥오프) 슬롯에 경기가 2개 이상이면 전멸": 후보가 하나면
 *    이름 대조 없이 채택하는 분기가 가려주고 있었다. 2026-08-30 일요일 EPL 3경기와
 *    세리에A 2경기가 매치 링크·불판·예열을 통째로 잃었다.
 *
 *    NFD 자체는 라틴 발음부호를 떼려고 있는 것이다(Atlético → atletico). 결합 문자를
 *    지운 뒤 NFC 로 재조합하면 한글은 살고 발음부호만 떨어진다.
 */
export function normTeam(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, "")
}

/**
 * ⚠️ **foldLatin 을 거친다** (2026-09-01). NFD 는 발음 부호만 분해한다 — `Ø`·`Ł`·`Đ` 는
 *    독립 글자라 분해되지 않고 아래 `[^a-z0-9\s]` 가 **통째로 지운다.**
 *      "Ødegaard" → "  degaard" → ["degaard"]   vs  "Odegaard Martin" → ["odegaard","martin"]
 *    토큰이 안 겹쳐 대조가 조용히 실패했다. 이 함수는 `localizeScorer`(lib/lfa/match.ts)가
 *    타임라인 이름을 **저장 시점에** 한글화할 때도 쓰므로, 실패가 저장분에 굳었다 —
 *    끝난 경기 상세는 수명이 Infinity 라 스스로 낫지 않는다. (fold-latin.ts 참조)
 */
/**
 * LFA 가 `lang=en` 인데도 섞어 쓰는 터키식 지명 → 영문 (2026-09-02 실측).
 * "Marsilya"(마르세유)는 사전 "Marseille" 와 토큰이 하나도 안 겹쳐 14일 136경기 중 유일한
 * 헛거절이었다. "Sofya"(소피아)도 같은 계열. 우리 사전의 문제가 아니라 **소스의 표기 버릇**이라
 * 사전이 아닌 여기서 흡수한다 — 관측된 것만 넣는다.
 */
const LFA_EXONYMS: Record<string, string> = {
  marsilya: "marseille",
  sofya: "sofia",
}

export function tokens(s: string): string[] {
  return (
    foldLatin(s)
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      // 3글자 미만은 버린다 — "fc"·"sc" 같은 접미가 서로 다른 팀을 이어붙인다
      .filter((t) => t.length >= 3 && !["afc", "the"].includes(t))
      .map((t) => LFA_EXONYMS[t] ?? t)
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
  const bh = normTeam(betman.homeTeam)
  const ba = normTeam(betman.awayTeam)
  const bhEn = teamEn.get(betman.homeTeam.trim())
  const baEn = teamEn.get(betman.awayTeam.trim())
  const overlaps = (x: string, y: string) =>
    x.length >= 2 && y.length >= 2 && (x.startsWith(y) || y.startsWith(x))
  const sideMatch = (candName: string, korNorm: string, en: string | undefined) =>
    overlaps(normTeam(candName), korNorm) || (!!en && teamMatches(candName, en))
  if (candidates.length === 1) {
    const only = candidates[0]
    // 후보가 하나여도 사전이 양 팀을 알면 이름이 맞아야 한다 (2026-09-02, lib/lfa/match.ts
    // resolveMatch 와 같은 규칙). 사전이 모르면 종전대로 채택 — 한글 후보명은 toKorean 을
    // 거친 것이라 표기가 흔들릴 수 있고, 그때 끊는 건 판정이 아니라 손실이다.
    if (!bhEn || !baEn) return only
    return sideMatch(only.homeTeam, bh, bhEn) && sideMatch(only.awayTeam, ba, baEn) ? only : null
  }
  const hits = candidates.filter(
    (c) => sideMatch(c.homeTeam, bh, bhEn) && sideMatch(c.awayTeam, ba, baEn)
  )
  return hits.length === 1 ? hits[0] : null
}

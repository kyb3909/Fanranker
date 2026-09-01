/**
 * 라틴 글자 접기 — **순수 모듈** (2026-09-01).
 *
 * ## 왜 NFD 만으로는 부족한가
 * `normalize("NFD")` 는 **발음 부호가 붙은 글자**를 분해한다(é → e + ´). 그래서
 * 결합 문자를 지우면 Leão·Muñoz·Šeško 는 깔끔히 leao·munoz·sesko 가 된다.
 *
 * 그런데 `Ø`·`Ł`·`Đ`·`Æ`·`Þ` 는 **발음 부호가 아니라 독립 글자**다. NFD 로 분해되지
 * 않으므로 그대로 남고, 뒤따르는 `[^a-z]` 제거가 **통째로 지워 버린다.**
 *
 *   "M. Ødegaard" → NFD 무변화 → [^a-z] 제거 → "m  degaard" → 토큰 ["degaard"]
 *   스쿼드 "Odegaard Martin"                              → 토큰 ["odegaard","martin"]
 *
 * 토큰이 안 겹치니 한글화가 조용히 실패한다. 실사고(2026-09-01 애스턴 빌라 vs 아스널):
 * - 매치 타임라인 71분 교체가 "M. Ødegaard" 로 남았다 — 같은 선수가 라인업에서는
 *   한글로 멀쩡히 떴다. 두 경로의 정규화가 달랐다.
 * - 경기 리포트 본문에 **"Martin degaard"** 가 나갔다. 지워진 Ø 자리에 아무것도 안
 *   남아 **실재하지 않는 이름**이 만들어진 것이다 — 환각 가드가 막으려는 바로 그 종류인데,
 *   출처는 LLM 이 아니라 우리 정규화였다.
 *
 * ## 이미 아는 문제였다
 * `lib/news/notation/rules.ts` 와 `lib/soccerway/nickname-match.ts` 는 ø·đ·æ·ß 를
 * 따로 치환하고 있었다. 다만 그 목록이 **두 파일에 복사돼 있었고**, 선수 이름을 실제로
 * 한글화하는 경로(`lib/lfa/player-name.ts`·`lib/match/enrich-lineup.ts`)에는 아예 없었다.
 * 규칙이 아니라 **적용 범위**가 문제였다.
 *
 * ⚠️ 뉴스 표기 경로(rules.ts·nickname-match.ts)는 **일부러 그대로 뒀다.** 그쪽 매칭이
 *    느슨해지면 사전 오염으로 직결되고(표기 사고 계보), 여기 목록은 그쪽보다 넓다.
 *    합치려면 고정 시험지를 먼저 세우고 따로 할 일이다.
 *
 * ⚠️ 한글에는 절대 쓰지 말 것 — NFD 는 한글 음절도 자모로 분해한다. 이 함수는 라틴
 *    문자열(로마자 이름) 전용이다. 한글이 섞인 문자열은 호출부가 먼저 갈라야 한다.
 */

/** NFD 로 분해되지 않는 글자들 — 지우지 말고 **바꿔야** 한다 */
const FOLD: [RegExp, string][] = [
  [/ø/g, "o"],
  [/đ|ð/g, "d"],
  [/ł/g, "l"],
  [/æ/g, "ae"],
  [/œ/g, "oe"],
  [/þ/g, "th"],
  [/ß/g, "ss"],
  // 터키어 점 없는 i / 점 있는 I — 소문자화 뒤에도 남는다
  [/ı/g, "i"],
  [/i̇/g, "i"],
]

/**
 * 로마자 문자열 → 발음부호·특수글자를 접은 소문자.
 * 토큰 분할은 호출부의 몫이다 (경로마다 분할 규칙이 다르다).
 */
export function foldLatin(s: string | null | undefined): string {
  let out = (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  for (const [re, to] of FOLD) out = out.replace(re, to)
  return out
}

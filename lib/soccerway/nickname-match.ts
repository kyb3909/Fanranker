/**
 * 애칭 보정 매칭 — "Josh King" ↔ 사전의 "King Joshua" (2026-08-25).
 *
 * ⚠️ Supabase 를 끌어오지 않는 **순수 모듈**이다. match-extras.ts 안에 두면
 *    테스트가 env 없이 못 돈다 (day-freshness·draft-positions 때와 같은 이유).
 *
 * ## 왜 필요한가
 * 영어권 매체는 짧은 형태를 쓰고 사전은 정식명을 담는다:
 *   Josh/Joshua · Ben/Benjamin · Alex/Alexander · Matt/Matthew · Tom/Thomas
 * 토큰 집합 비교(findUniqueRomanizedMatch)로는 영영 안 붙어서 경기 리포트에 영문
 * 이름이 남았다 (운영자 제보 → 8종 중 7종은 사전 폴백으로 해결, 이건 마지막 1종).
 *
 * ## 왜 공용 함수를 안 고치나
 * `findUniqueRomanizedMatch` 는 뉴스 표기 파이프라인이 같이 쓴다. 거기서 매칭이
 * 느슨해지면 **사전 오염**으로 직결된다 (표기 사고 계보: "레앙→레온" 등).
 * 그래서 이 규칙은 리포트 경로에서만 **마지막 수단**으로 부른다.
 */

/** 로마자 → 소문자 토큰 (findUniqueRomanizedMatch 와 같은 정규화 규칙) */
export function romanTokensLoose(s: string | null | undefined): string[] {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ø/g, "o")
    .replace(/đ/g, "d")
    .replace(/æ/g, "ae")
    .replace(/ß/g, "ss")
    .split(/[^a-z]+/)
    .filter((t) => t.length > 1)
}

/**
 * ⚠️ 이건 **퍼지 매칭이 아니다**. 넷이 다 성립할 때만 인정한다:
 *   ① 토큰 수가 같다
 *   ② 최소 하나는 **정확히** 일치한다 (보통 성씨)
 *   ③ 최소 하나는 한쪽이 다른 쪽의 **접두사**다 (josh ⊂ joshua), 양쪽 3글자 이상
 *   ④ 후보가 **정확히 하나** — 둘 이상이면 판단하지 않는다
 * 완전 일치는 상위 티어의 몫이라 여기서는 일부러 거부한다(③ 때문에 자동으로 걸린다).
 */
export function matchByNickname<T extends { romanized: string | null }>(
  dictionary: T[],
  name: string
): T | null {
  const want = romanTokensLoose(name)
  if (want.length < 2) return null
  const wantSorted = [...want].sort()

  const hits = dictionary.filter((d) => {
    const have = romanTokensLoose(d.romanized)
    if (have.length !== want.length) return false
    const haveSorted = [...have].sort()
    let exact = 0
    let prefix = 0
    for (let i = 0; i < wantSorted.length; i++) {
      const w = wantSorted[i]
      const h = haveSorted[i]
      if (w === h) {
        exact++
      } else if (w.length >= 3 && h.length >= 3 && (h.startsWith(w) || w.startsWith(h))) {
        prefix++
      } else {
        return false
      }
    }
    return exact >= 1 && prefix >= 1
  })
  return hits.length === 1 ? hits[0] : null
}

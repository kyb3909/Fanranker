import { describe, expect, it } from "vitest"
import { canAbsorbAlias, jamoSimilarity, toJamo } from "@/lib/news/alias-safety"

/**
 * 표본은 전부 **실제 사전 행과 실제 사고**다 (2026-08-26).
 * 막아야 할 것만큼 **막으면 안 되는 것**이 중요하다 — 정상 음차 변형까지 막으면
 * 사전이 자라지 못하고, 그건 조용한 전멸(팀 매칭 실패)로 돌아온다.
 */

/** 실제로 오염을 일으킨 조합 — 발행된 기사 4건에 엉뚱한 사람 이름이 박혔다 */
const 사고_사례: [string, string | null, string, string][] = [
  // [정본, romanized, 붙었던 별칭, 그 별칭의 실제 인물]
  ["루벤 디아스", "Rúben", "루벤 아모림", "맨유 감독"],
  ["루벤 디아스", "Rúben", "루벤 로프터스-치크", "밀란 MF"],
  ["레온", "D.Leon", "라파엘 레앙", "밀란 FW"],
  ["뤼터", "Georginio Rutter", "조르지뉴", "아스날 MF"],
  ["트로이 디니", "Troy Deeney", "트레이 뇨니", "리버풀 MF"],
  ["산초", "Sancho", "제이든 단스", "맨유 유망주"],
  ["자비", "Gyabi", "Xavi 에르난데스", "바르셀로나 전 감독"],
]

/** 같은 사람의 표기 변형 — 반드시 통과해야 한다 */
const 정상_변형: [string, string | null, string][] = [
  ["조 로든", "Joe Rodon", "조 로던"],
  ["부슈코비치", "Vuskovic", "부스코비치"],
  ["칸셀루", "Cancelo", "캉셀루"],
  ["마르무시", "Marmoush", "마르무쉬"],
  ["서머빌", "Summerville", "섬머빌"],
  ["무드리크", "Mudryk", "무드릭"],
  ["각포", "Gakpo", "가크포"],
  ["에머슨", "Emerson", "에메르손"],
  ["두브라프카", "Dúbravka", "두브라브카"],
  ["케르케즈", "Kerkez", "케르케스"],
]

describe("canAbsorbAlias — 오늘 사고를 낸 조합은 전부 막는다", () => {
  for (const [preferred, romanized, alias, who] of 사고_사례) {
    it(`"${preferred}" ← "${alias}" (실제로는 ${who})`, () => {
      const v = canAbsorbAlias({ preferred_ko: preferred, romanized }, alias)
      expect(v.ok, v.ok ? "막혔어야 한다" : "").toBe(false)
    })
  }
})

describe("canAbsorbAlias — 같은 사람의 표기 변형은 통과시킨다", () => {
  for (const [preferred, romanized, alias] of 정상_변형) {
    it(`"${preferred}" ← "${alias}"`, () => {
      const v = canAbsorbAlias({ preferred_ko: preferred, romanized }, alias)
      expect(v.ok, v.ok ? "" : `막히면 안 된다: ${(v as { reason: string }).reason}`).toBe(true)
    })
  }
})

describe("canAbsorbAlias — 개별 규칙", () => {
  it("2글자 이하 한글은 낱말 속에 박힌다 (건·번·영·힐 실사고)", () => {
    for (const short of ["건", "번", "영", "힐", "토트"]) {
      expect(canAbsorbAlias({ preferred_ko: "제이슨 건", romanized: "Gunn" }, short).ok).toBe(false)
    }
  })

  it("3글자부터는 길이 때문에 막지 않는다", () => {
    const v = canAbsorbAlias({ preferred_ko: "케르케즈", romanized: "Kerkez" }, "케르케스")
    expect(v.ok).toBe(true)
  })

  it("로마자가 잘린 항목에는 아무것도 안 붙인다", () => {
    const v = canAbsorbAlias({ preferred_ko: "루벤 디아스", romanized: "Rúben" }, "루벤 디아즈")
    expect(v.ok).toBe(false)
    expect((v as { reason: string }).reason).toContain("로마자가 잘려")
  })

  it("로마자에 성이 있으면 같은 규칙이 안 걸린다", () => {
    const v = canAbsorbAlias(
      { preferred_ko: "루벤 디아스", romanized: "Rúben Dias" },
      "루벤 디아즈"
    )
    expect(v.ok).toBe(true)
  })

  it("성만 있는 항목에 풀네임을 붙이지 않는다", () => {
    const v = canAbsorbAlias({ preferred_ko: "레온", romanized: "D.Leon" }, "라파엘 레앙")
    expect((v as { reason: string }).reason).toContain("성만 있는 항목")
  })

  it("정본과 같은 문자열은 별칭이 아니다", () => {
    expect(canAbsorbAlias({ preferred_ko: "산초", romanized: "Sancho" }, "산초").ok).toBe(false)
  })
})

describe("자모 닮음 — 이 규칙이 서 있는 근거", () => {
  it("음차 흔들림은 닮는다", () => {
    expect(jamoSimilarity("로던", "로든")).toBeGreaterThan(0.7)
    expect(jamoSimilarity("부스코비치", "부슈코비치")).toBeGreaterThan(0.8)
  })

  it("다른 사람은 안 닮는다 (관문 0.62 아래로 충분히 내려간다)", () => {
    // 자모가 우연히 몇 개 겹쳐 0 은 아니지만, 정상 변형(0.8+)과는 자리가 확연히 다르다
    expect(jamoSimilarity("디아스", "아모림")).toBeLessThan(0.35)
    expect(jamoSimilarity("디니", "뇨니")).toBeLessThan(0.62)
    expect(jamoSimilarity("뤼터", "조르지뉴")).toBeLessThan(0.35)
  })

  it("글자 단위였다면 정상 변형까지 막혔다 — 자모로 내려간 이유", () => {
    // "로던"과 "로든" 은 글자로는 2개 중 1개만 같지만, 자모로는 ㄷ_ㄴ 을 공유한다
    expect(new Set([..."로던"]).size).toBe(2)
    expect(jamoSimilarity("로던", "로든")).toBeGreaterThan(0.62)
  })

  it("순서를 본다 — 뒤섞인 것을 같다고 하지 않는다", () => {
    expect(jamoSimilarity("디아스", "스아디")).toBeLessThan(1)
  })

  it("toJamo 는 음절을 초·중·종성으로 푼다", () => {
    expect(toJamo("던")).toEqual(["ㄷ", "ㅓ", "ㄴ"])
    expect(toJamo("드")).toEqual(["ㄷ", "ㅡ"])
    expect(toJamo("Xavi")).toEqual(["x", "a", "v", "i"])
  })
})

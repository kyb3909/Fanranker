import { describe, it, expect } from "vitest"
import {
  koSimilarity,
  parseUnknownNames,
  suggestExisting,
  UNKNOWN_PLAYER_PREFIX,
  type AliasTarget,
} from "@/lib/news/alias-suggest"

describe("koSimilarity", () => {
  it("같은 표기는 1", () => {
    expect(koSimilarity("손흥민", "손흥민")).toBe(1)
  })

  it("공백 차이는 무시한다", () => {
    expect(koSimilarity("비니시우스 주니오르", "비니시우스주니오르")).toBe(1)
  })

  it("음차 흔들림은 높은 유사도 — 실사고 쌍", () => {
    // 사전 "비니시우스 주니오르" ↔ 기사 "비니시우스 주니어" (운영자 확정: 주니오르가 맞음)
    expect(koSimilarity("비니시우스 주니어", "비니시우스 주니오르")).toBeGreaterThan(0.7)
    expect(koSimilarity("마커스 라쉬포드", "마커스 래시퍼드")).toBeGreaterThan(0.5)
  })

  it("다른 사람은 낮은 유사도", () => {
    expect(koSimilarity("손흥민", "황희찬")).toBeLessThan(0.3)
    expect(koSimilarity("사빈호", "지네딘 지단")).toBeLessThan(0.3)
  })

  it("한 글자 표기도 죽지 않는다", () => {
    expect(koSimilarity("김", "김")).toBe(1)
    expect(koSimilarity("김", "이")).toBe(0)
  })
})

describe("parseUnknownNames", () => {
  const line = (names: string) => `${UNKNOWN_PLAYER_PREFIX}${names}`

  it("사유 문자열에서 이름을 뽑고 빈도를 센다", () => {
    const out = parseUnknownNames([
      { reasons: [line("사빈호, 키란 톰슨")], title: "기사 A" },
      { reasons: [line("사빈호")], title: "기사 B" },
    ])
    expect(out[0]).toMatchObject({ name: "사빈호", hits: 2 })
    expect(out.find((o) => o.name === "키란 톰슨")?.hits).toBe(1)
  })

  it("다른 반려 사유는 무시한다", () => {
    const out = parseUnknownNames([
      { reasons: ["중복 기사 (기발행: ...)", "이미지 부적합: 로고만 있는 카드"], title: "x" },
    ])
    expect(out).toHaveLength(0)
  })

  it("예시 제목은 최대 3개, 중복 없이 모은다", () => {
    const out = parseUnknownNames([
      { reasons: [line("사빈호")], title: "A" },
      { reasons: [line("사빈호")], title: "A" },
      { reasons: [line("사빈호")], title: "B" },
      { reasons: [line("사빈호")], title: "C" },
      { reasons: [line("사빈호")], title: "D" },
    ])
    expect(out[0].samples).toEqual(["A", "B", "C"])
    expect(out[0].hits).toBe(5)
  })

  it("빈도 내림차순으로 정렬한다", () => {
    const out = parseUnknownNames([
      { reasons: [line("가나다")], title: "x" },
      { reasons: [line("라마바")], title: "x" },
      { reasons: [line("라마바")], title: "y" },
    ])
    expect(out.map((o) => o.name)).toEqual(["라마바", "가나다"])
  })
})

describe("suggestExisting", () => {
  const dict: AliasTarget[] = [
    {
      id: "p1",
      preferred_ko: "비니시우스 주니오르",
      romanized: "Vinicius Junior",
      hangul_alts: null,
    },
    { id: "p2", preferred_ko: "손흥민", romanized: "Son Heung-min", hangul_alts: null },
    { id: "p3", preferred_ko: "부카요 사카", romanized: "Bukayo Saka", hangul_alts: ["사카"] },
  ]

  it("음차 흔들림을 기존 항목으로 제안한다", () => {
    const out = suggestExisting("비니시우스 주니어", dict)
    expect(out[0].id).toBe("p1")
  })

  it("hangul_alts 로도 매칭된다", () => {
    const out = suggestExisting("사카", dict)
    expect(out.map((o) => o.id)).toContain("p3")
  })

  it("무관한 이름은 제안하지 않는다", () => {
    expect(suggestExisting("키란 톰슨", dict)).toHaveLength(0)
  })

  it("빈 사전에서도 안전하다", () => {
    expect(suggestExisting("아무개", [])).toEqual([])
  })
})

import { describe, it, expect } from "vitest"
import { foldLatin } from "@/lib/text/fold-latin"
import { localizePlayerName } from "@/lib/lfa/player-name"

describe("foldLatin", () => {
  it("발음 부호는 NFD 로 벗긴다 (종전에도 되던 것)", () => {
    expect(foldLatin("Rafael Leão")).toBe("rafael leao")
    expect(foldLatin("Muñoz")).toBe("munoz")
    expect(foldLatin("Šeško")).toBe("sesko")
    expect(foldLatin("Højlund")).toBe("hojlund")
  })

  it("⚠️ 분해되지 않는 글자는 **지우지 않고 바꾼다** — 이번 사고의 핵심", () => {
    // 종전: "Ødegaard" → NFD 무변화 → [^a-z] 제거 → "degaard" (없는 이름이 만들어졌다)
    expect(foldLatin("Ødegaard")).toBe("odegaard")
    expect(foldLatin("M. Ødegaard")).toBe("m. odegaard")
    expect(foldLatin("Łukasz")).toBe("lukasz")
    expect(foldLatin("Đoković")).toBe("dokovic")
    expect(foldLatin("Æbeltoft")).toBe("aebeltoft")
  })

  it("빈 값·null 을 받아도 터지지 않는다", () => {
    expect(foldLatin(null)).toBe("")
    expect(foldLatin(undefined)).toBe("")
    expect(foldLatin("")).toBe("")
  })
})

describe("localizePlayerName — Ø 가 들어간 이름 (2026-09-01 실사고)", () => {
  const arsenal = [
    { nameEn: "Odegaard Martin", nameKr: "마틴 외데고르" },
    { nameEn: "Saka Bukayo", nameKr: "부카요 사카" },
    { nameEn: "Rice Declan", nameKr: "데클란 라이스" },
  ]

  it("LFA 약어 'M. Ødegaard' 를 한글로 바꾼다 (종전엔 원문 그대로 나갔다)", () => {
    expect(localizePlayerName("M. Ødegaard", arsenal)).toBe("마틴 외데고르")
  })

  it("Ø 없는 표기도 그대로 동작한다", () => {
    expect(localizePlayerName("M. Odegaard", arsenal)).toBe("마틴 외데고르")
    expect(localizePlayerName("Saka B.", arsenal)).toBe("부카요 사카")
  })

  it("모르는 이름은 여전히 안 지어낸다 (fail-closed)", () => {
    expect(localizePlayerName("Ø. Nobody", arsenal)).toBe("Ø. Nobody")
  })
})

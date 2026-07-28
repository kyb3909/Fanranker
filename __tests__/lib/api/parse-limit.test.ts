import { describe, it, expect } from "vitest"
import { parseLimit, parseOffset } from "@/lib/api/parse-limit"

/**
 * 이 헬퍼가 흡수해야 할 입력들.
 * 종전 패턴 `Math.min(parseInt(raw), max)` 는 NaN 을 그대로 통과시켰고,
 * 일부 라우트는 상한 클램프 자체가 없었다.
 */
const q = (v: string | null) => ({ get: () => v })

describe("parseLimit", () => {
  it("정상 값은 그대로", () => {
    expect(parseLimit(q("15"), { def: 20, max: 50 })).toBe(15)
  })

  it("없으면 기본값", () => {
    expect(parseLimit(q(null), { def: 20, max: 50 })).toBe(20)
    expect(parseLimit(q("  "), { def: 20, max: 50 })).toBe(20)
  })

  it("상한을 넘으면 클램프", () => {
    expect(parseLimit(q("9999"), { def: 20, max: 50 })).toBe(50)
  })

  /** ★ 종전 패턴이 NaN 을 그대로 쿼리에 흘리던 지점 */
  it("숫자가 아니면 기본값 (NaN 유출 금지)", () => {
    for (const bad of ["abc", "1e999999", "", "NaN", "null"]) {
      const v = parseLimit(q(bad), { def: 20, max: 50 })
      expect(Number.isFinite(v)).toBe(true)
      expect(v).toBeGreaterThan(0)
    }
  })

  it("0 과 음수는 기본값", () => {
    expect(parseLimit(q("0"), { def: 20, max: 50 })).toBe(20)
    expect(parseLimit(q("-5"), { def: 20, max: 50 })).toBe(20)
  })

  it("소수점은 정수부만 (parseInt 동작 유지)", () => {
    expect(parseLimit(q("12.9"), { def: 20, max: 50 })).toBe(12)
  })
})

describe("parseOffset", () => {
  it("정상/기본/음수/NaN", () => {
    expect(parseOffset(q("40"))).toBe(40)
    expect(parseOffset(q(null))).toBe(0)
    expect(parseOffset(q("-1"))).toBe(0)
    expect(parseOffset(q("abc"))).toBe(0)
  })
})

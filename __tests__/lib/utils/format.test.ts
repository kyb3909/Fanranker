import { describe, it, expect } from "vitest"
import { formatCount, formatMemberCount } from "@/lib/utils/format"

describe("formatCount", () => {
  it("returns plain number for < 1000", () => {
    expect(formatCount(0)).toBe("0")
    expect(formatCount(999)).toBe("999")
    expect(formatCount(42)).toBe("42")
  })

  it("formats with k suffix for >= 1000", () => {
    expect(formatCount(1000)).toBe("1.0k")
    expect(formatCount(1200)).toBe("1.2k")
    expect(formatCount(15000)).toBe("15.0k")
    expect(formatCount(999999)).toBe("1000.0k")
  })
})

describe("formatMemberCount", () => {
  it("returns count with 명 for < 10000", () => {
    expect(formatMemberCount(500)).toBe("500명")
    expect(formatMemberCount(9999)).toBe("9,999명")
  })

  it("formats with 만명 for >= 10000", () => {
    expect(formatMemberCount(10000)).toBe("1만명")
    expect(formatMemberCount(15000)).toBe("1.5만명")
    expect(formatMemberCount(1245000)).toBe("124.5만명")
  })

  it("removes .0 for exact multiples of 10000", () => {
    expect(formatMemberCount(50000)).toBe("5만명")
    expect(formatMemberCount(100000)).toBe("10만명")
  })
})

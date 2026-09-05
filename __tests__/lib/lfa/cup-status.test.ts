import { describe, expect, it } from "vitest"
import { isLfaFinishedStatus } from "@/lib/lfa/status"

describe("컵대회 종료 판정", () => {
  it.each(["FT", "AET", "PEN"])("%s 종료를 인정한다", (display) => {
    expect(isLfaFinishedStatus({ display, is_live: false })).toBe(true)
  })
  it.each(["AET", "PEN"])("%s 표시여도 진행 중이면 투표를 열지 않는다", (display) => {
    expect(isLfaFinishedStatus({ display, is_live: true })).toBe(false)
  })
  it.each(["POSTP", "CANC", "ABAN", "HT", "120"])("%s는 종료 증거가 아니다", (display) => {
    expect(isLfaFinishedStatus({ display, is_live: false })).toBe(false)
  })
})

import { describe, expect, it } from "vitest"
import { reportGameIdOf } from "@/lib/match/report-target"

describe("reportGameIdOf — 리포트 체인이 쓸 베트맨 행 id", () => {
  it("베트맨 경기는 자기 id", () => {
    expect(reportGameIdOf({ gameId: "b1" })).toBe("b1")
  })
  it("LFA 전용 경기는 베트맨이 연결됐을 때만 그 id", () => {
    expect(reportGameIdOf({ gameId: "u", source: "lfa", betmanGameId: "b1" })).toBe("b1")
    expect(reportGameIdOf({ gameId: "u", source: "lfa", betmanGameId: null })).toBeNull()
    expect(reportGameIdOf({ gameId: "u", source: "lfa" })).toBeNull()
  })
  it("id 가 없으면 대상이 아니다", () => {
    expect(reportGameIdOf({ gameId: null })).toBeNull()
  })
})

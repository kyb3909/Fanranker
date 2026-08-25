import { describe, it, expect } from "vitest"
import { isReportClub, isReportWorthyMatch } from "@/lib/soccerway/report-clubs"

/**
 * 2026-08-25 운영자 확정 — 경기 리포트는 지정 구단이 뛴 경기만.
 * 계기: 오사수나 0-0 레반테에 "3-0 승리…멀티골" 리포트가 저장됐다(전부 지어낸 것).
 */
describe("isReportClub", () => {
  it("표기가 흔들려도 잡는다", () => {
    for (const n of ["맨체스터 시티", "맨시티", "맨체스터시티"]) expect(isReportClub(n)).toBe(true)
    for (const n of ["파리 생제르맹", "PSG", "파리생제르맹"]) expect(isReportClub(n)).toBe(true)
  })

  it("⚠️'레알'이 다른 레알을 물어오면 안 된다 — 포함 관계를 안 쓰는 이유", () => {
    expect(isReportClub("레알 마드리드")).toBe(true)
    expect(isReportClub("레알 소시에다드")).toBe(false)
    expect(isReportClub("레알 베티스")).toBe(false)
    expect(isReportClub("레알 오비에도")).toBe(false)
  })

  it("대상 밖 구단", () => {
    for (const n of ["오사수나", "레반테", "말라가", "풀럼", "에버턴"]) {
      expect(isReportClub(n)).toBe(false)
    }
  })
})

describe("isReportWorthyMatch — 한쪽만 걸려도 쓴다", () => {
  it("대상 구단이 원정이어도 쓴다", () => {
    expect(isReportWorthyMatch("풀럼", "첼시")).toBe(true)
    expect(isReportWorthyMatch("토리노", "AC밀란")).toBe(true)
  })

  it("⭐둘 다 대상 밖이면 안 쓴다 — 실사고 경기", () => {
    expect(isReportWorthyMatch("오사수나", "레반테")).toBe(false)
    expect(isReportWorthyMatch("말라가", "데포르티보 아코루냐")).toBe(false)
  })
})

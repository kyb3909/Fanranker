import { describe, it, expect } from "vitest"
import { lfaDetailRow, pickFtScore, type LfaDetailRow } from "@/lib/motm/ft-evidence"

/** 2026-09-01 애스턴 빌라 0-1 아스널 실측 — LFA 는 06:03 확정, betman 은 06:30 까지 null */
const ARSENAL_LFA: LfaDetailRow = { finished: true, homeScore: 0, awayScore: 1 }

describe("pickFtScore", () => {
  it("betman 스코어가 있으면 그것을 쓴다 (종전 동작 유지)", () => {
    expect(pickFtScore({ homeScore: 4, awayScore: 3 }, [])).toEqual({
      home: 4,
      away: 3,
      source: "betman",
    })
  })

  it("betman 이 비었고 LFA 가 종료면 LFA 로 연다 — 이게 이번에 푼 병목이다", () => {
    expect(pickFtScore({ homeScore: null, awayScore: null }, [ARSENAL_LFA])).toEqual({
      home: 0,
      away: 1,
      source: "lfa",
    })
  })

  it("이미 떠 있는 숫자와 갈리지 않게 — 둘 다 있으면 betman 이 이긴다", () => {
    expect(pickFtScore({ homeScore: 2, awayScore: 2 }, [ARSENAL_LFA])?.source).toBe("betman")
  })

  it("⚠️ 경기 중 LFA 스코어로는 열지 않는다 — 후반 44분이 박제된다", () => {
    expect(
      pickFtScore({ homeScore: null, awayScore: null }, [
        { finished: false, homeScore: 0, awayScore: 1 },
      ])
    ).toBeNull()
  })

  it("연기·취소 가드는 그대로 — 어느 쪽도 증거가 없으면 null", () => {
    expect(pickFtScore({ homeScore: null, awayScore: null }, [])).toBeNull()
    expect(
      pickFtScore({ homeScore: null, awayScore: null }, [
        { finished: true, homeScore: null, awayScore: null },
      ])
    ).toBeNull()
  })

  it("0-0 은 스코어가 없는 것이 아니다", () => {
    expect(pickFtScore({ homeScore: 0, awayScore: 0 }, [])).toEqual({
      home: 0,
      away: 0,
      source: "betman",
    })
    expect(
      pickFtScore({ homeScore: null, awayScore: null }, [
        { finished: true, homeScore: 0, awayScore: 0 },
      ])
    ).toEqual({ home: 0, away: 0, source: "lfa" })
  })

  it("한쪽만 있는 betman 스코어는 증거로 안 친다 — LFA 로 넘어간다", () => {
    expect(pickFtScore({ homeScore: 1, awayScore: null }, [ARSENAL_LFA])?.source).toBe("lfa")
  })

  it("형제 행 중 종료된 행을 찾아 쓴다 (마켓별 다중 행)", () => {
    const rows: LfaDetailRow[] = [
      { finished: false, homeScore: null, awayScore: null },
      { finished: false, homeScore: 0, awayScore: 1 },
      ARSENAL_LFA,
    ]
    expect(pickFtScore({ homeScore: null, awayScore: null }, rows)?.source).toBe("lfa")
  })
})

describe("lfaDetailRow", () => {
  it("payload 모양을 믿지 않는다 — 숫자가 아니면 없는 것", () => {
    expect(lfaDetailRow({ finished: true, payload: { homeScore: 0, awayScore: 1 } })).toEqual({
      finished: true,
      homeScore: 0,
      awayScore: 1,
    })
    // 문자열 스코어(외부 응답이 흔들리는 경우)는 안 받는다
    expect(lfaDetailRow({ finished: true, payload: { homeScore: "0", awayScore: "1" } })).toEqual({
      finished: true,
      homeScore: null,
      awayScore: null,
    })
    expect(lfaDetailRow({ finished: undefined, payload: null })).toEqual({
      finished: false,
      homeScore: null,
      awayScore: null,
    })
  })
})

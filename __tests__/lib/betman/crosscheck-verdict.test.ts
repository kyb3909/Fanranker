import { describe, it, expect } from "vitest"
import { decideVerdict, checkResultConsistency, WAIVE_HOURS } from "@/lib/betman/crosscheck-verdict"
import { deriveResultFromScore } from "@/lib/betman/result-mapper"

const FT = (h: number | null, a: number | null) => ({ finished: true, homeScore: h, awayScore: a })

describe("decideVerdict", () => {
  it("두 출처 일치 → match (정산 허용)", () => {
    const r = decideVerdict({ lfa: FT(1, 3), betman: { home: 1, away: 3 }, hoursSinceKickoff: 6 })
    expect(r.verdict).toBe("match")
    expect(r.betmanScore).toBe("1-3")
    expect(r.lfaScore).toBe("1-3")
  })

  it("두 출처 불일치 → mismatch (정산 보류 + 알림 대상)", () => {
    const r = decideVerdict({ lfa: FT(2, 1), betman: { home: 1, away: 1 }, hoursSinceKickoff: 6 })
    expect(r.verdict).toBe("mismatch")
  })

  it("뒤집힌 스코어도 불일치다 — 홈·원정 순서는 봐주지 않는다 (confirmScore 와 같은 규율)", () => {
    const r = decideVerdict({ lfa: FT(3, 1), betman: { home: 1, away: 3 }, hoursSinceKickoff: 6 })
    expect(r.verdict).toBe("mismatch")
  })

  it("LFA 색인에 없음 + 유예 전 → pending (재시도)", () => {
    const r = decideVerdict({ lfa: null, betman: { home: 1, away: 0 }, hoursSinceKickoff: 5 })
    expect(r.verdict).toBe("pending")
  })

  it("LFA 색인에 없음 + 유예 초과 → waived (커버리지 밖 — 와이즈토토 단독 정산)", () => {
    const r = decideVerdict({
      lfa: null,
      betman: { home: 1, away: 0 },
      hoursSinceKickoff: WAIVE_HOURS + 1,
    })
    expect(r.verdict).toBe("waived")
  })

  it("LFA 가 아직 종료 전(진행 중 점수) → 확정으로 치지 않는다", () => {
    const r = decideVerdict({
      lfa: { finished: false, homeScore: 1, awayScore: 0 },
      betman: { home: 1, away: 0 },
      hoursSinceKickoff: 3,
    })
    expect(r.verdict).toBe("pending")
  })

  it("와이즈토토 스코어가 아직 비었으면 비교 불가 → pending", () => {
    const r = decideVerdict({
      lfa: FT(2, 2),
      betman: { home: null, away: null },
      hoursSinceKickoff: 3,
    })
    expect(r.verdict).toBe("pending")
    expect(r.lfaScore).toBe("2-2")
  })

  it("waived 경계 — 정확히 WAIVE_HOURS 에서 유예 발동", () => {
    const r = decideVerdict({
      lfa: null,
      betman: { home: 0, away: 0 },
      hoursSinceKickoff: WAIVE_HOURS,
    })
    expect(r.verdict).toBe("waived")
  })
})

describe("checkResultConsistency — result 필드 ↔ 검증 스코어 (2026-08-30 운영자 지적)", () => {
  const derive = (
    h: number,
    a: number,
    type: string,
    handicap: number | null = null,
    line: number | null = null
  ) =>
    deriveResultFromScore(h, a, type as Parameters<typeof deriveResultFromScore>[2], handicap, line)

  it("승무패 — 스코어 1-3 인데 result 가 home 이면 불일치 (지급 사고 직전)", () => {
    const r = checkResultConsistency({
      homeScore: 1,
      awayScore: 3,
      storedResult: "home",
      expectedResult: derive(1, 3, "일반"),
    })
    expect(r.ok).toBe(false)
    expect(r.note).toContain("home")
    expect(r.note).toContain("away")
  })

  it("승무패 — 스코어와 result 가 맞으면 통과", () => {
    const r = checkResultConsistency({
      homeScore: 2,
      awayScore: 0,
      storedResult: "home",
      expectedResult: derive(2, 0, "일반"),
    })
    expect(r.ok).toBe(true)
  })

  it("핸디캡 — 원점수는 홈 승이어도 핸디 적용 후 away 가 정답이다", () => {
    // 2-1 에 핸디캡 -1.5 → 조정 0.5 vs 1 → away
    const expected = derive(2, 1, "핸디캡", -1.5)
    expect(expected).toBe("away")
    const r = checkResultConsistency({
      homeScore: 2,
      awayScore: 1,
      storedResult: "away",
      expectedResult: expected,
    })
    expect(r.ok).toBe(true)
  })

  it("언더오버 line 0 → 재계산 불가('') — 판단하지 않고 통과", () => {
    const r = checkResultConsistency({
      homeScore: 1,
      awayScore: 1,
      storedResult: "over",
      expectedResult: derive(1, 1, "언더오버", null, 0),
    })
    expect(r.ok).toBe(true)
  })

  it("저장 result 가 비어 있으면 통과 — 정산 가드가 어차피 그 행을 안 정산한다", () => {
    const r = checkResultConsistency({
      homeScore: 1,
      awayScore: 0,
      storedResult: "",
      expectedResult: derive(1, 0, "일반"),
    })
    expect(r.ok).toBe(true)
  })
})

describe("3자 다수결 — 베트맨 ↔ 와이즈토토 ↔ LFA (2026-08-30 운영자 확정)", () => {
  it("베트맨 == 와이즈토토 → match (핵심 검증 — LFA 없어도 통과)", () => {
    const r = decideVerdict({
      betman: { home: 2, away: 1 },
      wisetoto: { home: 2, away: 1 },
      lfa: null,
      hoursSinceKickoff: 4,
    })
    expect(r.verdict).toBe("match")
    expect(r.wisetotoScore).toBe("2-1")
  })

  it("베트맨 != 와이즈토토, LFA 부재 → mismatch (심판 없이 못 보낸다)", () => {
    const r = decideVerdict({
      betman: { home: 2, away: 1 },
      wisetoto: { home: 1, away: 1 },
      lfa: null,
      hoursSinceKickoff: 4,
    })
    expect(r.verdict).toBe("mismatch")
    expect(r.note).toContain("심판")
  })

  it("베트맨 != 와이즈토토, LFA 가 베트맨 지지 → match (와이즈토토가 소수)", () => {
    const r = decideVerdict({
      betman: { home: 2, away: 1 },
      wisetoto: { home: 1, away: 1 },
      lfa: FT(2, 1),
      hoursSinceKickoff: 4,
    })
    expect(r.verdict).toBe("match")
    expect(r.note).toContain("와이즈토토 소수")
  })

  it("베트맨이 소수 (와이즈토토·LFA 일치) → mismatch — 지급 기준이 틀린 최악 신호", () => {
    const r = decideVerdict({
      betman: { home: 2, away: 1 },
      wisetoto: { home: 1, away: 1 },
      lfa: FT(1, 1),
      hoursSinceKickoff: 4,
    })
    expect(r.verdict).toBe("mismatch")
    expect(r.note).toContain("베트맨(2-1)이 소수")
  })

  it("셋 다 일치 → match, 참고 메모 없음", () => {
    const r = decideVerdict({
      betman: { home: 0, away: 0 },
      wisetoto: { home: 0, away: 0 },
      lfa: FT(0, 0),
      hoursSinceKickoff: 4,
    })
    expect(r.verdict).toBe("match")
    expect(r.note).toBeNull()
  })

  it("베트맨 == 와이즈토토인데 LFA 만 다름 → match + 참고 메모 (매핑 오류 의심 기록)", () => {
    const r = decideVerdict({
      betman: { home: 2, away: 0 },
      wisetoto: { home: 2, away: 0 },
      lfa: FT(1, 0),
      hoursSinceKickoff: 4,
    })
    expect(r.verdict).toBe("match")
    expect(r.note).toContain("LFA 상이")
  })
})

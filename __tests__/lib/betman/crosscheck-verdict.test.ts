import { describe, it, expect } from "vitest"
import { decideVerdict, checkResultConsistency } from "@/lib/betman/crosscheck-verdict"
import { deriveResultFromScore } from "@/lib/betman/result-mapper"

/**
 * 결과 교차검증 판정 — 2026-09-02 부터 **표시·알림 전용**. 정산은 이 판정을 보지 않는다.
 * 그래서 이 시험은 "어떤 상황을 어떻게 이름 붙이나"만 잠근다. waived·시한은 폐지됐다.
 */

const FT = (h: number | null, a: number | null) => ({ finished: true, homeScore: h, awayScore: a })

describe("decideVerdict — 베트맨 ↔ LFA 2자", () => {
  it("두 출처 일치 → match", () => {
    const r = decideVerdict({ lfa: FT(1, 3), betman: { home: 1, away: 3 } })
    expect(r.verdict).toBe("match")
    expect(r.betmanScore).toBe("1-3")
    expect(r.lfaScore).toBe("1-3")
  })

  it("두 출처 불일치 → mismatch (어드민 빨간불 + 알림 대상 — 정산은 그대로 나간다)", () => {
    const r = decideVerdict({ lfa: FT(2, 1), betman: { home: 1, away: 1 } })
    expect(r.verdict).toBe("mismatch")
    expect(r.note).toContain("스코어 불일치")
  })

  it("뒤집힌 스코어도 불일치다 — 홈·원정 순서는 봐주지 않는다", () => {
    const r = decideVerdict({ lfa: FT(3, 1), betman: { home: 1, away: 3 } })
    expect(r.verdict).toBe("mismatch")
  })

  it("LFA 증거 없음 → pending. 시한이 지나도 pending 이다 — waived 는 없다", () => {
    const r = decideVerdict({ lfa: null, betman: { home: 1, away: 0 } })
    expect(r.verdict).toBe("pending")
    expect(r.note).toBeNull()
  })

  it("LFA 가 아직 종료 전(진행 중 점수) → 확정으로 치지 않는다 → pending", () => {
    const r = decideVerdict({
      lfa: { finished: false, homeScore: 1, awayScore: 0 },
      betman: { home: 1, away: 0 },
    })
    expect(r.verdict).toBe("pending")
  })

  it("베트맨 스코어가 아직 비었으면 비교 불가 → pending", () => {
    const r = decideVerdict({ lfa: FT(2, 2), betman: { home: null, away: null } })
    expect(r.verdict).toBe("pending")
    expect(r.lfaScore).toBe("2-2")
  })

  it("⚠️ 2026-09-02 실사고 재현 — 다른 경기 점수를 받으면 mismatch 가 난다. 그래서 색인은 동시 슬롯을 버려야 한다", () => {
    // 첼시 4-3 브라이턴이 (리그, 22:00) 키 충돌로 선덜랜드 1-0 풀럼을 받았던 상황
    const r = decideVerdict({ lfa: FT(1, 0), betman: { home: 4, away: 3 } })
    expect(r.verdict).toBe("mismatch")
    // 색인이 충돌 키를 버리면 여기로 온다 — 틀린 값보다 모르는 게 낫다
    expect(decideVerdict({ lfa: null, betman: { home: 4, away: 3 } }).verdict).toBe("pending")
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

  it("승무패 — 스코어 1-3 인데 result 가 home 이면 불일치", () => {
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

  it("⚠️ 소수핸디캡 — 2026-09-02 실사고: 바르사 5-2 핸디 −3.5 는 away 가 맞다. 분기가 없으면 가짜 불일치", () => {
    const expected = derive(5, 2, "소수핸디캡", -3.5)
    expect(expected).toBe("away")
    const r = checkResultConsistency({
      homeScore: 5,
      awayScore: 2,
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

  it("저장 result 가 비어 있으면 통과", () => {
    const r = checkResultConsistency({
      homeScore: 1,
      awayScore: 0,
      storedResult: "",
      expectedResult: derive(1, 0, "일반"),
    })
    expect(r.ok).toBe(true)
  })
})

describe("3자 다수결 — 베트맨 ↔ 와이즈토토 ↔ LFA (와이즈토토가 있을 때만)", () => {
  it("베트맨 == 와이즈토토 → match (LFA 없어도)", () => {
    const r = decideVerdict({
      betman: { home: 2, away: 1 },
      wisetoto: { home: 2, away: 1 },
      lfa: null,
    })
    expect(r.verdict).toBe("match")
    expect(r.wisetotoScore).toBe("2-1")
  })

  it("베트맨 != 와이즈토토, LFA 부재 → mismatch (심판 없음)", () => {
    const r = decideVerdict({
      betman: { home: 2, away: 1 },
      wisetoto: { home: 1, away: 1 },
      lfa: null,
    })
    expect(r.verdict).toBe("mismatch")
    expect(r.note).toContain("심판")
  })

  it("베트맨 != 와이즈토토, LFA 가 베트맨 지지 → match (와이즈토토가 소수)", () => {
    const r = decideVerdict({
      betman: { home: 2, away: 1 },
      wisetoto: { home: 1, away: 1 },
      lfa: FT(2, 1),
    })
    expect(r.verdict).toBe("match")
    expect(r.note).toContain("와이즈토토 소수")
  })

  it("베트맨이 소수 (와이즈토토·LFA 일치) → mismatch — 지급 기준이 틀린 최악 신호", () => {
    const r = decideVerdict({
      betman: { home: 2, away: 1 },
      wisetoto: { home: 1, away: 1 },
      lfa: FT(1, 1),
    })
    expect(r.verdict).toBe("mismatch")
    expect(r.note).toContain("베트맨(2-1)이 소수")
  })

  it("셋 다 일치 → match, 참고 메모 없음", () => {
    const r = decideVerdict({
      betman: { home: 0, away: 0 },
      wisetoto: { home: 0, away: 0 },
      lfa: FT(0, 0),
    })
    expect(r.verdict).toBe("match")
    expect(r.note).toBeNull()
  })

  it("베트맨 == 와이즈토토인데 LFA 만 다름 → match + 참고 메모", () => {
    const r = decideVerdict({
      betman: { home: 2, away: 0 },
      wisetoto: { home: 2, away: 0 },
      lfa: FT(1, 0),
    })
    expect(r.verdict).toBe("match")
    expect(r.note).toContain("LFA 상이")
  })
})

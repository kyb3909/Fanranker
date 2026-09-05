import { describe, it, expect } from "vitest"
import { lineupConfidence, lineupConfidenceLabel } from "@/lib/match/lineup-confidence"

/**
 * 라인업 예상/확정 판정 (2026-08-25 외부 감사).
 *
 * 실사고: 발렌시아 vs 레알 베티스 라인업이 킥오프 **21.99시간 전**에 수집됐는데
 * 화면엔 아무 단서 없이 선발 11명만 떴다. 공식 발표는 킥오프 ~1시간 전이므로 그건
 * 확정일 수 없다. 이 테스트가 그 경계를 지킨다.
 */

const KO = "2026-08-25T19:00:00.000Z"
const at = (h: number) => new Date(Date.parse(KO) - h * 3600_000).toISOString()

describe("lineupConfidence", () => {
  it("피드의 예상 여부가 수집 시각 추정보다 우선한다", () => {
    expect(lineupConfidence({ kickoff: KO, fetchedAt: at(0), projected: true })).toBe("predicted")
    expect(lineupConfidence({ kickoff: KO, fetchedAt: at(2), projected: false })).toBe("confirmed")
  })
  it("⭐실사고 재현: 킥오프 22시간 전 수집 → 예상", () => {
    expect(lineupConfidence({ kickoff: KO, fetchedAt: at(21.99) })).toBe("predicted")
  })

  it("킥오프 1시간 전 이후 수집 → 확정", () => {
    expect(lineupConfidence({ kickoff: KO, fetchedAt: at(0.5) })).toBe("confirmed")
  })

  it("정확히 1시간 전은 확정 (공식 발표 시점)", () => {
    expect(lineupConfidence({ kickoff: KO, fetchedAt: at(1) })).toBe("confirmed")
  })

  it("1시간 1분 전은 아직 예상", () => {
    expect(lineupConfidence({ kickoff: KO, fetchedAt: at(1 + 1 / 60) })).toBe("predicted")
  })

  it("킥오프 후 수집도 확정 (경기 중 조회)", () => {
    expect(lineupConfidence({ kickoff: KO, fetchedAt: at(-2) })).toBe("confirmed")
  })

  it("🚫 판단 근거가 없으면 **예상으로 낮춰 잡는다**", () => {
    // 확정이라고 잘못 말하는 쪽이 훨씬 나쁘다 — 모르면 낮은 쪽
    expect(lineupConfidence({ kickoff: null, fetchedAt: at(0.1) })).toBe("predicted")
    expect(lineupConfidence({ kickoff: KO, fetchedAt: null })).toBe("predicted")
    expect(lineupConfidence({ kickoff: "깨진값", fetchedAt: "깨진값" })).toBe("predicted")
  })

  it("⚠️ 판정은 **받아온 시각** 기준 — 현재 시각이 아니다", () => {
    // 22시간 전에 받아 캐시한 예상 명단은, 킥오프 10분 전에 열어도 여전히 예상이다.
    // 현재 시각으로 판정하면 내용은 그대로인데 배지만 확정으로 바뀌는 거짓말이 된다.
    expect(lineupConfidence({ kickoff: KO, fetchedAt: at(22) })).toBe("predicted")
  })

  it("라벨", () => {
    expect(lineupConfidenceLabel("predicted")).toBe("예상 라인업")
    expect(lineupConfidenceLabel("confirmed")).toBe("확정 라인업")
  })
})

import { describe, it, expect } from "vitest"
import { shouldBlockResultChange, describeBlockReason } from "@/lib/betman/result-guard"

/**
 * 정산 후 결과 덮어쓰기 가드 (R1 / 단계 0-1, 2026-08-06)
 *
 * 실사고 근거: admin/matches/result 와 betman/results 가 status 무관하게 result 를
 * 덮어쓸 수 있었고, 정산은 재실행되지 않아 "지급 기록 ↔ 경기 결과" 영구 불일치 가능.
 */
describe("shouldBlockResultChange", () => {
  const base = {
    hasSettledPicks: true,
    currentResult: "home",
    currentStatus: "completed",
    incomingResult: "home",
    incomingStatus: "completed",
  }

  describe("정산 픽이 없으면 전부 허용", () => {
    it("결과 변경도 허용 (아직 돈이 안 움직임)", () => {
      const v = shouldBlockResultChange({
        ...base,
        hasSettledPicks: false,
        incomingResult: "away",
      })
      expect(v.blocked).toBe(false)
    })

    it("취소 전환도 허용", () => {
      const v = shouldBlockResultChange({
        ...base,
        hasSettledPicks: false,
        incomingResult: null,
        incomingStatus: "cancelled",
      })
      expect(v.blocked).toBe(false)
    })
  })

  describe("정산 픽이 있을 때", () => {
    it("result 값 변경 → 차단 (result_change)", () => {
      const v = shouldBlockResultChange({ ...base, incomingResult: "away" })
      expect(v).toEqual({ blocked: true, reason: "result_change" })
    })

    it("동일 result 재기록(멱등 re-post) → 허용", () => {
      const v = shouldBlockResultChange(base)
      expect(v.blocked).toBe(false)
    })

    it("result 미제공(스코어만 수정) → 허용", () => {
      const v = shouldBlockResultChange({ ...base, incomingResult: null })
      expect(v.blocked).toBe(false)
    })

    it("completed → cancelled 전환 → 차단 (cancel_transition)", () => {
      const v = shouldBlockResultChange({
        ...base,
        incomingResult: null,
        incomingStatus: "cancelled",
      })
      expect(v).toEqual({ blocked: true, reason: "cancel_transition" })
    })

    it("cancelled → completed 부활 → 차단 (cancel_transition)", () => {
      const v = shouldBlockResultChange({
        ...base,
        currentResult: null,
        currentStatus: "cancelled",
        incomingResult: null,
        incomingStatus: "completed",
      })
      expect(v).toEqual({ blocked: true, reason: "cancel_transition" })
    })

    it("completed → in_progress 후퇴 → 차단 (status_regression)", () => {
      const v = shouldBlockResultChange({
        ...base,
        incomingResult: null,
        incomingStatus: "in_progress",
      })
      expect(v).toEqual({ blocked: true, reason: "status_regression" })
    })

    it("in_progress → completed 정상 진행 → 허용 (첫 확정은 정산 전이므로 가드 밖이지만, 방어적으로도 통과)", () => {
      // 이론상 settled 픽 + in_progress 조합은 비정상이나, 가드가 정상 진행까지 막지 않는지 확인
      const v = shouldBlockResultChange({
        hasSettledPicks: true,
        currentResult: null,
        currentStatus: "in_progress",
        incomingResult: null,
        incomingStatus: "completed",
      })
      expect(v.blocked).toBe(false)
    })

    it('현재 result 가 ""(빈 문자열)이고 수신도 null → 동일 취급, 허용', () => {
      const v = shouldBlockResultChange({
        ...base,
        currentResult: "",
        incomingResult: null,
        incomingStatus: "completed",
      })
      expect(v.blocked).toBe(false)
    })

    it("현재 result 없음(null) + 새 result 수신 → 차단 (정산 후 결과 최초 기록도 변경)", () => {
      // cancelled 로 정산(환불)된 경기에 뒤늦게 결과가 오는 케이스 — 픽은 이미 환불됨.
      // result 기록 자체는 무해해 보이나, cancelled 상태와 함께 오면 cancel_transition,
      // result 만 오면 result_change 로 잡는다. 허용이 필요해지면 D-5 에서 결정.
      const v = shouldBlockResultChange({
        hasSettledPicks: true,
        currentResult: null,
        currentStatus: "completed",
        incomingResult: "home",
        incomingStatus: "completed",
      })
      expect(v).toEqual({ blocked: true, reason: "result_change" })
    })
  })

  it("describeBlockReason 은 세 사유 전부에 문구를 가진다", () => {
    expect(describeBlockReason("result_change")).toContain("결과 변경")
    expect(describeBlockReason("cancel_transition")).toContain("취소")
    expect(describeBlockReason("status_regression")).toContain("상태")
  })
})

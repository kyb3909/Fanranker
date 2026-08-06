import { describe, expect, it } from "vitest"
import { confirmationPatch, gatedStageSignal, nextStage } from "@/lib/saga/stages"

/**
 * D7 노출 전이(is_confirmed) — 2026-08-06 점검 F2 의 수리를 잠근다.
 * 기존: done 신호 하나로 무조건 개방 + 비가역 → 루머만으로 열린 문서 8건,
 * 후퇴 후 열린 채 방치 3건. 새 규칙: 열림은 오피셜 완료에서만, 후퇴 신호에 재잠금.
 */

describe("confirmationPatch", () => {
  it("오피셜 완료에서만 연다", () => {
    expect(confirmationPatch("done", "official")).toEqual({ is_confirmed: true })
  })

  it("루머·유력 done 신호로는 열지 않는다 (LLM 이 제목에서 done 을 읽었을 뿐)", () => {
    expect(confirmationPatch("done", "rumor")).toEqual({})
    expect(confirmationPatch("done", "tier1")).toEqual({})
  })

  it("비-done 신호(후퇴 포함)는 다시 잠근다 — 기마랑이스 실사고 재발 방지", () => {
    expect(confirmationPatch("negotiation", "official")).toEqual({ is_confirmed: false })
    expect(confirmationPatch("bid", "rumor")).toEqual({ is_confirmed: false })
    expect(confirmationPatch("medical", "tier1")).toEqual({ is_confirmed: false })
  })

  it("stage 신호가 없는 엔트리는 노출 상태를 건드리지 않는다", () => {
    expect(confirmationPatch(null, "official")).toEqual({})
    expect(confirmationPatch(null, "rumor")).toEqual({})
  })
})

describe("gatedStageSignal — 오피셜 단계는 official 티어에서만 (2026-08-06 오너 확정)", () => {
  it("루머·유력의 '완료' 주장은 단계 신호를 잃는다 — 비니시우스 AS '간주' 실사고", () => {
    expect(gatedStageSignal("done", "rumor")).toBeNull()
    expect(gatedStageSignal("done", "tier1")).toBeNull()
  })

  it("official 의 done 만 단계를 움직인다", () => {
    expect(gatedStageSignal("done", "official")).toBe("done")
  })

  it("done 외의 신호는 티어와 무관하게 통과한다 (협상·제안은 루머로도 전진)", () => {
    expect(gatedStageSignal("negotiation", "rumor")).toBe("negotiation")
    expect(gatedStageSignal("bid", "tier1")).toBe("bid")
    expect(gatedStageSignal(null, "rumor")).toBeNull()
  })

  it("게이트 결합: 루머 done 신호로는 사가 단계가 현 위치에 머문다", () => {
    expect(nextStage("transfer", "bid", gatedStageSignal("done", "rumor"))).toBe("bid")
    expect(nextStage("transfer", "bid", gatedStageSignal("done", "official"))).toBe("done")
  })
})

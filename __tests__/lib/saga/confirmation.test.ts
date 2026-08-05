import { describe, expect, it } from "vitest"
import { confirmationPatch } from "@/lib/saga/stages"

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

import { describe, expect, it } from "vitest"
import { assessMotmCoverage, type MotmCandidate } from "@/lib/ops/motm-coverage"

/**
 * LFA 전용으로 등록됐다가 베트맨이 연결된 경기는 폴이 `lfa_<id>` 키 아래 있다 (2026-09-07,
 * 유벤투스–AC밀란). 베트맨 키로만 찾으면 있는 폴을 결번으로 센다.
 */
const NOW = Date.parse("2026-09-07T00:00:00Z")
const cand = (i: number, extra: Partial<MotmCandidate> = {}): MotmCandidate => ({
  matchKey: `k${i}`,
  label: `m${i}`,
  ftAtMs: NOW - 3 * 3600_000,
  hasLineup: true,
  hasFtEvidence: true,
  ...extra,
})

describe("assessMotmCoverage — 대체 키", () => {
  it("LFA 키 아래 있는 폴은 결번이 아니다", () => {
    const cands = [cand(1, { altKeys: ["lfa_a"] }), cand(2), cand(3), cand(4), cand(5)]
    const have = new Set(["lfa_a", "k2", "k3", "k4", "k5"])
    const r = assessMotmCoverage(cands, have, NOW)
    expect(r.missing).toEqual([])
    expect(r.alert).toBe(false)
  })

  it("대체 키에도 없으면 결번이다", () => {
    const cands = [cand(1, { altKeys: ["lfa_a"] }), cand(2), cand(3), cand(4), cand(5)]
    const have = new Set(["k2", "k3", "k4", "k5"])
    const r = assessMotmCoverage(cands, have, NOW)
    expect(r.missing).toEqual([{ matchKey: "k1", label: "m1" }])
  })
})

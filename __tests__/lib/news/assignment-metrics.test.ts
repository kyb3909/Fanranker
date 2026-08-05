import { describe, expect, it } from "vitest"
import {
  summarizeAssignmentShadow,
  toActualBucket,
  toInterestVerdict,
  type AssignmentRowSnapshot,
} from "@/lib/news/assignment-metrics"

/**
 * shadow 대조 지표. 이 숫자들이 실집행 전환의 근거이므로,
 * "실패가 판정 분포에 섞이지 않는다"를 여기서 회귀로 잠근다.
 */

function row(overrides: Partial<AssignmentRowSnapshot> = {}): AssignmentRowSnapshot {
  return {
    candidate_id: "c1",
    outcome: "assign",
    status: "ok",
    desk: "transfer",
    risk: "medium",
    format: "standard",
    reason_codes: ["big_club"],
    model: "gpt-4o-mini",
    latency_ms: 1000,
    estimated_cost_usd: 0.0002,
    created_at: "2026-08-05T00:00:00.000Z",
    ...overrides,
  }
}

describe("toActualBucket", () => {
  it("발행·부분발행은 published, 반려·만료·중복은 dropped 로 접는다", () => {
    expect(toActualBucket("published")).toBe("published")
    expect(toActualBucket("partially_published")).toBe("published")
    expect(toActualBucket("rejected")).toBe("dropped")
    expect(toActualBucket("expired")).toBe("dropped")
    expect(toActualBucket("duplicate")).toBe("dropped")
  })

  it("아직 안 끝난 상태는 pending, 후보를 못 찾으면 unknown", () => {
    expect(toActualBucket("needs_human")).toBe("pending")
    expect(toActualBucket("drafted")).toBe("pending")
    expect(toActualBucket(undefined)).toBe("unknown")
  })
})

describe("toInterestVerdict", () => {
  it("관심도 필터의 유지·반려 사유만 판정으로 인정한다", () => {
    expect(toInterestVerdict("interest_keep")).toBe("keep")
    expect(toInterestVerdict("club_guard_keep")).toBe("keep")
    expect(toInterestVerdict("low_interest")).toBe("drop")
    expect(toInterestVerdict("womens_football")).toBe("drop")
  })

  it("재시도·기록 실패는 판정이 아니다", () => {
    expect(toInterestVerdict("interest_judgement_failed")).toBeNull()
    expect(toInterestVerdict(null)).toBeNull()
  })
})

describe("summarizeAssignmentShadow", () => {
  it("실패 행은 판정 분포에 섞이지 않고 별도로 집계된다", () => {
    const metrics = summarizeAssignmentShadow(
      [
        row({ candidate_id: "a", outcome: "assign" }),
        row({
          candidate_id: "b",
          outcome: "llm_error",
          status: "retry_wait",
          desk: null,
          risk: null,
          format: null,
          reason_codes: [],
        }),
        row({
          candidate_id: "c",
          outcome: "invalid_output",
          status: "dead_letter",
          desk: null,
          risk: null,
          format: null,
          reason_codes: [],
        }),
      ],
      []
    )

    expect(metrics.decisions).toEqual({ assign: 1 })
    expect(metrics.failures).toEqual({ "llm_error:retry_wait": 1, "invalid_output:dead_letter": 1 })
    expect(metrics.retryWait).toBe(1)
    expect(metrics.deadLetter).toBe(1)
    expect(metrics.settled).toBe(1)
    // 실패 후보는 desk 분포를 오염시키지 않는다
    expect(metrics.desks).toEqual({ transfer: 1 })
  })

  it("shadow 가 반려했는데 실제로 발행된 비율을 계산한다 (오차단 위험 지표)", () => {
    const metrics = summarizeAssignmentShadow(
      [
        row({ candidate_id: "a", outcome: "reject" }),
        row({ candidate_id: "b", outcome: "reject" }),
        row({ candidate_id: "c", outcome: "assign" }),
      ],
      [
        { candidate_id: "a", state: "published" },
        { candidate_id: "b", state: "rejected" },
        { candidate_id: "c", state: "published" },
      ]
    )

    expect(metrics.agreement.rejectPublishedRate).toBe(50)
    expect(metrics.agreement.assignPublishedRate).toBe(100)
    expect(metrics.agreement.matrix.reject).toEqual({
      published: 1,
      dropped: 1,
      pending: 0,
      unknown: 0,
    })
  })

  it("판정 대상이 없으면 비율은 0 이 아니라 null 이다 (0%로 오독 금지)", () => {
    const metrics = summarizeAssignmentShadow([row({ outcome: "assign" })], [])
    expect(metrics.agreement.rejectPublishedRate).toBeNull()
  })

  it("규칙으로 끝난 비율(LLM 호출 절감)을 계산한다", () => {
    const metrics = summarizeAssignmentShadow(
      [
        row({ candidate_id: "a", model: "rule:v1", estimated_cost_usd: 0 }),
        row({ candidate_id: "b", model: "rule:v1", estimated_cost_usd: 0 }),
        row({ candidate_id: "c" }),
        row({ candidate_id: "d" }),
      ],
      []
    )

    expect(metrics.calls).toEqual({ llm: 2, rule: 2, ruleShortCircuitRate: 50 })
  })

  it("비용을 못 매긴 행은 0 으로 세지 않고 따로 보고한다", () => {
    const metrics = summarizeAssignmentShadow(
      [
        row({ candidate_id: "a", estimated_cost_usd: 0.001 }),
        row({ candidate_id: "b", estimated_cost_usd: null }),
      ],
      []
    )

    expect(metrics.cost.totalUsd).toBe(0.001)
    expect(metrics.cost.unpricedRows).toBe(1)
  })

  it("numeric 이 문자열로 와도 비용을 합산한다", () => {
    const metrics = summarizeAssignmentShadow([row({ estimated_cost_usd: "0.000250" })], [])
    expect(metrics.cost.totalUsd).toBe(0.00025)
  })

  it("기존 관심도 필터 판정과의 일치율을 낸다", () => {
    const metrics = summarizeAssignmentShadow(
      [
        row({ candidate_id: "a", outcome: "assign" }),
        row({ candidate_id: "b", outcome: "reject" }),
        row({ candidate_id: "c", outcome: "assign" }),
      ],
      [],
      [
        { candidate_id: "a", reason_code: "interest_keep" },
        { candidate_id: "b", reason_code: "low_interest" },
        { candidate_id: "c", reason_code: "low_interest" },
      ]
    )

    expect(metrics.agreement.vsInterestFilter.compared).toBe(3)
    expect(metrics.agreement.vsInterestFilter.agree).toBe(2)
    expect(metrics.agreement.vsInterestFilter.matrix).toEqual({
      "keep->keep": 1,
      "drop->drop": 1,
      "drop->keep": 1,
    })
  })

  it("지연 분포는 판정·실패 행을 모두 반영한다 (실패도 시간을 쓴다)", () => {
    const metrics = summarizeAssignmentShadow(
      [
        row({ candidate_id: "a", latency_ms: 100 }),
        row({ candidate_id: "b", latency_ms: 900, outcome: "llm_error", status: "retry_wait" }),
      ],
      []
    )

    expect(metrics.latency.p50).toBe(100)
    expect(metrics.latency.p95).toBe(900)
  })
})

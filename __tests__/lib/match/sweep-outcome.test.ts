import { describe, expect, it } from "vitest"
import {
  internalFailures,
  isInternalMotmSkip,
  isInternalThreadSkip,
} from "@/lib/match/sweep-outcome"

describe("스윕 결과 분류 — 정상 대기와 우리 장애", () => {
  it("불판: 기존 글·라인업 대기·유니크 경합은 정상, 조회 실패·삽입 오류는 장애", () => {
    for (const ok of ["exists", "lineup-not-ready", "insert: 23505", "insert:23505"]) {
      expect(isInternalThreadSkip(ok), ok).toBe(false)
    }
    for (const bad of [
      "sibling-lookup-failed",
      "post-lookup-failed",
      "insert: 42P01",
      "insert: fetch failed",
    ]) {
      expect(isInternalThreadSkip(bad), bad).toBe(true)
    }
  })

  it("MoTM: 라인업 없음·얇음·보강 없음·유니크 경합은 정상, 보강 오류·삽입 오류·예외는 장애", () => {
    for (const ok of ["no_lineup", "thin_lineup", "repair_noop", "insert:23505"]) {
      expect(isInternalMotmSkip(ok), ok).toBe(false)
    }
    for (const bad of ["repair:42P01", "insert:XX000", "lfa-fixture-list:42P01", "unknown"]) {
      expect(isInternalMotmSkip(bad), bad).toBe(true)
    }
  })

  it("internalFailures 는 장애만 남긴다", () => {
    const skipped = [
      { gameId: "a", reason: "exists" },
      { gameId: "b", reason: "post-lookup-failed" },
      { gameId: "c", reason: "insert: 23505" },
    ]
    expect(internalFailures(skipped, isInternalThreadSkip)).toEqual([
      { gameId: "b", reason: "post-lookup-failed" },
    ])
  })
})

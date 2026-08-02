import { describe, it, expect } from "vitest"
import { kstWeekStart, hashCandidates, drawWinners } from "@/lib/event/weekly-draw"
import type { DrawCandidate } from "@/lib/event/weekly-draw"

const cand = (n: number): DrawCandidate[] =>
  Array.from({ length: n }, (_, i) => ({
    user_id: `user_${String(i).padStart(3, "0")}`,
    nickname: `팬${i}`,
    total_points: 30 + i,
    community_actions: 3,
  }))

describe("kstWeekStart — 회차 식별자는 KST 월요일", () => {
  it("월요일 자정 직후(KST)는 그날이 주 시작", () => {
    // 2026-08-03(월) 00:30 KST == 2026-08-02T15:30Z
    expect(kstWeekStart(new Date("2026-08-02T15:30:00Z"))).toBe("2026-08-03")
  })

  it("일요일 밤(KST)은 아직 지난 월요일 주차", () => {
    // 2026-08-09(일) 23:00 KST == 2026-08-09T14:00Z
    expect(kstWeekStart(new Date("2026-08-09T14:00:00Z"))).toBe("2026-08-03")
  })

  it("월요일이 되는 순간 다음 주차로 넘어간다", () => {
    // 2026-08-10(월) 00:00 KST == 2026-08-09T15:00Z
    expect(kstWeekStart(new Date("2026-08-09T15:00:00Z"))).toBe("2026-08-10")
  })

  it("UTC 로 계산하면 틀리는 구간을 KST 기준으로 잡는다", () => {
    // 2026-08-03(월) 08:00 KST 는 UTC 로는 아직 일요일(2026-08-02T23:00Z)
    expect(kstWeekStart(new Date("2026-08-02T23:00:00Z"))).toBe("2026-08-03")
  })
})

describe("hashCandidates — 명단 지문", () => {
  it("순서가 달라도 같은 명단이면 같은 해시", () => {
    expect(hashCandidates(["b", "a", "c"])).toBe(hashCandidates(["c", "b", "a"]))
  })

  it("한 명이라도 다르면 해시가 달라진다", () => {
    expect(hashCandidates(["a", "b"])).not.toBe(hashCandidates(["a", "b", "c"]))
  })
})

describe("drawWinners — 추첨", () => {
  it("요청한 인원만큼 뽑는다", () => {
    expect(drawWinners(cand(50), 5)).toHaveLength(5)
  })

  it("중복 당첨이 없다", () => {
    for (let t = 0; t < 200; t++) {
      const w = drawWinners(cand(20), 5)
      expect(new Set(w.map((x) => x.user_id)).size).toBe(5)
    }
  })

  it("후보가 요청 인원보다 적으면 있는 만큼만 (예외 없이)", () => {
    expect(drawWinners(cand(3), 5)).toHaveLength(3)
    expect(drawWinners([], 5)).toHaveLength(0)
  })

  it("원본 후보 배열을 변형하지 않는다", () => {
    const pool = cand(10)
    const before = pool.map((c) => c.user_id)
    drawWinners(pool, 5)
    expect(pool.map((c) => c.user_id)).toEqual(before)
  })

  it("특정 후보에게 쏠리지 않는다 (균등 추첨)", () => {
    // 10명 중 3명씩 6000회 → 기대 노출 1800회. 편향이 있으면 이 범위를 벗어난다.
    const counts = new Map<string, number>()
    for (let t = 0; t < 6000; t++) {
      for (const w of drawWinners(cand(10), 3)) {
        counts.set(w.user_id, (counts.get(w.user_id) ?? 0) + 1)
      }
    }
    expect(counts.size).toBe(10)
    for (const c of counts.values()) {
      expect(c).toBeGreaterThan(1500)
      expect(c).toBeLessThan(2100)
    }
  })
})

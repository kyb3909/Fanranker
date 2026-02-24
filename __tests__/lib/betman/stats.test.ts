import { describe, it, expect } from "vitest"
import { calculateStreaks } from "@/lib/betman/stats"

describe("calculateStreaks", () => {
  it("returns zeros for empty array", () => {
    const result = calculateStreaks([])
    expect(result).toEqual({ currentStreak: 0, bestWin: 0, worstLose: 0 })
  })

  it("counts single win", () => {
    const result = calculateStreaks([true])
    expect(result).toEqual({ currentStreak: 1, bestWin: 1, worstLose: 0 })
  })

  it("counts single loss", () => {
    const result = calculateStreaks([false])
    expect(result).toEqual({ currentStreak: -1, bestWin: 0, worstLose: 1 })
  })

  it("counts consecutive wins", () => {
    const result = calculateStreaks([true, true, true])
    expect(result.currentStreak).toBe(3)
    expect(result.bestWin).toBe(3)
    expect(result.worstLose).toBe(0)
  })

  it("counts consecutive losses", () => {
    const result = calculateStreaks([false, false, false, false])
    expect(result.currentStreak).toBe(-4)
    expect(result.bestWin).toBe(0)
    expect(result.worstLose).toBe(4)
  })

  it("tracks best win streak across mixed results", () => {
    // W W W L L W W W W W
    const results = [true, true, true, false, false, true, true, true, true, true]
    const result = calculateStreaks(results)
    expect(result.bestWin).toBe(5)
    expect(result.worstLose).toBe(2)
    expect(result.currentStreak).toBe(5) // ends on 5-win streak
  })

  it("tracks worst lose streak across mixed results", () => {
    // W L L L L W W L
    const results = [true, false, false, false, false, true, true, false]
    const result = calculateStreaks(results)
    expect(result.bestWin).toBe(2)
    expect(result.worstLose).toBe(4)
    expect(result.currentStreak).toBe(-1) // ends on 1-loss streak
  })

  it("resets streak when result changes", () => {
    // W W L W
    const result = calculateStreaks([true, true, false, true])
    expect(result.currentStreak).toBe(1)
    expect(result.bestWin).toBe(2)
    expect(result.worstLose).toBe(1)
  })

  it("handles alternating results", () => {
    // W L W L W L
    const result = calculateStreaks([true, false, true, false, true, false])
    expect(result.bestWin).toBe(1)
    expect(result.worstLose).toBe(1)
    expect(result.currentStreak).toBe(-1) // ends on loss
  })

  it("handles all wins", () => {
    const result = calculateStreaks([true, true, true, true, true])
    expect(result.currentStreak).toBe(5)
    expect(result.bestWin).toBe(5)
    expect(result.worstLose).toBe(0)
  })

  it("handles all losses", () => {
    const result = calculateStreaks([false, false, false])
    expect(result.currentStreak).toBe(-3)
    expect(result.bestWin).toBe(0)
    expect(result.worstLose).toBe(3)
  })

  it("correctly identifies current streak direction after multiple switches", () => {
    // L L W W W L L L W W
    const results = [false, false, true, true, true, false, false, false, true, true]
    const result = calculateStreaks(results)
    expect(result.currentStreak).toBe(2) // ends on 2-win streak
    expect(result.bestWin).toBe(3)
    expect(result.worstLose).toBe(3)
  })
})

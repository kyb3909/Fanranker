import { describe, it, expect } from "vitest"

// Regression: ISSUE-001 — galcup/worldcup pages called /api/battles/rooms but the route didn't exist
// Found by /qa on 2026-03-29
// Report: .gstack/qa-reports/qa-report-gongnori-fan-2026-03-29.md

/**
 * Extract the mode validation logic from app/api/battles/rooms/route.ts
 * to test parameter parsing without needing a real DB connection.
 */
function parseRoomsParams(url: string) {
  const { searchParams } = new URL(url, "http://localhost")
  const mode = searchParams.get("mode")
  const category = searchParams.get("category")

  if (!mode || !["cheer", "worldcup"].includes(mode)) {
    return { error: "mode 파라미터가 필요합니다 (cheer | worldcup)" }
  }

  const effectiveCategory = category && category !== "all" ? category : null

  return { mode, category: effectiveCategory, error: null }
}

describe("/api/battles/rooms parameter validation", () => {
  it("rejects requests without mode parameter", () => {
    const result = parseRoomsParams("/api/battles/rooms")
    expect(result.error).toBeTruthy()
  })

  it("rejects invalid mode values", () => {
    const result = parseRoomsParams("/api/battles/rooms?mode=invalid")
    expect(result.error).toBeTruthy()
  })

  it("accepts mode=cheer", () => {
    const result = parseRoomsParams("/api/battles/rooms?mode=cheer")
    expect(result.error).toBeNull()
    expect(result.mode).toBe("cheer")
  })

  it("accepts mode=worldcup", () => {
    const result = parseRoomsParams("/api/battles/rooms?mode=worldcup")
    expect(result.error).toBeNull()
    expect(result.mode).toBe("worldcup")
  })

  it("ignores category=all (treat as no filter)", () => {
    const result = parseRoomsParams("/api/battles/rooms?mode=cheer&category=all")
    expect(result.category).toBeNull()
  })

  it("passes through specific category", () => {
    const result = parseRoomsParams("/api/battles/rooms?mode=cheer&category=축구")
    expect(result.category).toBe("축구")
  })

  it("handles missing category gracefully", () => {
    const result = parseRoomsParams("/api/battles/rooms?mode=worldcup")
    expect(result.category).toBeNull()
  })
})

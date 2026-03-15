import { describe, it, expect } from "vitest"

// ============================================================
// Validation logic extracted from app/api/users/block/route.ts
// ============================================================

/** Validate block request */
function validateBlockRequest(
  targetId: string | undefined,
  currentUserId: string
): { valid: boolean; error?: string; status?: number } {
  if (!targetId) {
    return { valid: false, error: "user_id가 필요합니다.", status: 400 }
  }
  if (targetId === currentUserId) {
    return { valid: false, error: "자기 자신을 차단할 수 없습니다.", status: 400 }
  }
  return { valid: true }
}

/** Determine block action based on existing block */
function determineBlockAction(existingBlock: { id: string } | null): "unblock" | "block" {
  return existingBlock ? "unblock" : "block"
}

// ============================================================
// Tests
// ============================================================

describe("validateBlockRequest", () => {
  const currentUser = "user-123"

  it("passes valid request", () => {
    const result = validateBlockRequest("user-456", currentUser)
    expect(result.valid).toBe(true)
  })

  it("fails when targetId is undefined", () => {
    const result = validateBlockRequest(undefined, currentUser)
    expect(result.valid).toBe(false)
    expect(result.error).toContain("user_id")
    expect(result.status).toBe(400)
  })

  it("fails when targetId is empty string", () => {
    const result = validateBlockRequest("", currentUser)
    expect(result.valid).toBe(false)
  })

  it("fails when blocking self", () => {
    const result = validateBlockRequest("user-123", currentUser)
    expect(result.valid).toBe(false)
    expect(result.error).toContain("자기 자신")
    expect(result.status).toBe(400)
  })
})

describe("determineBlockAction", () => {
  it("returns unblock when block exists", () => {
    expect(determineBlockAction({ id: "block-1" })).toBe("unblock")
  })

  it("returns block when no existing block", () => {
    expect(determineBlockAction(null)).toBe("block")
  })
})

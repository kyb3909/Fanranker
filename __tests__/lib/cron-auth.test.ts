import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ============================================================
// Pure logic extracted from lib/cron-auth.ts for testing
// ============================================================

/**
 * Mirrors verifyCronSecret logic without NextResponse dependency.
 * Returns null on success, or { error, status } on failure.
 */
function verifyCronAuth(
  authHeader: string | null,
  cronSecret: string | undefined
): { error: string; status: number } | null {
  if (!cronSecret) {
    return { error: "Server configuration error", status: 500 }
  }

  const header = authHeader || ""
  const expected = `Bearer ${cronSecret}`

  // Length check + content comparison (mirrors timing-safe logic)
  if (header.length !== expected.length) {
    return { error: "Unauthorized", status: 401 }
  }

  // Constant-time comparison simulation
  let mismatch = 0
  for (let i = 0; i < header.length; i++) {
    mismatch |= header.charCodeAt(i) ^ expected.charCodeAt(i)
  }

  if (mismatch !== 0) {
    return { error: "Unauthorized", status: 401 }
  }

  return null
}

// ============================================================
// Tests
// ============================================================

describe("verifyCronAuth", () => {
  const SECRET = "my-super-secret-key"

  it("returns null (success) for valid Bearer token", () => {
    const result = verifyCronAuth(`Bearer ${SECRET}`, SECRET)
    expect(result).toBeNull()
  })

  it("returns 500 when CRON_SECRET is not set", () => {
    const result = verifyCronAuth("Bearer anything", undefined)
    expect(result).toEqual({ error: "Server configuration error", status: 500 })
  })

  it("returns 500 when CRON_SECRET is empty string", () => {
    const result = verifyCronAuth("Bearer test", "")
    expect(result).toEqual({ error: "Server configuration error", status: 500 })
  })

  it("returns 401 for wrong token", () => {
    const result = verifyCronAuth("Bearer wrong-token", SECRET)
    expect(result).toEqual({ error: "Unauthorized", status: 401 })
  })

  it("returns 401 for missing authorization header", () => {
    const result = verifyCronAuth(null, SECRET)
    expect(result).toEqual({ error: "Unauthorized", status: 401 })
  })

  it("returns 401 for empty authorization header", () => {
    const result = verifyCronAuth("", SECRET)
    expect(result).toEqual({ error: "Unauthorized", status: 401 })
  })

  it("returns 401 for token without Bearer prefix", () => {
    const result = verifyCronAuth(SECRET, SECRET)
    expect(result).toEqual({ error: "Unauthorized", status: 401 })
  })

  it("returns 401 for Basic auth instead of Bearer", () => {
    const result = verifyCronAuth(`Basic ${SECRET}`, SECRET)
    expect(result).toEqual({ error: "Unauthorized", status: 401 })
  })

  it("is case-sensitive for Bearer prefix", () => {
    const result = verifyCronAuth(`bearer ${SECRET}`, SECRET)
    expect(result).toEqual({ error: "Unauthorized", status: 401 })
  })

  it("rejects partial token match", () => {
    const result = verifyCronAuth(`Bearer ${SECRET.slice(0, -1)}`, SECRET)
    expect(result).toEqual({ error: "Unauthorized", status: 401 })
  })
})

// ============================================================
// Tests: actual verifyCronSecret function (integration)
// ============================================================

describe("verifyCronSecret (integration)", () => {
  const originalEnv = process.env.CRON_SECRET

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CRON_SECRET = originalEnv
    } else {
      delete process.env.CRON_SECRET
    }
  })

  it("passes with correct secret", async () => {
    process.env.CRON_SECRET = "test-secret-123"
    const { verifyCronSecret } = await import("@/lib/cron-auth")
    const request = new Request("http://localhost/api/cron/test", {
      headers: { authorization: "Bearer test-secret-123" },
    })
    const result = verifyCronSecret(request)
    expect(result).toBeNull()
  })

  it("rejects with wrong secret", async () => {
    process.env.CRON_SECRET = "test-secret-123"
    const { verifyCronSecret } = await import("@/lib/cron-auth")
    const request = new Request("http://localhost/api/cron/test", {
      headers: { authorization: "Bearer wrong-secret" },
    })
    const result = verifyCronSecret(request)
    expect(result).not.toBeNull()
  })
})

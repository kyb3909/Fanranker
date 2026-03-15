import { describe, it, expect } from "vitest"

// ============================================================
// Pure logic extracted from lib/supabase/ensure-profile.ts
// ============================================================

/** Generate default nickname from userId */
function generateDefaultNickname(userId: string): string {
  return `User_${userId.slice(-8)}`
}

/** Determine profile creation strategy based on insert result */
function getProfileStrategy(insertError: unknown): "success" | "upsert" | "fail" {
  if (!insertError) return "success"
  return "upsert" // fallback to upsert on insert failure
}

/** Build profile insert payload */
function buildProfilePayload(
  userId: string,
  imageUrl: string | null
): { user_id: string; nickname: string; avatar_url: string | null } {
  return {
    user_id: userId,
    nickname: generateDefaultNickname(userId),
    avatar_url: imageUrl,
  }
}

/** Build sync profile payload */
function buildSyncPayload(
  userId: string,
  imageUrl: string | null
): { user_id: string; nickname: string; avatar_url: string | null; updated_at: string } {
  return {
    user_id: userId,
    nickname: generateDefaultNickname(userId),
    avatar_url: imageUrl,
    updated_at: new Date().toISOString(),
  }
}

// ============================================================
// Tests
// ============================================================

describe("generateDefaultNickname", () => {
  it("takes last 8 chars of userId", () => {
    expect(generateDefaultNickname("user_abcdefgh12345678")).toBe("User_12345678")
  })

  it("handles short userId", () => {
    expect(generateDefaultNickname("abc")).toBe("User_abc")
  })

  it("handles exactly 8 char userId", () => {
    expect(generateDefaultNickname("12345678")).toBe("User_12345678")
  })

  it("handles typical Clerk user ID format", () => {
    const clerkId = "user_3APv7ZaJqtn3y54WXDHL36ZUrQz"
    expect(generateDefaultNickname(clerkId)).toBe("User_L36ZUrQz")
  })
})

describe("getProfileStrategy", () => {
  it("returns success when no error", () => {
    expect(getProfileStrategy(null)).toBe("success")
    expect(getProfileStrategy(undefined)).toBe("success")
    expect(getProfileStrategy(false)).toBe("success")
    expect(getProfileStrategy(0)).toBe("success")
    expect(getProfileStrategy("")).toBe("success")
  })

  it("returns upsert when error exists", () => {
    expect(getProfileStrategy(new Error("RLS violation"))).toBe("upsert")
    expect(getProfileStrategy({ code: "23505" })).toBe("upsert")
    expect(getProfileStrategy("some error")).toBe("upsert")
  })
})

describe("buildProfilePayload", () => {
  it("builds correct payload", () => {
    const result = buildProfilePayload("user_abc12345678", "https://img.clerk.com/avatar.jpg")
    expect(result).toEqual({
      user_id: "user_abc12345678",
      nickname: "User_12345678",
      avatar_url: "https://img.clerk.com/avatar.jpg",
    })
  })

  it("handles null imageUrl", () => {
    const result = buildProfilePayload("user_abc12345678", null)
    expect(result.avatar_url).toBeNull()
  })
})

describe("buildSyncPayload", () => {
  it("includes updated_at timestamp", () => {
    const before = new Date().toISOString()
    const result = buildSyncPayload("user_abc12345678", null)
    const after = new Date().toISOString()
    expect(result.updated_at >= before).toBe(true)
    expect(result.updated_at <= after).toBe(true)
  })

  it("includes all required fields", () => {
    const result = buildSyncPayload("user_test12345678", "https://img.com/photo.jpg")
    expect(result.user_id).toBe("user_test12345678")
    expect(result.nickname).toBe("User_12345678")
    expect(result.avatar_url).toBe("https://img.com/photo.jpg")
    expect(result.updated_at).toBeDefined()
  })
})

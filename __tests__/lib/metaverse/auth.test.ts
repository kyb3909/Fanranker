import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const authMock = vi.fn()
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}))

import { resolveMetaverseUser, METAVERSE_GUEST_HEADER } from "@/lib/metaverse/auth"

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/test", { headers })
}

describe("metaverse/auth", () => {
  beforeEach(() => {
    authMock.mockReset()
  })

  it("Clerk 인증된 유저면 그 userId 를 반환", async () => {
    authMock.mockResolvedValue({ userId: "user_abc123" })
    const result = await resolveMetaverseUser(makeRequest())
    expect(result).toEqual({ userId: "user_abc123", isGuest: false })
  })

  describe("dev 환경 게스트 헤더", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "development")
      authMock.mockResolvedValue({ userId: null })
    })

    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it("유효한 guest-* 헤더로 게스트 identity 반환", async () => {
      const req = makeRequest({ [METAVERSE_GUEST_HEADER]: "guest-abcd1234" })
      const result = await resolveMetaverseUser(req)
      expect(result).toEqual({ userId: "guest-abcd1234", isGuest: true })
    })

    it("guest- 접두사 없으면 거부", async () => {
      const req = makeRequest({ [METAVERSE_GUEST_HEADER]: "user_abc123" })
      const result = await resolveMetaverseUser(req)
      expect(result).toBeNull()
    })

    it("너무 짧은 guest id 거부 (최소 4자)", async () => {
      const req = makeRequest({ [METAVERSE_GUEST_HEADER]: "guest-a" })
      const result = await resolveMetaverseUser(req)
      expect(result).toBeNull()
    })

    it("특수문자 포함 guest id 거부", async () => {
      const req = makeRequest({ [METAVERSE_GUEST_HEADER]: "guest-abc<script>" })
      const result = await resolveMetaverseUser(req)
      expect(result).toBeNull()
    })

    it("헤더 없으면 null", async () => {
      const result = await resolveMetaverseUser(makeRequest())
      expect(result).toBeNull()
    })
  })

  describe("프로덕션 환경", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "production")
      authMock.mockResolvedValue({ userId: null })
    })

    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it("Clerk 없으면 guest 헤더 무시하고 null — 게스트 금지", async () => {
      const req = makeRequest({ [METAVERSE_GUEST_HEADER]: "guest-valid123" })
      const result = await resolveMetaverseUser(req)
      expect(result).toBeNull()
    })
  })
})

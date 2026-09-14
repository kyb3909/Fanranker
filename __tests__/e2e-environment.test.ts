// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadE2EEnvironment, validateE2EEnvironment } from "@/tests/e2e/setup/environment"

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fixture",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_fixture",
  CLERK_SECRET_KEY: "sk_test_fixture",
}

afterEach(() => vi.unstubAllEnvs())

describe("E2E dedicated environment", () => {
  it.each(["localhost", "127.0.0.1", "[::1]"])("accepts the local API on %s", (host) => {
    const env = validateE2EEnvironment({
      ...valid,
      NEXT_PUBLIC_SUPABASE_URL: `http://${host}:54321/`,
    })
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe(`http://${host}:54321`)
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe(valid.SUPABASE_SERVICE_ROLE_KEY)
    expect(Object.isFrozen(env)).toBe(true)
  })

  it.each(Object.keys(valid))("rejects missing %s even if inherited environment has it", (key) => {
    vi.stubEnv(key, valid[key as keyof typeof valid])
    expect(() => validateE2EEnvironment({ ...valid, [key]: " " })).toThrow(key)
  })

  it.each([
    "https://example.supabase.co",
    "http://localhost.attacker.invalid:54321",
    "http://localhost@attacker.invalid:54321",
    "http://remote.invalid:54321/#localhost",
    "http://127.0.0.1:54321/proxy",
    "http://127.0.0.1:54321?url=remote",
    "http://127.0.0.1:54321#remote",
    "http://user:password@127.0.0.1:54321",
    "http://127.0.0.1:3000",
    "https://127.0.0.1:54321",
    "not-a-url",
  ])("rejects an unapproved DB target %s", (url) => {
    expect(() => validateE2EEnvironment({ ...valid, NEXT_PUBLIC_SUPABASE_URL: url })).toThrow(
      "E2E 환경 오류"
    )
  })

  it.each([
    ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_live_do-not-echo"],
    ["CLERK_SECRET_KEY", "sk_live_do-not-echo"],
    ["CLERK_SECRET_KEY", "invalid_fixture_not_a_key"],
  ])("rejects invalid %s without exposing it", (key, value) => {
    try {
      validateE2EEnvironment({ ...valid, [key]: value })
      throw new Error("should reject")
    } catch (error) {
      expect((error as Error).message).toContain("E2E 환경 오류")
      expect((error as Error).message).not.toContain(value)
    }
  })

  it("rejects a key prefix without a key", () => {
    expect(() => validateE2EEnvironment({ ...valid, CLERK_SECRET_KEY: "sk_test_" })).toThrow(
      "개발키"
    )
  })

  it("does not require a particular Supabase key encoding (local JWT and sb_* both work)", () => {
    expect(
      validateE2EEnvironment({
        ...valid,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "eyJ.local.anon-fixture",
        SUPABASE_SERVICE_ROLE_KEY: "eyJ.local.service-fixture",
      }).SUPABASE_SERVICE_ROLE_KEY
    ).toBe("eyJ.local.service-fixture")
  })

  it("reads only the dedicated file, never falls back and never mutates process.env", () => {
    const dir = mkdtempSync(join(tmpdir(), "gongnori-e2e-env-"))
    const file = join(dir, ".env.e2e")
    try {
      for (const [key, value] of Object.entries(valid)) vi.stubEnv(key, value)
      expect(() => loadE2EEnvironment(file)).toThrow("읽을 수 없습니다")
      writeFileSync(file, "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\n")
      expect(() => loadE2EEnvironment(file)).toThrow("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")

      vi.stubEnv("CLERK_SECRET_KEY", "sk_live_inherited-fixture")
      writeFileSync(
        file,
        Object.entries(valid)
          .map(([k, v]) => `${k}=${v}`)
          .join("\n") + "\nUNRELATED_SECRET=ignore-me\n"
      )
      expect(loadE2EEnvironment(file)).toEqual(valid)
      expect(process.env.CLERK_SECRET_KEY).toBe("sk_live_inherited-fixture")
    } finally {
      // Only the file and empty directory created by this test are removed.
      try {
        unlinkSync(file)
      } finally {
        rmdirSync(dir)
      }
    }
  })
})

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ loadEnvironment: vi.fn() }))
vi.mock("@/tests/e2e/setup/environment", () => ({
  E2E_BASE_URL: "http://localhost:3100",
  loadE2EEnvironment: mocks.loadEnvironment,
}))
vi.mock("@sentry/nextjs", () => ({ withSentryConfig: (config: unknown) => config }))
vi.mock("@next/bundle-analyzer", () => ({ default: () => (config: unknown) => config }))

const localEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fixture",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_fixture",
  CLERK_SECRET_KEY: "sk_test_fixture",
}

beforeEach(() => {
  vi.resetModules()
  mocks.loadEnvironment.mockReset().mockReturnValue(localEnvironment)
  // Register the ambient values so config's intentional worker injection is restored.
  for (const key of Object.keys(localEnvironment)) vi.stubEnv(key, "inherited-fixture")
  vi.stubEnv("E2E_TEST_BUILD", "")
  vi.stubEnv("AVATAR_LAB_DEV", "")
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Config must not perform network IO")
    })
  )
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("E2E config gates and build isolation", () => {
  it("uses the same checked keys for workers/server and checks readiness before build/start", async () => {
    const { default: config } = await import("../playwright.e2e.config")
    for (const [key, value] of Object.entries(localEnvironment))
      expect(process.env[key]).toBe(value)
    expect(config.use?.baseURL).toBe("http://localhost:3100")
    expect(config.webServer).toMatchObject({
      reuseExistingServer: false,
      command:
        "pnpm exec tsx tests/e2e/setup/preflight-cli.ts && pnpm build && pnpm start --port 3100",
      env: { ...localEnvironment, E2E_TEST_BUILD: "1" },
    })
    // Listing/loading config performs static validation only, not Docker/Clerk probes.
    expect(fetch).not.toHaveBeenCalled()
  })

  it("rejects unsafe configuration before returning a runnable server config", async () => {
    const rejected = new Error("INVALID_E2E_FILE")
    mocks.loadEnvironment.mockImplementation(() => {
      throw rejected
    })
    await expect(import("../playwright.e2e.config")).rejects.toBe(rejected)
    expect(process.env.CLERK_SECRET_KEY).toBe("inherited-fixture")
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    { e2e: "", avatar: "", directory: ".next", tsconfig: "tsconfig.json" },
    { e2e: "", avatar: "1", directory: ".next-avatar-lab", tsconfig: "tsconfig.json" },
    { e2e: "1", avatar: "", directory: ".next-e2e", tsconfig: "tsconfig.e2e.json" },
    { e2e: "1", avatar: "1", directory: ".next-e2e", tsconfig: "tsconfig.e2e.json" },
  ])(
    "selects $directory without changing the normal build",
    async ({ e2e, avatar, directory, tsconfig }) => {
      vi.stubEnv("E2E_TEST_BUILD", e2e)
      vi.stubEnv("AVATAR_LAB_DEV", avatar)
      const { default: config } = await import("../next.config.mjs")
      expect(config.distDir).toBe(directory)
      expect(config.typescript?.tsconfigPath).toBe(tsconfig)
      expect(fetch).not.toHaveBeenCalled()
    }
  )
})

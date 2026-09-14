// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Independent entry-point review: the real bot factory, seed and DB helper run,
 * while environment/readiness failures and all outside effects are isolated.
 * environment's value-validation matrix is covered by its own unit tests.
 */
const boundary = vi.hoisted(() => ({
  loadEnvironment: vi.fn(),
  prerequisites: vi.fn(),
  localSql: vi.fn(),
  fetch: vi.fn(),
  createClient: vi.fn(),
  execFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  unsafe: new Error("UNSAFE_E2E_ENVIRONMENT"),
  unavailable: new Error("LOCAL_E2E_PREREQUISITES_UNAVAILABLE"),
  ioStarted: new Error("OUTSIDE_EFFECT_STARTED"),
}))

vi.mock("@/tests/e2e/setup/environment", () => ({
  loadE2EEnvironment: boundary.loadEnvironment,
  E2E_BASE_URL: "http://localhost:3100",
  E2E_DB_CONTAINER: "supabase_db_community",
}))
vi.mock("@/tests/e2e/setup/preflight", () => ({
  assertE2EPrerequisites: boundary.prerequisites,
  runLocalE2ESql: boundary.localSql,
}))
vi.mock("@supabase/supabase-js", () => ({ createClient: boundary.createClient }))
vi.mock("node:child_process", () => ({ execFileSync: boundary.execFileSync }))
vi.mock("node:fs", () => ({
  existsSync: boundary.existsSync,
  readFileSync: boundary.readFileSync,
  writeFileSync: boundary.writeFileSync,
  mkdirSync: boundary.mkdirSync,
}))
// Keep even the unrepaired entry points from reading a developer's real keys.
vi.mock("dotenv", () => ({ config: vi.fn(() => ({ parsed: {} })) }))

const bot = {
  index: 1,
  email: "e2e-safety@example.invalid",
  password: "synthetic-password",
  clerkUserId: "user_e2e_safety",
}
const safeEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-local-public-key",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-local-service-key",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_synthetic",
  CLERK_SECRET_KEY: "sk_test_synthetic",
}

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.stubGlobal("fetch", boundary.fetch)
  for (const [key, value] of Object.entries(safeEnvironment)) vi.stubEnv(key, value)
  vi.spyOn(console, "log").mockImplementation(() => undefined)

  boundary.loadEnvironment.mockReturnValue(safeEnvironment)
  boundary.prerequisites.mockImplementation(async () => boundary.loadEnvironment())
  boundary.existsSync.mockReturnValue(true)
  boundary.readFileSync.mockReturnValue(JSON.stringify([bot]))
  for (const effect of [
    boundary.fetch,
    boundary.createClient,
    boundary.execFileSync,
    boundary.localSql,
    boundary.writeFileSync,
    boundary.mkdirSync,
  ]) {
    effect.mockImplementation(() => {
      throw boundary.ioStarted
    })
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function expectNoOutsideEffects() {
  expect(boundary.fetch).not.toHaveBeenCalled()
  expect(boundary.createClient).not.toHaveBeenCalled()
  expect(boundary.execFileSync).not.toHaveBeenCalled()
  expect(boundary.localSql).not.toHaveBeenCalled()
  expect(boundary.writeFileSync).not.toHaveBeenCalled()
  expect(boundary.mkdirSync).not.toHaveBeenCalled()
}

const entryPoints = [
  {
    name: "createBots",
    load: async () => {
      const { createBots } = await import("@/tests/e2e/setup/bot-factory")
      return () => createBots(1)
    },
  },
  {
    name: "cleanupBots",
    load: async () => {
      const { cleanupBots } = await import("@/tests/e2e/setup/bot-factory")
      return cleanupBots
    },
  },
  {
    name: "mintSignInToken",
    load: async () => {
      const { mintSignInToken } = await import("@/tests/e2e/setup/bot-factory")
      return () => mintSignInToken(bot.clerkUserId)
    },
  },
  {
    name: "seedDatabase",
    load: async () => {
      const { seedDatabase } = await import("@/tests/e2e/setup/seed")
      return () => seedDatabase([bot])
    },
  },
  {
    name: "dbClient",
    load: async () => {
      const { dbClient } = await import("@/tests/e2e/helpers/db-verifier")
      return dbClient
    },
  },
]

describe("E2E direct entry points fail before outside effects", () => {
  it.each(entryPoints)("$name validates environment at invocation", async ({ load }) => {
    const invoke = await load()
    boundary.loadEnvironment.mockImplementation(() => {
      throw boundary.unsafe
    })

    await expect((async () => await invoke())()).rejects.toBe(boundary.unsafe)
    expectNoOutsideEffects()
  })

  it("dbClient revalidates before returning an already cached client", async () => {
    const { dbClient } = await import("@/tests/e2e/helpers/db-verifier")
    const client = { synthetic: true }
    boundary.createClient.mockReturnValue(client)
    expect(dbClient()).toBe(client)
    boundary.loadEnvironment.mockImplementation(() => {
      throw boundary.unsafe
    })

    expect(() => dbClient()).toThrow(boundary.unsafe)
    expect(boundary.createClient).toHaveBeenCalledTimes(1)
    expect(boundary.fetch).not.toHaveBeenCalled()
  })
})

describe("bot creation waits for local prerequisites", () => {
  it("does not create or modify a Clerk account when local preflight fails", async () => {
    const { createBots } = await import("@/tests/e2e/setup/bot-factory")
    boundary.prerequisites.mockRejectedValue(boundary.unavailable)

    await expect(createBots(1)).rejects.toBe(boundary.unavailable)
    expect(boundary.prerequisites).toHaveBeenCalledTimes(1)
    expectNoOutsideEffects()
  })

  it("does not start Clerk or fixture IO while preflight is pending", async () => {
    const { createBots } = await import("@/tests/e2e/setup/bot-factory")
    let resolvePrerequisites!: (value: typeof safeEnvironment) => void
    boundary.prerequisites.mockReturnValue(
      new Promise<typeof safeEnvironment>((resolve) => {
        resolvePrerequisites = resolve
      })
    )
    const creation = createBots(1)
    const result = creation.catch((error: unknown) => error)
    await Promise.resolve()

    expect(boundary.prerequisites).toHaveBeenCalledTimes(1)
    expectNoOutsideEffects()
    resolvePrerequisites(safeEnvironment)
    expect(await result).toBe(boundary.ioStarted)
    expect(boundary.fetch).toHaveBeenCalledTimes(1)
    expect(boundary.writeFileSync).not.toHaveBeenCalled()
  })
})

describe("Clerk maintenance does not require a running local database", () => {
  it("can mint a development sign-in token after environment validation alone", async () => {
    const { mintSignInToken } = await import("@/tests/e2e/setup/bot-factory")
    boundary.prerequisites.mockRejectedValue(boundary.unavailable)
    boundary.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ token: "synthetic-ticket" }),
    })

    await expect(mintSignInToken(bot.clerkUserId)).resolves.toBe("synthetic-ticket")
    expect(boundary.loadEnvironment).toHaveBeenCalled()
    expect(boundary.prerequisites).not.toHaveBeenCalled()
    expect(boundary.fetch).toHaveBeenCalledWith(
      "https://api.clerk.com/v1/sign_in_tokens",
      expect.objectContaining({ method: "POST" })
    )
    expect(boundary.createClient).not.toHaveBeenCalled()
    expect(boundary.execFileSync).not.toHaveBeenCalled()
  })

  it("can delete development bots after environment validation alone", async () => {
    const { cleanupBots } = await import("@/tests/e2e/setup/bot-factory")
    boundary.prerequisites.mockRejectedValue(boundary.unavailable)
    boundary.fetch.mockResolvedValue({ ok: true, status: 200, text: async () => "{}" })
    boundary.writeFileSync.mockImplementation(() => undefined)

    await cleanupBots()
    expect(boundary.loadEnvironment).toHaveBeenCalled()
    expect(boundary.prerequisites).not.toHaveBeenCalled()
    expect(boundary.fetch).toHaveBeenCalledWith(
      `https://api.clerk.com/v1/users/${bot.clerkUserId}`,
      expect.objectContaining({ method: "DELETE" })
    )
    expect(boundary.writeFileSync).toHaveBeenCalledWith(expect.any(String), "[]\n")
    expect(boundary.createClient).not.toHaveBeenCalled()
    expect(boundary.execFileSync).not.toHaveBeenCalled()
  })
})

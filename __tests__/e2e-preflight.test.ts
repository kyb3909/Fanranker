// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  readFileSync: vi.fn(),
  execFileSync: vi.fn(),
  fetch: vi.fn(),
}))

// Exercise the real environment parser and preflight. No real file, Docker,
// HTTP, Clerk, or database operation can run from this suite.
vi.mock("node:fs", () => ({ readFileSync: mocks.readFileSync }))
vi.mock("node:child_process", () => ({ execFileSync: mocks.execFileSync }))

import { assertE2EPrerequisites, runLocalE2ESql } from "@/tests/e2e/setup/preflight"

const LOCAL_DOCKER = "npipe:////./pipe/docker_engine"
const LOCAL_API = "http://127.0.0.1:54321"
const fixtureEnv = (overrides: Record<string, string | undefined> = {}) =>
  Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: LOCAL_API,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-public-fixture",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_local_fixture",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_local_fixture",
    CLERK_SECRET_KEY: "sk_test_local_fixture",
    ...overrides,
  })
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")

function mockDockerContext(endpoint = LOCAL_DOCKER) {
  mocks.execFileSync.mockImplementation((_file: string, args: string[]) =>
    args[0] === "context" ? `${endpoint}\n` : ""
  )
}

function dockerExecCalls() {
  return mocks.execFileSync.mock.calls.filter(([, args]) => (args as string[]).includes("exec"))
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv("DOCKER_CONTEXT", "")
  vi.stubEnv("DOCKER_HOST", "")
  mocks.readFileSync.mockReturnValue(fixtureEnv())
  mockDockerContext()
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => [] })
  vi.stubGlobal("fetch", mocks.fetch)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("E2E read-only prerequisites", () => {
  it("checks only the pinned local Docker schema and local REST endpoint", async () => {
    await assertE2EPrerequisites()

    expect(mocks.execFileSync).toHaveBeenCalledTimes(2)
    expect(mocks.execFileSync.mock.calls[0][1]).toEqual([
      "context",
      "inspect",
      "--format",
      "{{.Endpoints.docker.Host}}",
    ])
    const [[command, args, options]] = dockerExecCalls()
    expect(command).toBe("docker")
    expect(args.slice(0, 5)).toEqual([
      "--host",
      LOCAL_DOCKER,
      "exec",
      "supabase_db_community",
      "psql",
    ])
    expect(args).toEqual(expect.arrayContaining(["-X", "ON_ERROR_STOP=1", "-Atc"]))
    const sql = args[args.length - 1] as string
    expect(sql).toMatch(/^BEGIN READ ONLY;/)
    expect(sql).toMatch(/SELECT user_id, role, onboarding_completed FROM public\.profiles LIMIT 0/)
    expect(sql).toMatch(/ROLLBACK;$/)
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE)\b/i)
    expect(options.env).not.toHaveProperty("DOCKER_CONTEXT")
    expect(options.env).not.toHaveProperty("DOCKER_HOST")

    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    const [url, request] = mocks.fetch.mock.calls[0]
    expect(url).toBe(`${LOCAL_API}/rest/v1/profiles?select=user_id&limit=0`)
    expect(request.method ?? "GET").toBe("GET")
    expect(request.body).toBeUndefined()
    expect(request.headers).toEqual({ apikey: "sb_secret_local_fixture" })
    expect(request.redirect).toBe("error")
    expect(request.signal).toBeInstanceOf(AbortSignal)
    expect(mocks.execFileSync.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.fetch.mock.invocationCallOrder[0]
    )
  })

  it.each(["unix:///var/run/docker.sock", "tcp://127.0.0.1:2375", "tcp://[::1]:2375"])(
    "accepts the local Docker host %s without consulting an active remote context",
    async (endpoint) => {
      vi.stubEnv("DOCKER_HOST", endpoint)
      mockDockerContext("ssh://production.example")
      await assertE2EPrerequisites()
      expect(mocks.execFileSync).toHaveBeenCalledTimes(1)
      expect(dockerExecCalls()[0][1].slice(0, 2)).toEqual(["--host", endpoint])
    }
  )

  it("honors a local explicit context over an ambient remote DOCKER_HOST and pins it", async () => {
    vi.stubEnv("DOCKER_CONTEXT", "desktop-local-fixture")
    vi.stubEnv("DOCKER_HOST", "tcp://production.example:2375")
    await assertE2EPrerequisites()

    expect(mocks.execFileSync.mock.calls[0][1]).toEqual([
      "context",
      "inspect",
      "desktop-local-fixture",
      "--format",
      "{{.Endpoints.docker.Host}}",
    ])
    const [, args, options] = dockerExecCalls()[0]
    expect(args.slice(0, 2)).toEqual(["--host", LOCAL_DOCKER])
    expect(options.env).not.toHaveProperty("DOCKER_CONTEXT")
    expect(options.env).not.toHaveProperty("DOCKER_HOST")
  })

  it("rejects a remote explicit context even when DOCKER_HOST looks local", async () => {
    vi.stubEnv("DOCKER_CONTEXT", "remote-fixture")
    vi.stubEnv("DOCKER_HOST", "tcp://127.0.0.1:2375")
    mockDockerContext("ssh://production.example")
    await expect(assertE2EPrerequisites()).rejects.toThrow("원격 Docker")
    expect(dockerExecCalls()).toHaveLength(0)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it.each([
    "ssh://production.example",
    "tcp://production.example:2375",
    "tcp://127.0.0.1.production.example:2375",
    "tcp://user:password@localhost:2375",
    "npipe:////production/pipe/docker_engine",
  ])("rejects the unsafe Docker endpoint %s before SQL or HTTP", async (endpoint) => {
    vi.stubEnv("DOCKER_HOST", endpoint)
    await expect(assertE2EPrerequisites()).rejects.toThrow("원격 Docker")
    expect(mocks.execFileSync).not.toHaveBeenCalled()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it("rejects a missing dedicated environment before touching Docker or HTTP", async () => {
    mocks.readFileSync.mockImplementation(() => {
      throw new Error("ENOENT")
    })
    await expect(assertE2EPrerequisites()).rejects.toThrow(".env.e2e")
    expect(mocks.execFileSync).not.toHaveBeenCalled()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it.each<Record<string, string>>([
    { NEXT_PUBLIC_SUPABASE_URL: "https://production.supabase.co" },
    { CLERK_SECRET_KEY: "sk_live_fixture" },
    { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_fixture" },
  ])("rejects unsafe credentials before any external probe: %j", async (overrides) => {
    mocks.readFileSync.mockReturnValue(fixtureEnv(overrides))
    await expect(assertE2EPrerequisites()).rejects.toThrow("E2E 환경 오류")
    expect(mocks.execFileSync).not.toHaveBeenCalled()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it("stops before HTTP when Docker is unavailable", async () => {
    mocks.execFileSync.mockImplementation(() => {
      throw new Error("ENOENT docker")
    })
    await expect(assertE2EPrerequisites()).rejects.toThrow("Docker와 로컬 컨텍스트")
    expect(dockerExecCalls()).toHaveLength(0)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it("stops before HTTP if the container or required SQL schema is unavailable", async () => {
    mocks.execFileSync.mockImplementation((_command: string, args: string[]) => {
      if (args[0] === "context") return LOCAL_DOCKER
      throw new Error("psql connection/schema failure")
    })
    await expect(assertE2EPrerequisites()).rejects.toThrow("로컬 supabase_db_community")
    expect(dockerExecCalls()).toHaveLength(1)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it.each([302, 401, 403, 500])("rejects local REST HTTP %i", async (status) => {
    mocks.fetch.mockResolvedValue({ ok: false, status })
    await expect(assertE2EPrerequisites()).rejects.toThrow("로컬 Supabase API")
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(dockerExecCalls()).toHaveLength(1)
  })

  it.each([null, {}, "unexpected HTML"])("rejects a non-array REST payload %j", async (body) => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => body })
    await expect(assertE2EPrerequisites()).rejects.toThrow("로컬 Supabase API")
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })

  it.each(["offline", "redirect refused", "timeout"])(
    "fails closed when the HTTP transport reports %s",
    async (reason) => {
      mocks.fetch.mockRejectedValue(new TypeError(reason))
      await expect(assertE2EPrerequisites()).rejects.toThrow("로컬 Supabase API")
      expect(mocks.fetch).toHaveBeenCalledTimes(1)
      expect(mocks.fetch.mock.calls[0][1].redirect).toBe("error")
    }
  )
})

describe("seed SQL execution boundary", () => {
  it("revalidates the dedicated environment before every SQL operation", () => {
    expect(runLocalE2ESql("SELECT 1;")).toBe("")
    mocks.readFileSync.mockReturnValue(fixtureEnv({ CLERK_SECRET_KEY: "sk_live_fixture" }))
    expect(() => runLocalE2ESql("UPDATE public.profiles SET role='admin';")).toThrow("sk_test_")
    expect(dockerExecCalls()).toHaveLength(1)
    expect(dockerExecCalls()[0][1].at(-1)).toBe("SELECT 1;")
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it("rechecks Docker context before a later SQL operation instead of reusing a stale approval", () => {
    runLocalE2ESql("SELECT 1;")
    mockDockerContext("ssh://production.example")
    expect(() => runLocalE2ESql("DELETE FROM public.profiles;")).toThrow("원격 Docker")
    expect(dockerExecCalls()).toHaveLength(1)
    expect(dockerExecCalls()[0][1].at(-1)).toBe("SELECT 1;")
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})

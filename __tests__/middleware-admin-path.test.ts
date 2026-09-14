// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

const mocks = vi.hoisted(() => ({ single: vi.fn(), rateLimit: vi.fn() }))

// Exercise the real middleware/guards and NextResponse header forwarding;
// only authentication and external IO are replaced.
vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (handler: unknown) => handler,
  createRouteMatcher: () => (req: NextRequest) => req.nextUrl.pathname.startsWith("/admin"),
}))
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: mocks.single }) }) }),
  }),
}))
vi.mock("@/lib/middleware/rate-limit-guard", () => ({ rateLimitGuard: mocks.rateLimit }))

import middleware from "@/middleware"
import { canOpenAdminPath } from "@/lib/admin/route-access"

async function run(
  path: string,
  headers: Record<string, string> = {},
  userId: string | null = "editor"
) {
  const req = new NextRequest(`https://audit.invalid${path}`, { headers })
  const response = await (
    middleware as unknown as (
      auth: () => Promise<{ userId: string | null }>,
      req: NextRequest
    ) => Promise<NextResponse>
  )(async () => ({ userId }), req)
  // Without a request override, Next forwards the incoming header unchanged.
  const overrides = response.headers
    .get("x-middleware-override-headers")
    ?.split(",")
    .map((s) => s.trim())
  const pathname = overrides?.includes("x-pathname")
    ? response.headers.get("x-middleware-request-x-pathname")
    : req.headers.get("x-pathname")
  return { response, pathname }
}

beforeEach(() => {
  mocks.single.mockReset().mockResolvedValue({ data: { onboarding_completed: true }, error: null })
  mocks.rateLimit.mockReset().mockReturnValue(null)
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://audit.invalid")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-key")
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("admin pathname and onboarding response integration", () => {
  it.each(["/admin", "/admin/news-review", "/admin/agg-review"])(
    "allows an editor's first %s visit while setting the onboarding cookie",
    async (path) => {
      const { response, pathname } = await run(path)
      expect(pathname).toBe(path)
      expect(canOpenAdminPath("editor", pathname)).toBe(true)
      expect(response.cookies.get("onboarding_done")).toMatchObject({
        value: "1",
        maxAge: 86400,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      })
    }
  )

  it.each([undefined, "onboarding_done=1"])(
    "rejects a forged admin path with cookie=%s",
    async (cookie) => {
      const { pathname } = await run("/admin/system", {
        "x-pathname": "/admin",
        ...(cookie ? { cookie } : {}),
      })
      expect(pathname).toBe("/admin/system")
      expect(canOpenAdminPath("editor", pathname)).toBe(false)
    }
  )

  it("preserves RSC/session headers and secure cookie attributes together", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const { response, pathname } = await run("/admin?view=all", {
      "x-pathname": "/admin/system",
      cookie: "session_fixture=1",
      rsc: "1",
      "next-router-state-tree": "fixture",
      authorization: "Bearer test-fixture",
    })
    expect(pathname).toBe("/admin")
    for (const [key, value] of Object.entries({
      cookie: "session_fixture=1",
      rsc: "1",
      "next-router-state-tree": "fixture",
      authorization: "Bearer test-fixture",
    })) {
      expect(response.headers.get(`x-middleware-request-${key}`)).toBe(value)
    }
    expect(response.cookies.get("onboarding_done")?.secure).toBe(true)
  })

  it.each(["/", "/api/posts", "/sign-up"])("stamps the actual path on public %s", async (path) => {
    const { pathname } = await run(path, { "x-pathname": "/admin" }, null)
    expect(pathname).toBe(path)
    expect(mocks.single).not.toHaveBeenCalled()
  })

  it("preserves anonymous admin login redirect including its return query", async () => {
    const { response } = await run("/admin/news-review?tab=queue", {}, null)
    const location = new URL(response.headers.get("location")!)
    expect(location.pathname).toBe("/sign-up")
    expect(location.searchParams.get("redirect_url")).toBe("/admin/news-review?tab=queue")
    expect(mocks.single).not.toHaveBeenCalled()
  })

  it.each([
    { data: { onboarding_completed: false }, error: null },
    { data: null, error: { code: "PGRST116" } },
  ])("still redirects incomplete/new accounts before serving admin", async (profile) => {
    mocks.single.mockResolvedValue(profile)
    const { response } = await run("/admin")
    expect(new URL(response.headers.get("location")!).pathname).toBe("/sign-up")
    expect(response.cookies.get("onboarding_done")).toBeUndefined()
  })

  it("self-heals an old incomplete cookie without losing the trusted path", async () => {
    const { response, pathname } = await run("/admin", { cookie: "onboarding_status=incomplete" })
    expect(pathname).toBe("/admin")
    expect(response.cookies.get("onboarding_done")?.value).toBe("1")
  })

  it("preserves rate-limit short circuit", async () => {
    const limited = NextResponse.json({ error: "limited" }, { status: 429 })
    mocks.rateLimit.mockReturnValue(limited)
    expect((await run("/api/posts")).response).toBe(limited)
    expect(mocks.single).not.toHaveBeenCalled()
  })

  it("also replaces a forged header on a public fail-open response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.rateLimit.mockImplementation(() => {
      throw new Error("guard unavailable")
    })
    const { response, pathname } = await run("/community/football", { "x-pathname": "/admin" })
    expect(response.status).toBe(200)
    expect(pathname).toBe("/community/football")
  })
})

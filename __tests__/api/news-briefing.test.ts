import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const { rows, queried, filters } = vi.hoisted(() => ({
  rows: {
    news_reservoir: [] as unknown[],
    betman_games: [] as unknown[],
    team_dictionary: [] as unknown[],
  },
  queried: [] as string[],
  filters: [] as unknown[][],
}))
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: (table: keyof typeof rows) => {
      queried.push(table)
      const chain: Record<string, unknown> = {}
      for (const method of ["select", "eq", "in", "gte", "lte", "order", "limit"]) {
        chain[method] = (...args: unknown[]) => {
          filters.push([method, ...args])
          return chain
        }
      }
      chain.then = (done: (result: unknown) => void) => done({ data: rows[table], error: null })
      return chain
    },
  }),
}))
beforeEach(() => {
  process.env.CRON_SECRET = "news-test-secret"
  queried.length = 0
  filters.length = 0
  rows.news_reservoir = []
  rows.betman_games = []
  rows.team_dictionary = []
})
const request = (method: string, body?: unknown, auth = true) =>
  new NextRequest("https://example.test/api/news/briefing", {
    method,
    headers: auth ? { authorization: "Bearer news-test-secret" } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
describe("authenticated news briefing", () => {
  it("denies schedule and background reads before accessing the service client", async () => {
    const { GET, POST } = await import("@/app/api/news/briefing/route")
    expect((await GET(request("GET", undefined, false))).status).toBe(401)
    expect((await POST(request("POST", {}, false))).status).toBe(401)
    expect(queried).toEqual([])
  })
  it("deduplicates fixtures, provides aliases and prevents shared caching", async () => {
    rows.betman_games = Array.from({ length: 2 }, (_, i) => ({
      id: "id" + i,
      home_team_name: "첼시",
      away_team_name: "헐시티",
      match_time: new Date().toISOString(),
      league_code: "EPL",
    }))
    rows.team_dictionary = [
      { name_en: "Chelsea", name_kr: "첼시", short_kr: "첼시", aliases_kr: [] },
    ]
    const { GET } = await import("@/app/api/news/briefing/route")
    const result = await GET(request("GET"))
    expect(result.headers.get("Cache-Control")).toContain("no-store")
    const body = await result.json()
    expect(body.matches).toHaveLength(1)
    expect(body.matches[0].aliases).toContain("Chelsea")
    expect(filters).toContainEqual(["in", "game_type", ["일반", "S일반"]])
  })
  it("rejects oversized queries and only reads published source records", async () => {
    const { POST } = await import("@/app/api/news/briefing/route")
    expect((await POST(request("POST", { title: "x".repeat(2001) }))).status).toBe(400)
    expect(queried).toEqual([])
    const response = await POST(
      request("POST", {
        title: "Coach interview",
        material: "original material",
        source_url: "https://example.org/news/current",
      })
    )
    expect(response.status).toBe(200)
    expect(filters).toContainEqual(["eq", "status", "published"])
    expect(filters).toContainEqual(["limit", 240])
  })
})

import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * 관리자 수동 결과 입력 — 정산 후 결과 덮어쓰기 가드 배선 검증 (R1 / 단계 0-1, 2026-08-06)
 *
 * 판정 규칙 자체는 __tests__/lib/betman/result-guard.test.ts 가 잠근다.
 * 여기서는 라우트가 실제로 (1) settled 픽을 조회하고 (2) 차단 시 update 를 안 하는지 확인.
 */

const authMock = vi.fn()
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
  currentUser: () => authMock(),
}))

let supabaseMock: ReturnType<typeof makeSupabase>
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => supabaseMock.client,
}))

interface Opts {
  /** betman_games 현재 행들 */
  games?: { id: string; result: string | null; status: string }[]
  /** settled 픽이 있는 game_id 목록 */
  settledGameIds?: string[]
}

const GAME_A = "11111111-1111-4111-8111-111111111111"

function makeSupabase(o: Opts = {}) {
  const calls = {
    updates: [] as { id: string; data: Record<string, unknown> }[],
  }
  const games = o.games ?? [{ id: GAME_A, result: "home", status: "completed" }]
  const settled = (o.settledGameIds ?? []).map((game_id) => ({ game_id }))

  const client = {
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { role: "admin" }, error: null }),
            }),
          }),
        }
      }
      if (table === "betman_games") {
        return {
          select: () => ({
            in: async () => ({ data: games, error: null }),
          }),
          update: (data: Record<string, unknown>) => ({
            eq: (_col: string, id: string) => ({
              select: async () => {
                calls.updates.push({ id, data })
                return { data: [{ id }], error: null }
              },
            }),
          }),
        }
      }
      if (table === "betman_predictions") {
        return {
          select: () => ({
            in: () => ({
              eq: async () => ({ data: settled, error: null }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }

  return { client, calls }
}

const req = (body: unknown) =>
  ({
    json: async () => body,
    headers: new Headers(),
    url: "https://gongnori.fan/api/admin/matches/result",
  }) as never

const loadRoute = async () => (await import("@/app/api/admin/matches/result/route")).POST

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  authMock.mockResolvedValue({ userId: "admin-1", id: "admin-1" })
  supabaseMock = makeSupabase()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("POST /api/admin/matches/result — 정산 가드 배선", () => {
  it("정산 픽이 없는 경기 → 결과 변경 허용, update 실행", async () => {
    supabaseMock = makeSupabase({ settledGameIds: [] })
    const POST = await loadRoute()

    const res = await POST(
      req({ results: [{ game_id: GAME_A, home_score: 1, away_score: 2, result: "away" }] })
    )
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.updated).toBe(1)
    expect(supabaseMock.calls.updates).toHaveLength(1)
    expect(supabaseMock.calls.updates[0].data.result).toBe("away")
  })

  it("★ 정산 픽이 있는 경기의 결과 변경 → 409 차단, update 미실행", async () => {
    supabaseMock = makeSupabase({ settledGameIds: [GAME_A] })
    const POST = await loadRoute()

    const res = await POST(
      req({ results: [{ game_id: GAME_A, home_score: 1, away_score: 2, result: "away" }] })
    )
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(supabaseMock.calls.updates).toHaveLength(0)
    expect(String(json.errors?.[0] ?? json.error)).toContain("차단")
  })

  it("정산 픽이 있어도 동일 결과 재기록(스코어 표기 수정)은 허용", async () => {
    supabaseMock = makeSupabase({ settledGameIds: [GAME_A] })
    const POST = await loadRoute()

    const res = await POST(
      req({ results: [{ game_id: GAME_A, home_score: 3, away_score: 0, result: "home" }] })
    )
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.updated).toBe(1)
    expect(supabaseMock.calls.updates).toHaveLength(1)
  })

  it("정산 픽이 있는 경기의 취소 전환 → 차단", async () => {
    supabaseMock = makeSupabase({ settledGameIds: [GAME_A] })
    const POST = await loadRoute()

    const res = await POST(
      req({ results: [{ game_id: GAME_A, home_score: 1, away_score: 1, result: "cancelled" }] })
    )

    expect(res.status).toBe(409)
    expect(supabaseMock.calls.updates).toHaveLength(0)
  })

  it("존재하지 않는 경기 → 오해 없는 에러 문구", async () => {
    supabaseMock = makeSupabase({ games: [] })
    const POST = await loadRoute()

    const res = await POST(
      req({ results: [{ game_id: GAME_A, home_score: 1, away_score: 0, result: "home" }] })
    )
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(String(json.errors?.[0])).toContain("존재하지 않는 경기")
  })
})

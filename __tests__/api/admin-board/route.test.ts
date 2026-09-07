import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * 운영 할 일 보드 API (2026-09-08) — 입력 검증과 저장 배선.
 * 옮기기 계산 자체는 __tests__/lib/admin/board.test.ts 가 잠근다.
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

function makeSupabase(role: string | null = "admin") {
  const calls = {
    updates: [] as { id: string; data: Record<string, unknown> }[],
    inserts: [] as Record<string, unknown>[],
    deletes: [] as string[],
  }
  const client = {
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: role ? { role } : null, error: null }),
            }),
          }),
        }
      }
      if (table === "admin_board_cards") {
        return {
          select: () => ({
            order: () => ({
              then: (resolve: (v: unknown) => void) =>
                resolve({ data: [{ id: "c1", status: "todo", position: 0 }], error: null }),
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: { position: 4 }, error: null }),
                  }),
                }),
              }),
            }),
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: { position: 4 }, error: null }),
                }),
              }),
            }),
          }),
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                calls.inserts.push(row)
                return { data: { id: "new", ...row }, error: null }
              },
            }),
          }),
          update: (data: Record<string, unknown>) => ({
            eq: async (_col: string, id: string) => {
              calls.updates.push({ id, data })
              return { error: null }
            },
          }),
          delete: () => ({
            eq: async (_col: string, id: string) => {
              calls.deletes.push(id)
              return { error: null }
            },
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
    url: "https://gongnori.fan/api/admin/board",
  }) as never

const loadRoute = async () => import("@/app/api/admin/board/route")

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  authMock.mockResolvedValue({ userId: "admin-1", id: "admin-1" })
  supabaseMock = makeSupabase()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("/api/admin/board", () => {
  it("관리자가 아니면 403", async () => {
    supabaseMock = makeSupabase("user")
    const { GET } = await loadRoute()
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it("GET 은 카드 목록을 준다", async () => {
    const { GET } = await loadRoute()
    const res = await GET()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.cards).toHaveLength(1)
  })

  it("POST 는 제목이 없으면 400, 있으면 그 열 맨 끝 position 으로 넣는다", async () => {
    const { POST } = await loadRoute()
    expect((await POST(req({ title: "   " }))).status).toBe(400)
    expect((await POST(req({ title: "x", status: "archived" }))).status).toBe(400)

    const res = await POST(req({ title: "  새 일  ", detail: "설명", tag: "", effort: "1일" }))
    expect(res.status).toBe(201)
    expect(supabaseMock.calls.inserts[0]).toMatchObject({
      title: "새 일",
      detail: "설명",
      tag: null,
      effort: "1일",
      status: "todo",
      position: 5,
    })
  })

  it("PATCH moves 는 열 이름·자리를 검증하고 카드마다 update 한다", async () => {
    const { PATCH } = await loadRoute()
    const bad = await PATCH(req({ moves: [{ id: "c1", status: "todo", position: -1 }] }))
    expect(bad.status).toBe(400)
    expect(supabaseMock.calls.updates).toHaveLength(0)

    const res = await PATCH(
      req({
        moves: [
          { id: "c1", status: "doing", position: 0 },
          { id: "c2", status: "todo", position: 0 },
        ],
      })
    )
    expect(res.status).toBe(200)
    expect(supabaseMock.calls.updates.map((u) => [u.id, u.data.status, u.data.position])).toEqual([
      ["c1", "doing", 0],
      ["c2", "todo", 0],
    ])
  })

  it("PATCH 내용 수정은 빈 제목을 거부하고 tag 를 비우면 null 로 저장한다", async () => {
    const { PATCH } = await loadRoute()
    expect((await PATCH(req({ id: "c1", title: "" }))).status).toBe(400)
    const res = await PATCH(req({ id: "c1", title: "제목", tag: "", effort: "2일" }))
    expect(res.status).toBe(200)
    expect(supabaseMock.calls.updates[0].data).toMatchObject({
      title: "제목",
      tag: null,
      effort: "2일",
    })
  })

  it("DELETE 는 id 로 지운다", async () => {
    const { DELETE } = await loadRoute()
    expect((await DELETE(req({}))).status).toBe(400)
    const res = await DELETE(req({ id: "c1" }))
    expect(res.status).toBe(200)
    expect(supabaseMock.calls.deletes).toEqual(["c1"])
  })
})

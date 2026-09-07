import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ sweep: vi.fn(), auth: vi.fn() }))
vi.mock("@/lib/cron-auth", () => ({ verifyCronSecret: mocks.auth }))
vi.mock("@/lib/cron/log-run", () => ({ withCronLog: (_name: string, handler: unknown) => handler }))
vi.mock("@/lib/api-error", () => ({ apiError: () => new Response(null, { status: 500 }) }))
vi.mock("@/lib/match/thread", () => ({ sweepMatchThreads: mocks.sweep }))
import { GET } from "@/app/api/cron/match-threads/route"

const request = (q = "") => new NextRequest(`http://localhost/api/cron/match-threads${q}`)
const base = {
  scanned: 3,
  inWindow: 2,
  created: [] as unknown[],
  skipped: [] as { gameId: string; reason: string }[],
}

describe("match-threads cron — 경기별 장애를 200 뒤에 숨기지 않는다", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockReturnValue(null)
  })

  it("인증 실패면 스윕하지 않는다", async () => {
    mocks.auth.mockReturnValue(new Response(null, { status: 401 }))
    expect((await GET(request())).status).toBe(401)
    expect(mocks.sweep).not.toHaveBeenCalled()
  })

  it("정상 사유(기존 글·라인업 대기·유니크 경합)만 있으면 200", async () => {
    mocks.sweep.mockResolvedValue({
      ...base,
      skipped: [
        { gameId: "a", reason: "exists" },
        { gameId: "b", reason: "lineup-not-ready" },
        { gameId: "c", reason: "insert: 23505" },
      ],
    })
    const res = await GET(request())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ mode: "match-threads", success: true, failures: [] })
  })

  it("조회 실패·삽입 오류가 하나라도 있으면 503 이고 failures 에 그 경기가 실린다", async () => {
    mocks.sweep.mockResolvedValue({
      ...base,
      created: [{ gameId: "ok", postId: "p", title: "t" }],
      skipped: [
        { gameId: "a", reason: "exists" },
        { gameId: "b", reason: "post-lookup-failed" },
        { gameId: "c", reason: "insert: 42P01" },
      ],
    })
    const res = await GET(request())
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.failures).toEqual([
      { gameId: "b", reason: "post-lookup-failed" },
      { gameId: "c", reason: "insert: 42P01" },
    ])
    // 성공한 경기 결과는 그대로 실린다 — 503 이 일을 되돌리지 않는다
    expect(body.created).toHaveLength(1)
  })

  it("?gameId= 는 그 경기만 강제한다", async () => {
    mocks.sweep.mockResolvedValue(base)
    await GET(request("?gameId=abc"))
    expect(mocks.sweep).toHaveBeenCalledWith({ forceGameId: "abc" })
  })
})

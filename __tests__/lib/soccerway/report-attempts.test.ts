import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ insert: vi.fn(), query: vi.fn(), inIds: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: () => {
      // 체인 어디서 await 하든 mocks.query() 가 답한다 — 조회 함수마다 체인 길이가 다르다
      const q: any = {
        insert: mocks.insert,
        select: () => q,
        in: (col: string, ids: string[]) => {
          if (col === "game_id") mocks.inIds(ids)
          return q
        },
        gte: () => q,
        order: () => q,
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve()
            .then(() => mocks.query())
            .then(resolve, reject),
      }
      return q
    },
  }),
}))
import {
  hasRecentReportAttempt,
  listRecentReportAttempts,
  recordReportAttempt,
} from "@/lib/soccerway/report-attempts"

describe("리포트 실패 원장", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  it("insert 완료까지 기다리고 사유를 한 줄로 제한한다", async () => {
    let finish!: (value: { error: null }) => void
    mocks.insert.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    let done = false
    const pending = recordReportAttempt("g", "e", "article", "원문\n 없음").then(() => {
      done = true
    })
    await vi.waitFor(() => expect(mocks.insert).toHaveBeenCalled())
    expect(done).toBe(false)
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "원문 없음", stage: "article" })
    )
    finish({ error: null })
    await pending
    expect(done).toBe(true)
  })
  it("조회 에러를 기록 부재로 오해하지 않는다", async () => {
    mocks.query.mockResolvedValue({ count: null, error: { code: "503" } })
    expect(await hasRecentReportAttempt("g", 600_000)).toBe(true)
  })
  it("정상 조회의 0건과 1건을 구분한다", async () => {
    mocks.query
      .mockResolvedValueOnce({ count: 0, error: null })
      .mockResolvedValueOnce({ count: 1, error: null })
    expect(await hasRecentReportAttempt("g", 600_000)).toBe(false)
    expect(await hasRecentReportAttempt("g", 600_000)).toBe(true)
  })
  it("형제 행 id 전부로 조회한다 — 다른 마켓 행으로 들어온 방문도 같은 경기의 시도를 본다", async () => {
    mocks.query.mockResolvedValue({ count: 1, error: null })
    expect(await hasRecentReportAttempt(["a", "b"], 600_000)).toBe(true)
    expect(mocks.inIds).toHaveBeenCalledWith(["a", "b"])
    expect(await hasRecentReportAttempt([], 600_000)).toBe(true) // 빈 목록은 "모른다" = 시도 안 함
  })
  it("최근 원장 행은 단계·시각만 돌려주고, 조회 실패는 null 이다", async () => {
    mocks.query.mockResolvedValueOnce({
      data: [{ stage: "verify", attempted_at: "2026-09-07T01:00:00Z", reason: "x" }],
      error: null,
    })
    expect(await listRecentReportAttempts(["a"], ["verify", "held"], 3600_000)).toEqual([
      { stage: "verify", attempted_at: "2026-09-07T01:00:00Z" },
    ])
    mocks.query.mockResolvedValueOnce({ data: null, error: { code: "503" } })
    expect(await listRecentReportAttempts(["a"], ["verify"], 3600_000)).toBeNull()
    expect(await listRecentReportAttempts([], ["verify"], 3600_000)).toEqual([])
  })
})

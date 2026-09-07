import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ insert: vi.fn(), query: vi.fn(), inIds: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      insert: mocks.insert,
      select: () => ({
        in: (_col: string, ids: string[]) => {
          mocks.inIds(ids)
          return { gte: mocks.query }
        },
      }),
    }),
  }),
}))
import { hasRecentReportAttempt, recordReportAttempt } from "@/lib/soccerway/report-attempts"

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
})

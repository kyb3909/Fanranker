import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ insert: vi.fn(), auth: vi.fn() }))
vi.mock("@/lib/cron-auth", () => ({ verifyCronSecret: mocks.auth }))
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({ from: () => ({ insert: mocks.insert }) }),
}))
import { withCronLog } from "@/lib/cron/log-run"

const req = new Request("http://localhost/api/cron/x")

describe("withCronLog — 실행 기록에 실패 원인이 남는다", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockReturnValue(null)
    mocks.insert.mockResolvedValue({ error: null })
  })

  it("4xx/5xx 는 본문 앞 300자를 error_message 에 붙인다 — 상태 코드만으로는 원인을 모른다", async () => {
    const body = { success: false, errors: [{ gameId: "g1", message: "lfa-fixture-list:42P01" }] }
    const wrapped = withCronLog("motm-sync", async () => Response.json(body, { status: 503 }))
    const res = await wrapped(req)
    expect(res.status).toBe(503)
    // 호출자가 본문을 다시 읽을 수 있어야 한다 — clone 으로 읽었는지
    expect(await res.json()).toEqual(body)
    const row = mocks.insert.mock.calls[0][0]
    expect(row.status).toBe("error")
    expect(row.http_status).toBe(503)
    expect(row.error_message).toMatch(/^HTTP 503: \{"success":false/)
    expect(row.error_message).toContain("42P01")
    expect(row.error_message.length).toBeLessThanOrEqual("HTTP 503: ".length + 300)
  })

  it("긴 본문은 300자에서 자른다", async () => {
    const wrapped = withCronLog("x", async () => new Response("y".repeat(2000), { status: 500 }))
    await wrapped(req)
    expect(mocks.insert.mock.calls[0][0].error_message).toBe(`HTTP 500: ${"y".repeat(300)}`)
  })

  it("200 은 error_message 가 비고 success 로 남는다", async () => {
    const wrapped = withCronLog("x", async () => Response.json({ ok: true }))
    await wrapped(req)
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({
      job_name: "x",
      status: "success",
      http_status: 200,
      error_message: null,
    })
  })

  it("예외는 메시지를 남기고 다시 던진다", async () => {
    const wrapped = withCronLog("x", async () => {
      throw new Error("boom")
    })
    await expect(wrapped(req)).rejects.toThrow("boom")
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ status: "error", error_message: "boom" })
  })

  it("크론 비밀이 없는 호출은 기록하지 않는다 (브라우저 폴링이 로그를 오염시키지 않게)", async () => {
    mocks.auth.mockReturnValue(new Response(null, { status: 401 }))
    const wrapped = withCronLog("x", async () => new Response(null, { status: 401 }))
    await wrapped(req)
    expect(mocks.insert).not.toHaveBeenCalled()
  })
})

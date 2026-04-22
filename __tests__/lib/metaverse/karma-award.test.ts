import { describe, it, expect, vi } from "vitest"
import { awardFlairKarma } from "@/lib/metaverse/karma-award"

function mockSupabase(rpcResult: { data?: unknown; error?: { message: string } | null }) {
  return {
    rpc: vi.fn().mockResolvedValue({
      data: rpcResult.data ?? null,
      error: rpcResult.error ?? null,
    }),
  }
}

describe("metaverse/karma-award", () => {
  it("post source → delta=10 RPC 호출", async () => {
    const sb = mockSupabase({ data: { success: true, delta: 10 } })
    // @ts-expect-error — mock shape
    await awardFlairKarma(sb, "user_abc", "epl_arsenal", "post")
    expect(sb.rpc).toHaveBeenCalledWith("metaverse_award_flair_karma", {
      p_user_id: "user_abc",
      p_team_id: "epl_arsenal",
      p_delta: 10,
      p_source: "post",
    })
  })

  it("comment source → delta=1", async () => {
    const sb = mockSupabase({ data: { success: true, delta: 1 } })
    // @ts-expect-error — mock shape
    await awardFlairKarma(sb, "u", "t", "comment")
    expect(sb.rpc.mock.calls[0][1].p_delta).toBe(1)
  })

  it("prediction_hit source → delta=20", async () => {
    const sb = mockSupabase({ data: { success: true, delta: 20 } })
    // @ts-expect-error — mock shape
    await awardFlairKarma(sb, "u", "t", "prediction_hit")
    expect(sb.rpc.mock.calls[0][1].p_delta).toBe(20)
  })

  it("RPC 에러 발생해도 throw 하지 않음 (fire-and-forget)", async () => {
    const sb = mockSupabase({ error: { message: "db exploded" } })
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {})
    // @ts-expect-error — mock shape
    await expect(awardFlairKarma(sb, "u", "t", "post")).resolves.toBeUndefined()
    expect(consoleErr).toHaveBeenCalledWith(
      "[metaverse] award_flair_karma failed",
      expect.objectContaining({ message: "db exploded" })
    )
    consoleErr.mockRestore()
  })

  it("capped 응답 시 info 로그만 남김 (성공 처리)", async () => {
    const sb = mockSupabase({
      data: { success: true, capped: true, delta: 0, today_total: 100 },
    })
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {})
    // @ts-expect-error — mock shape
    await awardFlairKarma(sb, "u", "t", "post")
    expect(consoleInfo).toHaveBeenCalledWith(
      "[metaverse] flair karma capped",
      expect.objectContaining({ awarded: 0, todayTotal: 100 })
    )
    consoleInfo.mockRestore()
  })

  it("알 수 없는 source 는 RPC 호출 안 함 (방어)", async () => {
    const sb = mockSupabase({})
    // @ts-expect-error — unknown source on purpose
    await awardFlairKarma(sb, "u", "t", "invalid_source")
    expect(sb.rpc).not.toHaveBeenCalled()
  })
})

import { describe, expect, it, vi } from "vitest"
import { newsCandidateRunId, recordNewsCandidateEvents } from "@/lib/news/candidate-ledger"

describe("news candidate ledger", () => {
  it("빈 전이는 DB를 호출하지 않는다", async () => {
    const rpc = vi.fn()

    await expect(recordNewsCandidateEvents({ rpc } as never, [])).resolves.toBe(true)
    expect(rpc).not.toHaveBeenCalled()
  })

  it("여러 전이를 한 RPC로 기록한다", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    const events = [
      { candidate_id: "hermes-1", to_state: "drafted" as const, actor: "agent-draft" },
      {
        candidate_id: "hermes-1",
        to_state: "fact_checking" as const,
        actor: "auto-publish",
      },
    ]

    await expect(recordNewsCandidateEvents({ rpc } as never, events)).resolves.toBe(true)
    expect(rpc).toHaveBeenCalledOnce()
    expect(rpc).toHaveBeenCalledWith("record_news_candidate_events", { p_events: events })
  })

  it("원장 DB 오류는 생산 경로를 throw하지 않고 false로 노출한다", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: "relation missing" } })
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

    await expect(
      recordNewsCandidateEvents({ rpc } as never, [
        { candidate_id: "hermes-2", to_state: "retry_wait", actor: "test" },
      ])
    ).resolves.toBe(false)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it("실행 ID에 actor와 매번 다른 UUID를 포함한다", () => {
    const first = newsCandidateRunId("interest-filter")
    const second = newsCandidateRunId("interest-filter")

    expect(first).toMatch(/^interest-filter:/)
    expect(second).not.toBe(first)
  })
})

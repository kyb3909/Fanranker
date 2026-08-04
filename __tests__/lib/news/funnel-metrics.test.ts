import { describe, expect, it } from "vitest"
import { summarizeNewsroomFunnel } from "@/lib/news/funnel-metrics"

describe("summarizeNewsroomFunnel", () => {
  it("상태·행위자·이유와 발행률을 집계한다", () => {
    const result = summarizeNewsroomFunnel(
      [
        { candidate_id: "a", state: "published", first_seen_at: "2026-08-05T00:00:00Z" },
        { candidate_id: "b", state: "needs_human", first_seen_at: "2026-08-05T01:00:00Z" },
      ],
      [
        {
          candidate_id: "a",
          to_state: "published",
          actor: "news-desk",
          reason_code: "post_published",
          created_at: "2026-08-05T00:10:00Z",
        },
        {
          candidate_id: "b",
          to_state: "needs_human",
          actor: "quality-gate",
          reason_code: "unknown_player",
          created_at: "2026-08-05T01:03:00Z",
        },
      ]
    )

    expect(result).toMatchObject({
      candidates: 2,
      terminal: 1,
      unresolved: 1,
      published: 1,
      needsHuman: 1,
      publishRate: 50,
      medianPublishLeadMinutes: 10,
      states: { published: 1, needs_human: 1 },
      actors: { "news-desk": 1, "quality-gate": 1 },
    })
  })

  it("발행 후보가 없으면 0과 null을 반환한다", () => {
    const result = summarizeNewsroomFunnel([], [])

    expect(result.publishRate).toBe(0)
    expect(result.medianPublishLeadMinutes).toBeNull()
    expect(result.unresolved).toBe(0)
  })

  it("같은 후보의 최초 published 이벤트로 lead time을 계산한다", () => {
    const result = summarizeNewsroomFunnel(
      [{ candidate_id: "a", state: "published", first_seen_at: "2026-08-05T00:00:00Z" }],
      [
        {
          candidate_id: "a",
          to_state: "published",
          actor: "retry",
          reason_code: null,
          created_at: "2026-08-05T00:20:00Z",
        },
        {
          candidate_id: "a",
          to_state: "published",
          actor: "first",
          reason_code: null,
          created_at: "2026-08-05T00:05:00Z",
        },
      ]
    )

    expect(result.medianPublishLeadMinutes).toBe(5)
  })
})

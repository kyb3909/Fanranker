import { afterEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { effectivePublishing, evaluationSummary, type TrainingJob } from "@/lib/news/training/types"
import { loadPublishingSettings } from "@/lib/news/training/settings"

afterEach(() => vi.unstubAllEnvs())
describe("training publication controls", () => {
  it.each([
    [null, undefined, false],
    [null, "off", false],
    [null, "on", true],
    [false, "on", false],
    [true, undefined, true],
    [true, "off", true],
  ] as const)(
    "admin setting %s resolves environment %s to %s",
    (publish_enabled, environment, expected) => {
      expect(effectivePublishing({ publish_enabled }, environment)).toBe(expected)
    }
  )

  it("exposes the effective value and fails closed on missing or failed settings reads", async () => {
    vi.stubEnv("NEWS_AUTO_PUBLISH", "on")
    const single = vi.fn().mockResolvedValue({
      data: { publish_enabled: false, per_run_cap: 3, daily_job_limit: 24, version: 2 },
      error: null,
    })
    const db = {
      from: () => ({ select: () => ({ eq: () => ({ single }) }) }),
    } as unknown as SupabaseClient
    expect(await loadPublishingSettings(db)).toMatchObject({
      effective_enabled: false,
      per_run_cap: 3,
      version: 2,
    })
    single.mockResolvedValue({ data: null, error: null })
    await expect(loadPublishingSettings(db)).rejects.toThrow("발행을 보류")
    single.mockResolvedValue({ data: { publish_enabled: true }, error: { message: "read failed" } })
    await expect(loadPublishingSettings(db)).rejects.toThrow("발행을 보류")
  })
})

describe("paired human evaluation statistics", () => {
  it("uses the same reviewed completed pairs as the denominator and separates wins from clean drafts", () => {
    const job = (patch: Partial<TrainingJob>): TrainingJob => ({
      id: "id",
      kind: "news_evaluation",
      status: "completed",
      payload: {},
      result: {},
      error: null,
      created_at: "2026-09-15",
      review: { baseline_errors: [], learned_errors: [], preference: "tie", note: "" },
      review_version: 1,
      ...patch,
    })
    const jobs = [
      job({
        review: {
          baseline_errors: ["certainty"],
          learned_errors: [],
          preference: "learned",
          note: "개선",
        },
      }),
      job({
        review: {
          baseline_errors: [],
          learned_errors: ["fact"],
          preference: "baseline",
          note: "악화",
        },
      }),
      job({}),
      job({ review: null }),
      job({ status: "failed" }),
      job({ status: "running" }),
      job({ kind: "agg_generation" }),
    ]
    expect(evaluationSummary(jobs)).toEqual({
      count: 3,
      baselineClean: 2,
      learnedClean: 2,
      improved: 1,
    })
    expect(evaluationSummary([])).toEqual({
      count: 0,
      baselineClean: 0,
      learnedClean: 0,
      improved: 0,
    })
  })
})

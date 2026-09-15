import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { DeskResearch, DeskSource } from "@/lib/news/desk/types"

const mocks = vi.hoisted(() => ({
  lessons: vi.fn(),
  rules: vi.fn(),
  notation: vi.fn(),
  write: vi.fn(),
  inspect: vi.fn(),
  agg: vi.fn(),
  research: vi.fn(),
}))
vi.mock("@/lib/news/desk/service", () => ({
  loadDeskLessons: mocks.lessons,
  writeDeskArticle: mocks.write,
  ask: mocks.research,
  RESEARCH_PROMPT: "source-grounded research prompt",
}))
vi.mock("@/lib/news/training/settings", () => ({ loadEditorialRules: mocks.rules }))
vi.mock("@/lib/news/notation", () => ({ loadNotation: mocks.notation }))
vi.mock("@/lib/news/quality-gate", () => ({ inspectDraft: mocks.inspect }))
vi.mock("@/lib/agg/training", () => ({ generateAggPractice: mocks.agg }))

const id = "11111111-1111-4111-8111-111111111111"
const source: DeskSource = {
  id: "source",
  source_name: "BBC",
  source_url: "https://bbc.com/sport/football/story",
  title: "Clubs are in talks",
  published_at: "2026-09-15T06:00:00.000Z",
  updated_at: null,
  author: null,
  source_tier: 2,
  primary_or_secondary: "secondary",
  original_reporting: true,
  origin_group: null,
  role: "current",
  captured_at: "2026-09-15T06:10:00.000Z",
  text: "The clubs are negotiating a transfer. No agreement has been reached and the player remains with his current club.",
}
const research: DeskResearch = {
  rejected: false,
  rejection_reason: null,
  news_type: "RUMOR",
  angle: "협상 단계",
  facts: [
    {
      id: "f1",
      text: "두 구단이 협상 중이다.",
      kind: "REPORTED",
      evidence: [{ source_id: source.id, quote: "The clubs are negotiating a transfer." }],
    },
  ],
  conflicts: [],
  verification_gaps: [],
}
const payload = { item_id: id, sources: [source], research }

function database(job: unknown) {
  const write = {
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data: { id }, error: null as unknown })),
  }
  for (const fn of [write.update, write.eq, write.select]) fn.mockReturnValue(write)
  const rpc = vi.fn(
    async (name: string, _args: unknown): Promise<{ data: unknown; error: unknown }> =>
      name === "claim_admin_training"
        ? { data: job ? [job] : [], error: null }
        : { data: true, error: null }
  )
  const from = vi.fn((table: string) => {
    if (table !== "admin_training_jobs") throw Error(`unexpected public write: ${table}`)
    return write
  })
  return { db: { rpc, from } as unknown as SupabaseClient, rpc, from, write }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.lessons.mockResolvedValue([{ id: "lesson", instruction: "협상과 확정을 구분한다." }])
  mocks.rules.mockResolvedValue([{ id: "rule", title: "확신 수준" }])
  mocks.notation.mockResolvedValue({ hints: [] })
  mocks.research.mockResolvedValue(structuredClone(research))
  mocks.write.mockImplementation(async (_input, label) => ({
    title: label,
    article: "두 구단이 이적 협상을 진행하고 있다. 합의는 아직 이루어지지 않았다.",
  }))
  mocks.inspect.mockResolvedValue({ pass: true, reasons: [] })
  mocks.agg.mockResolvedValue({
    entry: { ai_title: "비공개 연습", ai_body: "연습 본문" },
    result: { title: "비공개 연습", applied_ids: ["correction"] },
  })
})

describe("private training job execution", () => {
  it("does no paid work when another worker owns the job", async () => {
    const { db, rpc, from } = database(null)
    const { runTrainingJob } = await import("@/lib/news/training/jobs")
    expect(await runTrainingJob(db, id)).toEqual({ skipped: true })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(mocks.write).not.toHaveBeenCalled()
    expect(mocks.agg).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
  })

  it("compares matching evidence with and without rules/lessons and retains both judgments privately", async () => {
    const { db, rpc, from } = database({ id, kind: "news_evaluation", payload })
    const { runTrainingJob } = await import("@/lib/news/training/jobs")
    expect(await runTrainingJob(db, id)).toEqual({ id, completed: true })
    const baseline = mocks.write.mock.calls.find(
      ([, label]) => label === "news-evaluation-baseline"
    )![0]
    const learned = mocks.write.mock.calls.find(
      ([, label]) => label === "news-evaluation-learned"
    )![0]
    expect(baseline).toMatchObject({ sources: [source], research, rules: [], lessons: [] })
    expect(learned).toMatchObject({
      sources: baseline.sources,
      research: baseline.research,
      naming: baseline.naming,
      rules: [{ id: "rule" }],
      lessons: [{ id: "lesson" }],
    })
    expect(mocks.inspect).toHaveBeenCalledTimes(2)
    expect(mocks.research).not.toHaveBeenCalled()
    for (const call of mocks.inspect.mock.calls)
      expect(call.slice(2)).toEqual([
        source.text,
        expect.objectContaining({ source_url: source.source_url, original_title: source.title }),
      ])
    const claim = rpc.mock.calls.find(([name]) => name === "claim_admin_training")![1] as {
      p_token: string
    }
    expect(rpc).toHaveBeenCalledWith(
      "complete_admin_training",
      expect.objectContaining({
        p_id: id,
        p_token: claim.p_token,
        p_entry: null,
        p_result: expect.objectContaining({
          baseline: { title: "news-evaluation-baseline", article: expect.any(String) },
          learned: { title: "news-evaluation-learned", article: expect.any(String) },
          baseline_quality: { pass: true, reasons: [] },
          learned_quality: { pass: true, reasons: [] },
          rules: [{ id: "rule", title: "확신 수준" }],
          lessons: [{ id: "lesson", instruction: "협상과 확정을 구분한다." }],
        }),
      })
    )
    expect(from).not.toHaveBeenCalled()
  })

  it("rejects source-unsupported research before calling either writer", async () => {
    const unsupported = structuredClone(payload)
    unsupported.research.facts[0].evidence[0].quote = "This sentence was never in the source."
    const { db, write, rpc } = database({ id, kind: "news_evaluation", payload: unsupported })
    const { runTrainingJob } = await import("@/lib/news/training/jobs")
    expect(await runTrainingJob(db, id)).toMatchObject({
      id,
      error: expect.stringContaining("원문"),
    })
    expect(mocks.write).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(write.update).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }))
  })

  it("researches an imported article once and shares the validated evidence in both drafts", async () => {
    // A secondary report must remain REPORTED even if the model labels it confirmed.
    const modelResearch = structuredClone(research)
    modelResearch.facts[0].kind = "CONFIRMED"
    mocks.research.mockResolvedValue(modelResearch)
    const { db, rpc } = database({
      id,
      kind: "news_evaluation",
      payload: { ...payload, research: null },
    })
    const { runTrainingJob } = await import("@/lib/news/training/jobs")
    expect(await runTrainingJob(db, id)).toEqual({ id, completed: true })
    expect(mocks.research).toHaveBeenCalledExactlyOnceWith(
      "news-evaluation-research",
      "source-grounded research prompt",
      { sources: [source] },
      7000
    )
    expect(mocks.write).toHaveBeenCalledTimes(2)
    const baseline = mocks.write.mock.calls[0][0]
    const learned = mocks.write.mock.calls[1][0]
    expect(baseline.research).toMatchObject({ facts: [{ kind: "REPORTED" }], confidence: "MEDIUM" })
    expect(learned.research).toBe(baseline.research)
    expect(mocks.research.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.write.mock.invocationCallOrder[0]
    )
    expect(rpc).toHaveBeenCalledWith(
      "complete_admin_training",
      expect.objectContaining({
        p_result: expect.objectContaining({ research: baseline.research }),
      })
    )
  })

  it.each([
    { sources: [] },
    { sources: [{ ...source, role: "background" }] },
    { sources: [{ ...source, text: "too short" }] },
  ])(
    "does not spend on research or writing for an import without valid current source evidence: %j",
    async ({ sources }) => {
      const { db, rpc } = database({
        id,
        kind: "news_evaluation",
        payload: { ...payload, sources, research: null },
      })
      const { runTrainingJob } = await import("@/lib/news/training/jobs")
      expect(await runTrainingJob(db, id)).toMatchObject({ id, error: expect.any(String) })
      expect(mocks.research).not.toHaveBeenCalled()
      expect(mocks.write).not.toHaveBeenCalled()
      expect(rpc).toHaveBeenCalledTimes(1)
    }
  )

  it("stops imported comparisons if the new research invents an unsupported quote", async () => {
    const unsupported = structuredClone(research)
    unsupported.facts[0].evidence[0].quote = "An agreement was officially announced."
    mocks.research.mockResolvedValue(unsupported)
    const { db, rpc } = database({
      id,
      kind: "news_evaluation",
      payload: { ...payload, research: null },
    })
    const { runTrainingJob } = await import("@/lib/news/training/jobs")
    expect(await runTrainingJob(db, id)).toMatchObject({
      id,
      error: expect.stringContaining("원문"),
    })
    expect(mocks.research).toHaveBeenCalledTimes(1)
    expect(mocks.write).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it("completes the community entry and job through one private transaction", async () => {
    const { db, rpc, from } = database({
      id,
      kind: "agg_generation",
      payload: { source_title: "연습 소재" },
    })
    const { runTrainingJob } = await import("@/lib/news/training/jobs")
    expect(await runTrainingJob(db, id)).toEqual({ id, completed: true })
    expect(rpc).toHaveBeenCalledWith(
      "complete_admin_training",
      expect.objectContaining({
        p_entry: { ai_title: "비공개 연습", ai_body: "연습 본문" },
        p_result: { title: "비공개 연습", applied_ids: ["correction"] },
      })
    )
    expect(from).not.toHaveBeenCalled()
  })

  it("does not report completion or overwrite another worker after losing ownership", async () => {
    const { db, rpc, from } = database({ id, kind: "agg_generation", payload: {} })
    rpc
      .mockResolvedValueOnce({ data: [{ id, kind: "agg_generation", payload: {} }], error: null })
      .mockResolvedValueOnce({ data: false, error: null })
    const { runTrainingJob } = await import("@/lib/news/training/jobs")
    expect(await runTrainingJob(db, id)).toEqual({ id, skipped: true })
    expect(from).not.toHaveBeenCalled()
  })

  it("records model failure under the same token and never marks it completed", async () => {
    mocks.agg.mockRejectedValue(Error("model unavailable"))
    const { db, rpc, write } = database({ id, kind: "agg_generation", payload: {} })
    const { runTrainingJob } = await import("@/lib/news/training/jobs")
    expect(await runTrainingJob(db, id)).toEqual({ id, error: "model unavailable" })
    expect(rpc).toHaveBeenCalledTimes(1)
    const claim = rpc.mock.calls[0][1] as { p_token: string }
    expect(write.eq.mock.calls).toEqual([
      ["id", id],
      ["token", claim.p_token],
      ["status", "running"],
    ])
    expect(write.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", error: "model unavailable", lease_until: null })
    )
  })

  it("preserves a result-storage failure as failed and surfaces a failure-status storage outage", async () => {
    const { db, rpc, write } = database({ id, kind: "agg_generation", payload: {} })
    const claim = { data: [{ id, kind: "agg_generation", payload: {} }], error: null }
    rpc
      .mockResolvedValueOnce(claim)
      .mockResolvedValueOnce({ data: null, error: { message: "write failed" } })
    const { runTrainingJob } = await import("@/lib/news/training/jobs")
    expect(await runTrainingJob(db, id)).toMatchObject({
      id,
      error: "학습 결과를 저장하지 못했습니다.",
    })
    expect(write.update).toHaveBeenCalledWith(
      expect.objectContaining({ error: "학습 결과를 저장하지 못했습니다." })
    )
    mocks.agg.mockRejectedValue(Error("model unavailable"))
    write.maybeSingle.mockResolvedValue({ data: null!, error: { message: "database offline" } })
    await expect(runTrainingJob(db, id)).rejects.toThrow("실패한 작업의 상태")
  })

  it("does not claim it recorded a model failure after losing its job token", async () => {
    mocks.agg.mockRejectedValue(Error("model unavailable"))
    const { db, write } = database({ id, kind: "agg_generation", payload: {} })
    write.maybeSingle.mockResolvedValue({ data: null!, error: null })
    const { runTrainingJob } = await import("@/lib/news/training/jobs")
    expect(await runTrainingJob(db, id)).toEqual({ id, skipped: true })
  })
})

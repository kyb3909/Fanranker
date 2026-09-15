import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

const mocks = vi.hoisted(() => ({
  corrections: vi.fn(),
  generate: vi.fn(),
  prompt: vi.fn(),
  chat: vi.fn(),
}))
vi.mock("@/data/agents/core/agg-corrections.mjs", () => ({ loadAggCorrections: mocks.corrections }))
vi.mock("@/data/agents/core/agg-writing.mjs", () => ({
  createAggWriter: () => ({
    pickPersona: () => ({ nickname: "팬" }),
    pickStructure: () => "short_read",
    buildSystemPrompt: mocks.prompt,
    generatePost: mocks.generate,
  }),
}))
vi.mock("@/lib/llm/usage-log", () => ({ openaiChat: mocks.chat }))

const material = {
  source_title: "축구 경기 이야기",
  category: "축구",
  body_excerpt:
    "경기 뒤 감독이 수비 전환을 설명했다. 후반 교체의 목적과 경기 흐름에 관한 이야기다.",
  media: [],
}
const db = { from: vi.fn(), rpc: vi.fn() } as unknown as SupabaseClient
beforeEach(() => {
  vi.clearAllMocks()
  mocks.corrections.mockResolvedValue({
    pairs: [{ id: "corrected-id" }, { before: {} }],
    rejects: [{ id: "rejected-id" }],
  })
  mocks.prompt.mockReturnValue("교정 적용 프롬프트")
  mocks.generate.mockResolvedValue({
    decision: "pass",
    title: "감독이 설명한 후반 변화",
    paragraphs: ["첫 문단", "둘째 문단"],
  })
})

describe("community practice generation", () => {
  it("prepares a private entry with exactly the applied correction IDs and no direct publication", async () => {
    const { generateAggPractice } = await import("@/lib/agg/training")
    const result = await generateAggPractice(db, material)
    expect(result).toMatchObject({
      entry: {
        ai_title: "감독이 설명한 후반 변화",
        ai_body: "첫 문단\n\n둘째 문단",
        applied_training_ids: ["corrected-id", "rejected-id"],
      },
      result: { applied_ids: ["corrected-id", "rejected-id"] },
    })
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({ item: material, systemPrompt: "교정 적용 프롬프트" })
    )
    expect(db.from).not.toHaveBeenCalled()
    expect(db.rpc).not.toHaveBeenCalled()
  })

  it("records a rejected practice without creating a training entry", async () => {
    mocks.generate.mockResolvedValue({ decision: "reject", reject_reason: "반복 광고 소재" })
    const { generateAggPractice } = await import("@/lib/agg/training")
    expect(await generateAggPractice(db, material)).toEqual({
      entry: null,
      result: {
        rejected: true,
        reason: "반복 광고 소재",
        applied_ids: ["corrected-id", "rejected-id"],
      },
    })
  })

  it("stops on unavailable corrections, empty model responses and malformed output", async () => {
    const { generateAggPractice } = await import("@/lib/agg/training")
    mocks.corrections.mockRejectedValueOnce(Error("corrections unavailable"))
    await expect(generateAggPractice(db, material)).rejects.toThrow("corrections unavailable")
    expect(mocks.generate).not.toHaveBeenCalled()
    mocks.generate.mockImplementationOnce(async ({ chatWithRetry }) =>
      chatWithRetry({ messages: [] })
    )
    mocks.chat.mockResolvedValueOnce(null)
    await expect(generateAggPractice(db, material)).rejects.toThrow("연습 생성에 실패")
    mocks.generate.mockResolvedValueOnce({ decision: "pass", title: "잘못된 출력", paragraphs: [] })
    await expect(generateAggPractice(db, material)).rejects.toThrow()
    expect(db.from).not.toHaveBeenCalled()
  })
})

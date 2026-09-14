import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { inspectDraft } from "@/lib/news/quality-gate"
import { inspectNewsFollowup } from "@/lib/news/followup"

vi.mock("@/lib/llm/usage-log", () => ({ logUsage: vi.fn(), logUsageFailure: vi.fn() }))

const content = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "경기 후 감독은 선제골 뒤 수비 간격이 벌어진 점을 설명했다. 선수들은 다음 경기에서 일관성을 높이기 위해 수비 위치와 압박 시점을 함께 조정할 예정이다.",
        },
      ],
    },
  ],
}
const mockFetch = vi.fn()
const response = (result: unknown) =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }))
beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-key")
  vi.stubGlobal("fetch", mockFetch)
  mockFetch.mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
describe("quality evidence and infrastructure failures", () => {
  it("sends the full captured source, original title and source URL", async () => {
    mockFetch.mockResolvedValue(
      response({ pass: true, reasons: [], player_names_kr: [], coach_names_kr: [] })
    )
    const source = "Original question and response.\n".repeat(180) + "FINAL COMPLETE ANSWER"
    const evidence = {
      original_title: "Coach explains the result",
      source_url: "https://www.chelseafc.com/en/news/article/source",
    }
    expect((await inspectDraft("감독 경기 후 발언", content, source, evidence)).pass).toBe(true)
    const request = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(request.messages[1].content).toContain("FINAL COMPLETE ANSWER")
    expect(request.messages[1].content).toContain(evidence.source_url)
    expect(request.messages[1].content).toContain(evidence.original_title)
  })
  it.each([new Response("", { status: 503 }), response({}), response({ pass: true })])(
    "returns unavailable for failed or incomplete responses",
    async (res) => {
      mockFetch.mockResolvedValue(res)
      expect(await inspectDraft("감독 인터뷰", content, "source")).toMatchObject({
        pass: false,
        infra: true,
      })
    }
  )
  it("keeps a real content rejection distinct from infrastructure failure", async () => {
    mockFetch.mockResolvedValue(
      response({
        pass: false,
        reasons: ["원문에 없는 인용문"],
        player_names_kr: [],
        coach_names_kr: [],
      })
    )
    const verdict = await inspectDraft("감독 인터뷰", content, "source")
    expect(verdict).toMatchObject({ pass: false, reasons: ["원문에 없는 인용문"] })
    expect(verdict.infra).not.toBe(true)
  })
  it("requires a real source passage for a new follow-up", async () => {
    const source =
      "The manager explained: We changed our midfield because the opponent pressed our full backs."
    mockFetch.mockResolvedValue(
      response({
        new_information: true,
        source_quote: "We changed our midfield because the opponent pressed our full backs.",
      })
    )
    expect(
      await inspectNewsFollowup("감독 발언", content, source, [
        { title: "기존 경기 보도", content },
      ])
    ).toBe("new_information")
    mockFetch.mockResolvedValue(
      response({
        new_information: true,
        source_quote: "He actually resigned after the game and left the club permanently.",
      })
    )
    expect(
      await inspectNewsFollowup("감독 발언", content, source, [
        { title: "기존 경기 보도", content },
      ])
    ).toBe("unavailable")
  })
})

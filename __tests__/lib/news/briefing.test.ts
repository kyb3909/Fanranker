import { describe, it, expect } from "vitest"
import { selectBackground, type BackgroundRow } from "@/lib/news/briefing"
import { isInfrastructureGate, qualityRetryState } from "@/lib/news/evidence"
import { interviewMaterial, isInterviewCandidate } from "@/lib/interviews/scout"

const now = Date.parse("2026-09-14T04:00:00Z")
const source =
  "Chelsea coach explained defensive errors against Hull after losing their lead. " +
  "The players need consistency and balance to avoid conceding again. ".repeat(5)
const row = (id: string, date = "2026-09-12T17:00:00Z"): BackgroundRow => ({
  id,
  created_at: date,
  urls: { source: "https://www.chelseafc.com/en/news/article/" + id },
  raw: {
    source_text: source,
    original_title: "Chelsea defensive errors against Hull",
    published_at: date,
  },
  draft: { title: "잘못 생성된 제목에는 없는 선수와 사건" },
})
const query = {
  title: "Chelsea coach on defensive errors against Hull",
  material: source,
  source_url: "https://www.chelseafc.com/en/news/article/current",
  published_at: "2026-09-13T17:00:00Z",
}
describe("news evidence retrieval and recovery", () => {
  it("requires the complete named subject, ignoring common interview wording and accents", () => {
    const joao = row("joao")
    joao.raw!.original_title = "Alonso on João Pedro"
    joao.raw!.source_text =
      "João Pedro needs to improve on the details. Chelsea training focuses on defensive positioning and balance. ".repeat(
        5
      )
    const unrelated = row("other-pedro")
    unrelated.raw!.original_title = "Pedro Neto on training"
    unrelated.raw!.source_text =
      "Pedro Neto says we need to improve on the details. Training focuses on defensive positioning and balance. ".repeat(
        5
      )
    const passingMention = row("passing-mention")
    passingMention.raw!.original_title = "Arteta discusses a defensive injury"
    passingMention.raw!.source_text =
      unrelated.raw!.source_text.repeat(3) + "\nJoao Pedro was mentioned as an opponent."
    expect(
      selectBackground(
        {
          ...query,
          title: "Joao Pedro: We need to improve on the details",
          material: joao.raw!.source_text,
        },
        [joao, unrelated, passingMention],
        now
      ).map((r) => r.id)
    ).toEqual(["joao"])
  })

  it("excludes an old article captured only after the current interview", () => {
    const capturedLater = row("updated-page")
    capturedLater.created_at = "2026-09-14T01:00:00Z"
    expect(selectBackground(query, [capturedLater], now)).toEqual([])
  })

  it("returns captured original excerpts, excluding future, undated and same-source records", () => {
    const undated = row("undated")
    delete undated.raw!.published_at
    const result = selectBackground(
      query,
      [row("old"), row("future", "2026-09-14T01:00:00Z"), undated, row("current")],
      now
    )
    expect(result.map((r) => r.id)).toEqual(["old"])
    expect(result[0].excerpt).toContain("defensive errors")
    expect(result[0].excerpt).not.toContain("잘못 생성된")
  })
  it("does not attach an unrelated story just because Chelsea appears", () => {
    const unrelated = row("unrelated")
    unrelated.raw!.source_text =
      "Chelsea announced stadium ticket membership commercial plans. ".repeat(8)
    unrelated.raw!.original_title = "Chelsea tickets"
    expect(selectBackground(query, [unrelated], now)).toEqual([])
  })
  it("only retries infrastructure-only verdicts and limits attempts", () => {
    expect(
      isInfrastructureGate({ pass: false, reasons: ["검사관 호출 실패(타임아웃/파싱)"] })
    ).toBe(true)
    expect(
      isInfrastructureGate({
        pass: false,
        reasons: ["검사관 호출 실패(HTTP 500)", "원문에 없는 인용"],
      })
    ).toBe(false)
    expect(isInfrastructureGate({ pass: false, reasons: [] })).toBe(false)
    expect(qualityRetryState({ quality_retry: { attempts: 4 } }, now).exhausted).toBe(true)
    expect(
      qualityRetryState(
        { quality_retry: { attempts: 1, next_at: new Date(now + 60000).toISOString() } },
        now
      ).waiting
    ).toBe(true)
  })
  it("reads Hermes fields and original interview title", () => {
    const result = interviewMaterial({
      source: { origin_url: "https://www.reddit.com/r/chelseafc/comments/abc/title/" },
      urls: { source: "https://www.chelseafc.com/en/news/article/example" },
      raw: { original_title: "Coach press conference", source_text: source },
    })
    expect(result.subreddit).toBe("chelseafc")
    expect(result.sourceUrl).toContain("chelseafc.com")
    expect(isInterviewCandidate(result.title, result.material.length)).toBe(true)
  })
})

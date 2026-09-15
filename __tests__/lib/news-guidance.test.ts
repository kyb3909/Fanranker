// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { buildNotationHints, type NotationHint } from "@/lib/news/notation/rules"
import { selectNotationHints } from "@/lib/news/notation/select-hints"
import {
  buildNamingHints,
  editorialGuidanceTrace,
  fetchCorrectionExamples,
  judgeAndWrite,
} from "@/scripts/vps-news-scanner/news-scanner.mjs"
import { NEWS_WRITER_POLICY_VERSION } from "@/scripts/vps-news-scanner/writer-policy.mjs"

afterEach(() => vi.unstubAllGlobals())

describe("dictionary input selection", () => {
  const hints: NotationHint[] = [
    {
      ko: "사비뉴",
      kind: "person",
      en: ["savio moreira"],
      enTeam: ["savio"],
      team: ["Manchester City"],
    },
    {
      ko: "마테우스 사비우",
      kind: "person",
      en: ["matheus savio"],
      enTeam: ["savio"],
      team: ["Urawa Reds"],
    },
    { ko: "영", kind: "person", en: ["young"] },
    { ko: "마치", kind: "person", en: ["march"] },
  ]
  it("locks surnames to the mentioned team and excludes ordinary words and months", () => {
    const source = "Manchester City said Savio is a young player in March."
    expect(selectNotationHints(hints, source).map((h) => h.ko)).toEqual(["사비뉴"])
    const scanner = buildNamingHints(hints, source)
    expect(scanner).toContain("savio = 사비뉴")
    expect(scanner).not.toContain("마테우스 사비우")
    expect(scanner).not.toContain("march =")
    expect(scanner).not.toContain("young =")
    expect(selectNotationHints(hints, "Savio spoke after the match.")).toEqual([])
  })
  it("keeps the longest matches within a bounded input budget", () => {
    expect(selectNotationHints(hints, "Young spoke with Savio Moreira.", 1)).toEqual([
      { ko: "사비뉴", kind: "person", en: ["savio moreira"] },
    ])
    expect(selectNotationHints(hints, "Youngster spoke.")).toEqual([])
  })
  it("passes explicit lowercase glossary terms and short abbreviations to both writers", () => {
    const terms = buildNotationHints([
      {
        category: "term",
        preferred_ko: "무실점",
        romanized: "clean sheet",
        surfaces: [],
        disambiguation: null,
      },
      {
        category: "term",
        preferred_ko: "기대 득점",
        romanized: "xG",
        surfaces: [],
        disambiguation: null,
      },
      {
        category: "player",
        preferred_ko: "영",
        romanized: "young",
        surfaces: [],
        disambiguation: null,
      },
    ])
    const source = "The young defender kept a clean sheet despite high xG."
    expect(selectNotationHints(terms, source).map((h) => h.ko)).toEqual(["무실점", "기대 득점"])
    expect(buildNamingHints(terms, source)).toContain("clean sheet = 무실점")
    expect(buildNamingHints(terms, source)).toContain("xg = 기대 득점")
    expect(buildNamingHints(terms, source)).not.toContain("young =")
  })
})

describe("live owner guidance", () => {
  const payload = {
    guidance_available: true,
    policy_version: NEWS_WRITER_POLICY_VERSION,
    loaded_at: "2026-09-15T00:00:00.000Z",
    examples: [],
    articles: [],
    naming: [],
    lessons: [],
    editorial_rules: [],
  }
  it("accepts an authoritative empty list, and refuses incomplete or unavailable lists", async () => {
    const call = (value: unknown, status = 200) =>
      fetchCorrectionExamples({
        cronSecret: "test",
        fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify(value), { status })),
      })
    expect((await call(payload)).guidance_available).toBe(true)
    expect((await call({ ...payload, guidance_available: undefined })).guidance_available).toBe(
      false
    )
    expect((await call({ ...payload, editorial_rules: undefined })).guidance_available).toBe(false)
    expect((await call({ ...payload, policy_version: "old" })).guidance_available).toBe(false)
    expect((await call({ error: "unavailable" }, 503)).guidance_available).toBe(false)
  })
  it("makes no model request when guidance could not be loaded", async () => {
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    await expect(
      judgeAndWrite({ url: "https://example.com" }, { guidance_available: false })
    ).rejects.toThrow("편집 기준")
    expect(fetch).not.toHaveBeenCalled()
  })
  it("records the same bounded lesson and rule inputs sent to the writer", () => {
    const trace = editorialGuidanceTrace({
      ...payload,
      lessons: Array.from({ length: 15 }, (_, i) => ({ id: `lesson-${i}` })),
      editorial_rules: Array.from({ length: 25 }, (_, i) => ({ id: `rule-${i}` })),
    })
    expect(trace.applied_lesson_ids).toHaveLength(12)
    expect(trace.applied_rule_ids).toHaveLength(20)
    expect(trace.policy_version).toBe(NEWS_WRITER_POLICY_VERSION)
    expect(trace.loaded_at).toBe(payload.loaded_at)
  })
})

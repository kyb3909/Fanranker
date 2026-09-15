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
import {
  NEWS_WRITER_POLICY_VERSION,
  EDITORIAL_STYLE_RULE_IDS,
  findEditorialStyleViolations,
  enforceEditorialStyle,
} from "@/scripts/vps-news-scanner/writer-policy.mjs"

afterEach(() => vi.unstubAllGlobals())

describe("owner style rules on the generated article", () => {
  const rules = Object.values(EDITORIAL_STYLE_RULE_IDS).map((id) => ({ id, active: true }))
  it("detects the actual Barcelona lead failure and narration honorifics", () => {
    const body =
      "Culemanía 보도에 따르면, 바르셀로나는 후순위 대출을 활용하는 방안을 협의했다고 한다.\n\n이 대출은 결산에 반영됐습니다."
    expect(findEditorialStyleViolations(body, rules).map((v) => v.rule_id)).toEqual(
      expect.arrayContaining(Object.values(EDITORIAL_STYLE_RULE_IDS))
    )
  })
  it("accepts a news-first reported lead with attribution later and quoted honorifics", () => {
    expect(
      findEditorialStyleViolations(
        "바르셀로나가 후순위 대출을 활용하는 방안을 협의했다고 전해졌다.\n\nCulemanía는 구단 관계자가 “협의를 마쳤습니다”라고 말했다고 보도했다.",
        rules
      )
    ).toEqual([])
    expect(findEditorialStyleViolations('그는 "동의합니다"라고 말했다.', rules)).toEqual([])
    expect(
      findEditorialStyleViolations("구단은 발표했습니다.", [
        { id: EDITORIAL_STYLE_RULE_IDS.declarative, active: false },
      ])
    ).toEqual([])
  })
  it("repairs the whole article once and does not let an unrepaired result through", async () => {
    const draft = {
      worthy: true,
      title: "협의 보도",
      summary: "BBC 보도에 따르면, 구단이 협의했습니다.",
    }
    const rewrite = vi.fn().mockResolvedValue({
      ...draft,
      summary: "구단이 협의했다고 전해졌다.\n\nBBC가 이같이 보도했다.",
    })
    expect((await enforceEditorialStyle(draft, rules, rewrite)).rewritten).toBe(true)
    expect(rewrite).toHaveBeenCalledTimes(1)
    rewrite.mockClear().mockResolvedValue(draft)
    await expect(enforceEditorialStyle(draft, rules, rewrite)).rejects.toThrow("저장을 보류")
    expect(rewrite).toHaveBeenCalledTimes(1)
  })
  it("passes the editor's reason and removes the old conflicting instructions from the writer request", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        choices: [{ message: { content: '{"worthy":true,"title":"기사","summary":"보도됐다."}' } }],
      })
    )
    vi.stubGlobal("fetch", fetch)
    await judgeAndWrite(
      { title: "Club interview", subreddit: "soccer", url: "https://club.example/news" },
      {
        guidance_available: true,
        editorial_rules: rules,
        lessons: [],
        naming: [],
        examples: [],
        articles: [
          {
            before: "보도에 따르면",
            after: "감독이 말했다.",
            reason: "재인용 매체 대신 직접 인터뷰 출처를 밝힌다.",
          },
        ],
      },
      { kind: "article", text: "The club interviewed the manager." }
    )
    const prompt = JSON.parse(fetch.mock.calls[0][1].body).messages[0].content
    expect(prompt).toContain("재인용 매체 대신 직접 인터뷰 출처")
    expect(prompt).not.toContain("첫 문장은 누구의 보도인지로 연다")
    expect(prompt).not.toContain('와이어체("~라고 합니다"')
    expect(prompt).toContain("현재 활성 규칙 >")
    expect(prompt).toContain("수정 후 원고에도 오류가 남아 있을 수 있다")
    expect(prompt).not.toContain("처음부터 최종본의 문장 구조")
  })
})

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

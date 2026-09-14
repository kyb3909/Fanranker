import { describe, expect, it } from "vitest"
import {
  anchoredLessons,
  snapshotSource,
  validateResearch,
  sourceIdentity,
} from "@/lib/news/desk/evidence"
import {
  reusableDeskLessons,
  NEWS_WRITER_POLICY,
} from "@/scripts/vps-news-scanner/writer-policy.mjs"
import type { DeskSource, DeskResearch, LessonProposal } from "@/lib/news/desk/types"

const source: DeskSource = {
  id: "one",
  source_name: "BBC",
  source_url: "https://www.bbc.com/sport/football/a",
  title: "Coach speaks",
  published_at: "2026-09-14T01:00:00Z",
  updated_at: null,
  author: null,
  source_tier: 2,
  primary_or_secondary: "secondary",
  original_reporting: null,
  origin_group: null,
  role: "current",
  captured_at: "2026-09-14T02:00:00Z",
  text: "The coach said the clubs are still negotiating. No agreement has been announced.",
}
const research = (): DeskResearch => ({
  rejected: false,
  rejection_reason: null,
  news_type: "RUMOR",
  angle: "협상 진행",
  facts: [
    {
      id: "F1",
      text: "협상이 진행 중이다.",
      kind: "CONFIRMED",
      evidence: [{ source_id: "one", quote: "the clubs are still negotiating." }],
    },
  ],
  conflicts: [],
  verification_gaps: [],
})
describe("news desk evidence", () => {
  it("does not turn a secondary report into official confirmation", () => {
    const result = validateResearch(research(), [source])
    expect(result.facts[0].kind).toBe("REPORTED")
    expect(result.confidence).toBe("MEDIUM")
  })
  it("rejects fabricated source ids, invented quotes, and background-only articles", () => {
    const changed = research()
    changed.facts[0].evidence[0].quote = "The transfer was officially announced."
    expect(() => validateResearch(changed, [source])).toThrow("원문")
    changed.facts[0].evidence[0] = {
      source_id: "invented",
      quote: "the clubs are still negotiating.",
    }
    expect(() => validateResearch(changed, [source])).toThrow()
    expect(() => validateResearch(research(), [{ ...source, role: "background" }])).toThrow()
  })
  it("holds conflicting key facts and keeps opinions as opinions", () => {
    const conflict = research()
    conflict.conflicts = ["각 매체가 보도한 이적료가 다르다."]
    expect(() => validateResearch(conflict, [source])).toThrow()
    const opinion = research()
    opinion.facts[0].kind = "OPINION"
    expect(
      validateResearch(opinion, [{ ...source, primary_or_secondary: "primary", source_tier: 1 }])
        .facts[0].kind
    ).toBe("OPINION")
  })
  it("does not count recycled Reuters material as independent sources", () => {
    expect(
      sourceIdentity("https://www.bbc.com/news/story", "Reported by Reuters").origin_group
    ).toBe("wire:reuters")
    expect(
      sourceIdentity("https://www.theguardian.com/football/story", "Reuters contributed reporting")
        .origin_group
    ).toBe("wire:reuters")
    expect(
      sourceIdentity("https://www.bbc.com/news/story", "Unnamed sources").original_reporting
    ).toBeNull()
    expect(
      sourceIdentity("https://www.bbc.com.attacker.example/news", "Official announcement")
        .source_tier
    ).toBe(5)
  })
  it("rejects missing publication dates and blocked pages", () => {
    const row = {
      id: "a",
      created_at: "2026-09-14T02:00:00Z",
      urls: { source: source.source_url },
      draft: null,
      raw: {
        original_title: "Coach speaks",
        source_text: "A real source article paragraph. ".repeat(20),
      },
    }
    expect(snapshotSource(row)).toBeNull()
    expect(
      snapshotSource({
        ...row,
        raw: {
          ...row.raw,
          published_at: source.published_at!,
          source_text: "Access denied. ".repeat(30),
        },
      })
    ).toBeNull()
    expect(
      snapshotSource({ ...row, raw: { ...row.raw, published_at: source.published_at! } })?.author
    ).toBeNull()
  })
})
describe("learning from real edits", () => {
  const before = { title: "영입 확정", article: "이적료는 5000만 유로다. 팬들이 열광하고 있다." }
  const after = { title: "영입 협상", article: "BBC에 따르면 이적료는 5500만 유로로 알려졌다." }
  const proposal: LessonProposal = {
    category: "certainty",
    field: "title",
    wrong: "확정",
    correct: "협상",
    explanation: "확인되지 않은 단정을 협상 단계로 낮췄다.",
  }
  it("keeps real edited spans and rejects imaginary corrections", () => {
    expect(anchoredLessons([proposal], before, after)).toHaveLength(1)
    expect(anchoredLessons([{ ...proposal, wrong: "메디컬 완료" }], before, after)).toHaveLength(0)
    expect(anchoredLessons([proposal], before, before)).toHaveLength(0)
    expect(
      anchoredLessons([{ ...proposal, wrong: "영입", correct: "영입" }], before, after)
    ).toHaveLength(0)
  })
  it("supports actual deletions", () => {
    const deletion: LessonProposal = {
      category: "context",
      field: "article",
      wrong: "팬들이 열광하고 있다.",
      correct: "",
      explanation: "원문에 없는 팬 반응을 삭제했다.",
    }
    expect(anchoredLessons([deletion], before, after)).toHaveLength(1)
  })
  it("uses the correction reason in subsequent drafts but isolates case-specific amounts", () => {
    const amount: LessonProposal = {
      category: "number",
      field: "article",
      wrong: "5000만",
      correct: "5500만",
      explanation: "이번 이적료를 정정했다.",
    }
    const lessons = anchoredLessons([proposal, amount], before, after).map((l, i) => ({
      ...l,
      id: String(i),
      active: true,
    }))
    const memory = reusableDeskLessons(lessons)
    expect(memory[0].before).toBe("확정")
    expect(memory[0].explanation).toContain("협상")
    expect(memory[1].scope).toBe("case")
    expect(JSON.stringify(memory[1])).not.toMatch(/5000|5500/)
    expect(memory[1].instruction).toContain("해당 원문")
    expect(reusableDeskLessons(lessons.map((l) => ({ ...l, active: false })))).toEqual([])
    expect(NEWS_WRITER_POLICY).toContain("Accuracy > Clarity")
  })
})

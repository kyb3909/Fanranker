// @vitest-environment node
import { describe, expect, it } from "vitest"
import { anchoredLessons, LESSON_INSTRUCTIONS } from "@/lib/news/desk/evidence"
import type { DeskArticle, LessonProposal } from "@/lib/news/desk/types"
import { reusableDeskLessons } from "@/scripts/vps-news-scanner/writer-policy.mjs"

const article = (text: string): DeskArticle => ({ title: "감독의 경기 평가", article: text })
const proposal = (values: Partial<LessonProposal>): LessonProposal => ({
  category: "structure",
  field: "article",
  wrong: "",
  correct: "",
  explanation: "평가의 이유를 먼저 읽을 수 있도록 문단의 강조 순서를 조정한 것으로 해석할 수 있다.",
  ...values,
})

describe("learning from a professional editor's actual changes", () => {
  it("anchors paragraph relocation in the real before and after context", () => {
    const evaluation = "감독은 수비에 만족한다고 말했다."
    const reason = "선수들이 상대 역습 공간을 막았다는 설명을 덧붙였다."
    const before = article(`${evaluation}\n\n${reason}`)
    const after = article(`${reason}\n\n${evaluation}`)
    const lessons = anchoredLessons(
      [
        proposal({
          wrong: reason,
          correct: reason,
          instruction: "평가를 이해하는 데 필요한 이유와 상황을 먼저 설명하고 발언을 연결한다.",
        }),
      ],
      before,
      after
    )
    expect(lessons).toHaveLength(1)
    expect(lessons[0].wrong).toBe(before.article)
    expect(lessons[0].correct).toBe(after.article)
    expect(lessons[0].wrong).not.toBe(lessons[0].correct)
    expect(lessons[0].instruction).toContain("이유와 상황을 먼저")
  })

  it("does not invent a relocation when an unchanged paragraph merely shifts after an insertion", () => {
    const paragraph = "감독은 수비에 만족한다고 말했다."
    const context = "선수들의 간격이 좁았다는 설명도 있었다."
    expect(
      anchoredLessons(
        [proposal({ wrong: paragraph, correct: paragraph })],
        article(`${paragraph}\n\n${context}`),
        article(`인터뷰가 공개됐다.\n\n${paragraph}\n\n${context}`)
      )
    ).toEqual([])
  })

  it("rejects fabricated insertion and deletion of text that remained unchanged", () => {
    const before = article("감독이 말했다. 경기 전이었다.")
    const after = article("감독이 말했다. 경기 후였다.")
    expect(
      anchoredLessons(
        [
          proposal({ category: "context", wrong: "감독이 말했다.", correct: "" }),
          proposal({ category: "context", wrong: "", correct: "감독이 말했다." }),
        ],
        before,
        after
      )
    ).toEqual([])
  })

  it("supports removing one repeated sentence while preserving another occurrence", () => {
    const repeated = "감독은 수비에 만족했다."
    expect(
      anchoredLessons(
        [proposal({ category: "style", wrong: repeated, correct: "" })],
        article(`${repeated} ${repeated}`),
        article(repeated)
      )
    ).toHaveLength(1)
  })

  it("retains a specific reusable principle and labels analysis independently of optional editor notes", () => {
    const before = { title: "영입 확정", article: "구단들이 논의 중이라고 밝혔다." }
    const after = { ...before, title: "영입 협상" }
    const change = proposal({
      category: "certainty",
      field: "title",
      wrong: "확정",
      correct: "협상",
      explanation: "제목의 확정을 협상 단계로 낮춘 수정으로 해석할 수 있다.",
      instruction: "개인 조건 합의와 구단 간 합의를 구분하고 확인된 계약 단계만 제목에 쓴다.",
    })
    const result = anchoredLessons([change, change], before, after)
    expect(result).toHaveLength(1)
    expect(result[0].explanation).toMatch(/^AI 해석:/)
    expect(result[0].instruction).toBe(change.instruction)
    expect(anchoredLessons([change], before, after, "단계 구분이 필요함")[0].explanation).toMatch(
      /^편집자 메모를 참고한 AI 해석:/
    )
  })

  it("keeps article-specific amounts out of future instructions despite an unsafe AI proposal", () => {
    const before = article("이적료는 5000만 유로다.")
    const after = article("이적료는 5500만 유로다.")
    const result = anchoredLessons(
      [
        proposal({
          category: "number",
          wrong: "5000만",
          correct: "5500만",
          instruction: "다음 기사에서도 이적료를 항상 5500만 유로로 변경한다.",
        }),
      ],
      before,
      after
    )
    expect(result[0].instruction).toBe(LESSON_INSTRUCTIONS.number)
    const memory = reusableDeskLessons(
      result.map((lesson) => ({ ...lesson, id: "lesson", active: true }))
    )
    expect(JSON.stringify(memory)).not.toMatch(/5000|5500/)
  })
})

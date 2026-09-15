// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import { applyPendingDeskLessons } from "@/lib/news/desk/auto-apply-lessons"
import { LESSON_INSTRUCTIONS } from "@/lib/news/desk/evidence"

const mocks = vi.hoisted(() => ({ chat: vi.fn(), rules: vi.fn() }))
vi.mock("@/lib/llm/usage-log", () => ({ openaiChat: mocks.chat }))
vi.mock("@/lib/news/training/settings", () => ({ loadEditorialRules: mocks.rules }))
vi.mock("@/lib/news/quality-gate", () => ({ inspectDraft: vi.fn() }))
vi.mock("@/lib/news/notation", () => ({ loadNotation: vi.fn() }))

const before = {
  title: "감독의 선수 평가",
  article: "감독은 선수가 다음 경기에서 좋은 모습을 보일 것이라고 말했습니다.",
}
const after = {
  ...before,
  article: "감독은 선수가 다음 경기에서 좋은 모습을 보일 것이라고 말했다.",
}
const proposal = {
  category: "style",
  field: "article",
  wrong: "말했습니다.",
  correct: "말했다.",
  explanation: "존대 종결을 건조한 기사체로 바꿨다.",
  instruction: "직접 인용 밖의 서술은 한다·했다체로 쓴다.",
  scope: "general",
}
const rules = [
  {
    id: "8f228310-bbe8-44b5-a705-c31d217e1401",
    active: true,
    instruction: "서술은 한다·했다체로 쓴다.",
  },
]

function memoryDb(initialLessons: Record<string, any>[] = []) {
  const revision = {
    id: "revision",
    item_id: "item",
    version: 2,
    before_draft: before,
    after_draft: after,
    editor_reason: "",
    learning_state: "pending",
    learning_token: null,
  }
  const tables: Record<string, Record<string, any>[]> = {
    news_desk_lessons: initialLessons,
    news_desk_revisions: [revision],
    news_desk_items: [{ id: "item", origin: { kind: "post", id: "actual-post" } }],
  }
  const controls = { failActivation: false, beforeActivation: null as (() => void) | null }
  const rpc = vi.fn(async (name: string, params: Record<string, any>) => {
    if (name === "claim_news_desk_learning") {
      if (revision.learning_state !== "pending") return { data: [], error: null }
      Object.assign(revision, { learning_state: "processing", learning_token: params.p_token })
      return { data: [{ ...revision }], error: null }
    }
    if (name === "complete_news_desk_learning") {
      for (const [index, value] of params.p_lessons.entries()) {
        tables.news_desk_lessons.push({
          ...value,
          id: `lesson-${index}`,
          revision_id: revision.id,
          ordinal: index,
          active: false,
          review_status: "pending",
          updated_at: "2026-09-16T00:00:00Z",
        })
      }
      revision.learning_state = "ready"
      return { data: params.p_lessons.length, error: null }
    }
    throw Error("Unexpected RPC " + name)
  })
  const db = {
    rpc,
    from(table: string) {
      const filters: ((row: Record<string, any>) => boolean)[] = []
      let patch: Record<string, unknown> | undefined
      const run = () => {
        if (patch && table === "news_desk_lessons") {
          if (controls.failActivation)
            return { data: null, error: { message: "temporary failure" } }
          controls.beforeActivation?.()
        }
        const rows = tables[table].filter((row) => filters.every((filter) => filter(row)))
        if (patch) rows.forEach((row) => Object.assign(row, patch))
        return { data: rows.map((row) => ({ ...row })), error: null }
      }
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          filters.push((row) => row[key] === value)
          return query
        },
        in: (key: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[key]))
          return query
        },
        not: (key: string, _op: string, value: unknown) => {
          filters.push((row) => row[key] !== value)
          return query
        },
        order: () => query,
        limit: async () => run(),
        update: (value: Record<string, unknown>) => {
          patch = value
          return query
        },
        maybeSingle: async () => {
          const result = run()
          return { ...result, data: result.data?.[0] ?? null }
        },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
      }
      return query
    },
  }
  return { db: db as never, tables, revision, controls, rpc }
}

const pendingLesson = (overrides: Record<string, unknown> = {}) => ({
  ...proposal,
  id: "lesson",
  revision_id: "revision",
  active: false,
  review_status: "pending",
  updated_at: "2026-09-16T00:00:00Z",
  ...overrides,
})

beforeEach(() => {
  mocks.rules.mockReset().mockResolvedValue(rules)
  mocks.chat.mockReset().mockResolvedValue({
    choices: [
      { finish_reason: "stop", message: { content: JSON.stringify({ lessons: [proposal] }) } },
    ],
  })
})

describe("automatic reuse of saved desking corrections", () => {
  it("extracts with current owner rules and activates the lesson without another approval", async () => {
    const state = memoryDb()
    const { learnDeskRevision, loadDeskLessons } = await import("@/lib/news/desk/service")
    expect(await learnDeskRevision(state.db)).toMatchObject({ learned: 1, applied: 1 })
    expect(state.tables.news_desk_lessons[0]).toMatchObject({
      active: true,
      review_status: "reviewed",
    })
    expect(await loadDeskLessons(state.db)).toEqual([
      expect.objectContaining({ id: "lesson-0", instruction: proposal.instruction }),
    ])
    const request = mocks.chat.mock.calls[0][1]
    expect(JSON.parse(request.messages[1].content).rules).toEqual(rules)
    expect(request.messages[0].content).toContain("현재 규칙과 충돌하는 지침은 만들지 않는다")
  })

  it("recovers activation after a failure without regenerating or duplicating completed learning", async () => {
    const state = memoryDb()
    const { learnDeskRevision } = await import("@/lib/news/desk/service")
    state.controls.failActivation = true
    expect(await learnDeskRevision(state.db)).toMatchObject({
      learned: 1,
      activation_pending: true,
    })
    expect(state.revision.learning_state).toBe("ready")
    state.controls.failActivation = false
    expect(await learnDeskRevision(state.db)).toMatchObject({ skipped: true, applied: 1 })
    expect(state.tables.news_desk_lessons).toHaveLength(1)
    expect(state.tables.news_desk_lessons[0].active).toBe(true)
    expect(mocks.chat).toHaveBeenCalledTimes(1)
    expect(
      state.rpc.mock.calls.filter(([name]) => name === "complete_news_desk_learning")
    ).toHaveLength(1)
  })

  it("preserves an explicit disable and is idempotent for already applied lessons", async () => {
    const state = memoryDb([
      pendingLesson({ review_status: "reviewed" }),
      pendingLesson({ id: "active", active: true, review_status: "reviewed" }),
    ])
    state.revision.learning_state = "ready"
    expect(await applyPendingDeskLessons(state.db)).toEqual({ applied: 0, excluded: 0 })
    expect(state.tables.news_desk_lessons.map((row) => row.active)).toEqual([false, true])
  })

  it("does not overwrite a concurrent manual revision", async () => {
    const state = memoryDb([pendingLesson()])
    state.revision.learning_state = "ready"
    state.controls.beforeActivation = () =>
      Object.assign(state.tables.news_desk_lessons[0], {
        review_status: "reviewed",
        instruction: "직접 고친 기준",
        updated_at: "later",
      })
    expect(await applyPendingDeskLessons(state.db)).toEqual({ applied: 0, excluded: 0 })
    expect(state.tables.news_desk_lessons[0]).toMatchObject({
      active: false,
      instruction: "직접 고친 기준",
    })
  })

  it("excludes an invented change instead of teaching it or leaving it pending", async () => {
    const state = memoryDb([
      pendingLesson({ wrong: "원고에 없는 문장", correct: "새로 지어낸 문장" }),
    ])
    state.revision.learning_state = "ready"
    expect(await applyPendingDeskLessons(state.db)).toEqual({ applied: 0, excluded: 1 })
    expect(state.tables.news_desk_lessons[0]).toMatchObject({
      active: false,
      review_status: "reviewed",
    })
  })

  it("limits numeric corrections to source verification before automatic reuse", async () => {
    const state = memoryDb([
      pendingLesson({
        category: "number",
        wrong: "5000",
        correct: "5500",
        instruction: "모든 이적료를 5500만 유로로 바꾼다.",
      }),
    ])
    state.revision.learning_state = "ready"
    state.revision.before_draft = {
      ...before,
      article: "이번 선수의 이적료는 총액 5000만 유로로 알려졌다.",
    }
    state.revision.after_draft = {
      ...after,
      article: "이번 선수의 이적료는 총액 5500만 유로로 알려졌다.",
    }
    expect(await applyPendingDeskLessons(state.db)).toEqual({ applied: 1, excluded: 0 })
    expect(state.tables.news_desk_lessons[0]).toMatchObject({
      active: true,
      scope: "case",
      instruction: LESSON_INSTRUCTIONS.number,
    })
  })
})

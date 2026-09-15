import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { DeskWorkspace } from "@/app/admin/news-review/desk/workspace"
const mock = vi.hoisted(() => ({
  data: null as unknown,
  mutate: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("swr", () => ({
  default: (key: string) => ({
    data: key?.startsWith("/api/admin/news-desk/articles") ? { items: [], limit: 80 } : mock.data,
    error: null,
    isLoading: false,
    mutate: mock.mutate,
  }),
}))
const item = (id: string) => ({
  id,
  version: 0,
  status: "drafted",
  created_at: "2026-09-14T01:00:00Z",
  sources: [],
  research: null,
  draft: { title: "제목 " + id, article: "원문에서 확인한 충분한 길이의 기사 본문입니다." },
  original: { title: "제목 " + id, article: "원문에서 확인한 충분한 길이의 기사 본문입니다." },
  applied_lesson_ids: [],
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
describe("desk editing while the automatic queue refreshes", () => {
  it("keeps the selected article and unsaved text when a new draft arrives", async () => {
    const data = {
      items: [item("first")],
      isAdmin: false,
      lessons: [],
      revisions: [],
      settings: { enabled: true, pending_target: 6, daily_limit: 12 },
      counts: { pending: 1, reviewed: 0, lessons: 0, today: 1 },
    }
    mock.data = data
    const { rerender } = render(<DeskWorkspace />)
    fireEvent.change(screen.getByLabelText("기사 제목"), { target: { value: "편집 중인 내 제목" } })
    mock.data = { ...data, items: [item("new"), item("first")] }
    rerender(<DeskWorkspace />)
    expect((screen.getByLabelText("기사 제목") as HTMLTextAreaElement).value).toBe(
      "편집 중인 내 제목"
    )
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ version: 1, changed: true, revision_id: "revision" }))
    vi.stubGlobal("fetch", fetcher)
    fireEvent.click(screen.getByRole("button", { name: "수정 저장·AI 해석 보기" }))
    await waitFor(() => expect(fetcher).toHaveBeenCalled())
    const body = JSON.parse(fetcher.mock.calls[0][1].body)
    expect(body.id).toBe("first")
    expect(body.draft.title).toBe("편집 중인 내 제목")
    await waitFor(() => expect(screen.getByText(/수정을 저장했습니다/)).toBeTruthy())
    expect(screen.getByRole("tab", { name: "수정·학습 이력" }).getAttribute("aria-selected")).toBe(
      "true"
    )
    fireEvent.click(screen.getByRole("tab", { name: "기사 수정" }))
    expect((screen.getByLabelText("기사 제목") as HTMLTextAreaElement).value).toBe(
      "편집 중인 내 제목"
    )
  })
  it("retains the expert's interpretation edit during refresh and sends the original revision on confirmation", async () => {
    const lesson = {
      id: "lesson",
      revision_id: "revision",
      category: "style",
      field: "title",
      wrong: "원래 제목",
      correct: "수정 제목",
      explanation: "AI 해석: 중복을 줄였습니다.",
      instruction: "제목에서 불필요한 반복을 줄인다.",
      scope: "general",
      active: false,
      review_status: "pending",
      updated_at: "2026-09-15T01:00:00Z",
    }
    const data = {
      items: [item("first")],
      isAdmin: false,
      lessons: [lesson],
      revisions: [
        {
          id: "revision",
          item_id: "first",
          version: 1,
          learning_state: "ready",
          learning_attempts: 1,
          created_at: "2026-09-15T01:00:00Z",
          before_draft: item("first").original,
          after_draft: item("first").draft,
        },
      ],
      settings: { enabled: false, pending_target: 6, daily_limit: 12 },
      counts: { pending: 1, reviewed: 0, lessons: 0, today: 1 },
    }
    mock.data = data
    const { rerender } = render(<DeskWorkspace />)
    fireEvent.click(screen.getByRole("tab", { name: "수정·학습 이력" }))
    fireEvent.change(screen.getByLabelText("문장 표현 수정 이유"), {
      target: { value: "중복보다 핵심 뉴스의 우선순위를 바로잡은 교정입니다." },
    })
    fireEvent.click(screen.getByRole("tab", { name: "기사 수정" }))
    fireEvent.click(screen.getByRole("tab", { name: "수정·학습 이력" }))
    expect((screen.getByLabelText("문장 표현 수정 이유") as HTMLTextAreaElement).value).toBe(
      "중복보다 핵심 뉴스의 우선순위를 바로잡은 교정입니다."
    )
    mock.data = {
      ...data,
      lessons: [{ ...lesson, explanation: "다른 창에서 변경", updated_at: "2026-09-15T02:00:00Z" }],
    }
    rerender(<DeskWorkspace />)
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: "다른 창에서 해석을 변경했습니다." }, { status: 409 })
      )
    vi.stubGlobal("fetch", fetcher)
    fireEvent.click(screen.getByRole("button", { name: "이 해석으로 학습" }))
    await waitFor(() => expect(fetcher).toHaveBeenCalled())
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      active: true,
      expected: lesson.updated_at,
      explanation: "중복보다 핵심 뉴스의 우선순위를 바로잡은 교정입니다.",
    })
    await waitFor(() => expect(screen.getByText("다른 창에서 해석을 변경했습니다.")).toBeTruthy())
    expect((screen.getByLabelText("문장 표현 수정 이유") as HTMLTextAreaElement).value).toBe(
      "중복보다 핵심 뉴스의 우선순위를 바로잡은 교정입니다."
    )
  })
})

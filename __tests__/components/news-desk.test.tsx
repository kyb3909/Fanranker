import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { DeskWorkspace } from "@/app/admin/news-review/desk/workspace"
const mock = vi.hoisted(() => ({
  data: null as unknown,
  mutate: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("swr", () => ({
  default: (key: string | null) => ({
    data:
      key === null
        ? undefined
        : key.startsWith("/api/admin/news-desk/articles")
          ? { items: [], limit: 80 }
          : mock.data,
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
  origin: { kind: "draft", id, title: "제목 " + id, imported_at: "2026-09-14T01:00:00Z" },
})
beforeEach(() => {
  window.history.replaceState(null, "", "/admin/news-review/desk")
  vi.clearAllMocks()
  mock.mutate.mockReset().mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("moving through actual articles in the desk queue", () => {
  function queue() {
    const first = item("11111111-1111-4111-8111-111111111111")
    const second = item("22222222-2222-4222-8222-222222222222")
    const data = {
      items: [first, second],
      isAdmin: false,
      lessons: [],
      revisions: [],
      settings: { enabled: false, pending_target: 6, daily_limit: 12 },
      counts: { pending: 2, reviewed: 0, lessons: 0, today: 2 },
    }
    mock.data = data
    return { first, second, data }
  }

  it("saves the open article before advancing from the prepared queue, and can return to it", async () => {
    const { first, second, data } = queue()
    mock.mutate.mockImplementation(async () => {
      mock.data = {
        ...data,
        items: [
          second,
          {
            ...first,
            status: "reviewed",
            version: 1,
            draft: { ...first.draft, title: "교정한 제목" },
          },
        ],
      }
    })
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ version: 1, changed: true, applied_to_article: true }))
    vi.stubGlobal("fetch", fetcher)
    render(<DeskWorkspace />)
    expect(
      screen.getByRole("button", { name: /전체 기사 데스킹/ }).getAttribute("aria-expanded")
    ).toBe("false")
    fireEvent.change(screen.getByLabelText("기사 제목"), { target: { value: "교정한 제목" } })
    fireEvent.click(screen.getByRole("button", { name: "검수 완료·다음" }))
    await waitFor(() =>
      expect((screen.getByLabelText("기사 제목") as HTMLTextAreaElement).value).toBe(
        second.draft.title
      )
    )
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      id: first.id,
      status: "reviewed",
      draft: { title: "교정한 제목" },
    })
    expect(new URLSearchParams(window.location.search).get("item")).toBe(second.id)
    fireEvent.click(screen.getByRole("button", { name: "이전 기사" }))
    await waitFor(() =>
      expect((screen.getByLabelText("기사 제목") as HTMLTextAreaElement).value).toBe("교정한 제목")
    )
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("keeps unsaved text when the editor declines moving to another article", async () => {
    const { first } = queue()
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false)
    render(<DeskWorkspace />)
    fireEvent.change(screen.getByLabelText("기사 제목"), {
      target: { value: "아직 저장하지 않은 제목" },
    })
    fireEvent.click(screen.getByRole("button", { name: "다음 기사" }))
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce())
    expect((screen.getByLabelText("기사 제목") as HTMLTextAreaElement).value).toBe(
      "아직 저장하지 않은 제목"
    )
    expect(new URLSearchParams(window.location.search).get("item")).toBe(first.id)
  })

  it("disables navigation during saving and stays on the article if saving fails", async () => {
    const { first, second } = queue()
    let finish!: (response: Response) => void
    const fetcher = vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        finish = resolve
      })
    )
    vi.stubGlobal("fetch", fetcher)
    render(<DeskWorkspace />)
    fireEvent.change(screen.getByLabelText("기사 제목"), { target: { value: "충돌 중인 내 수정" } })
    fireEvent.click(screen.getByRole("button", { name: "검수 완료·다음" }))
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "다음 기사" }) as HTMLButtonElement).disabled
      ).toBe(true)
    )
    const other = screen.getByRole("button", {
      name: new RegExp(second.draft.title),
    }) as HTMLButtonElement
    expect(other.disabled).toBe(true)
    fireEvent.click(other)
    finish(Response.json({ error: "다른 창에서 먼저 수정했습니다." }, { status: 409 }))
    await waitFor(() => expect(screen.getByText("다른 창에서 먼저 수정했습니다.")).toBeTruthy())
    expect((screen.getByLabelText("기사 제목") as HTMLTextAreaElement).value).toBe(
      "충돌 중인 내 수정"
    )
    expect(new URLSearchParams(window.location.search).get("item")).toBe(first.id)
  })

  it("restores the article specified in the URL instead of opening the first pending item", () => {
    const { second } = queue()
    window.history.replaceState(null, "", "/admin/news-review/desk?item=" + second.id)
    render(<DeskWorkspace />)
    expect((screen.getByLabelText("기사 제목") as HTMLTextAreaElement).value).toBe(
      second.draft.title
    )
  })
})
describe("desk editing while the automatic queue refreshes", () => {
  it("does not put standalone practice articles into the actual article work queue", () => {
    const practice = { ...item("practice"), origin: undefined }
    mock.data = {
      items: [practice],
      isAdmin: false,
      lessons: [],
      revisions: [],
      settings: { enabled: false, pending_target: 6, daily_limit: 12 },
      counts: { pending: 1, reviewed: 0, lessons: 0, today: 1 },
    }
    render(<DeskWorkspace />)
    expect(screen.queryByLabelText("기사 제목")).toBeNull()
    expect(screen.getByText("실제 작성된 기사를 선택해 주세요")).toBeTruthy()
    expect(screen.queryByText(practice.draft.title)).toBeNull()
  })
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
    fireEvent.click(screen.getByRole("button", { name: "수정 저장·기사 반영" }))
    await waitFor(() => expect(fetcher).toHaveBeenCalled())
    const body = JSON.parse(fetcher.mock.calls[0][1].body)
    expect(body.id).toBe("first")
    expect(body.draft.title).toBe("편집 중인 내 제목")
    await waitFor(() => expect(screen.getByText(/수정을 저장했습니다/)).toBeTruthy())
    expect(screen.getByRole("tab", { name: "수정·학습 이력" }).getAttribute("aria-selected")).toBe(
      "false"
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

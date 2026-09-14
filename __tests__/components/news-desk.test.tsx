import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { DeskWorkspace } from "@/app/admin/news-review/desk/workspace"
const mock = vi.hoisted(() => ({
  data: null as unknown,
  mutate: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("swr", () => ({
  default: () => ({ data: mock.data, error: null, isLoading: false, mutate: mock.mutate }),
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
    fireEvent.click(screen.getByRole("button", { name: "수정 저장·학습" }))
    await waitFor(() => expect(fetcher).toHaveBeenCalled())
    const body = JSON.parse(fetcher.mock.calls[0][1].body)
    expect(body.id).toBe("first")
    expect(body.draft.title).toBe("편집 중인 내 제목")
    await waitFor(() => expect(screen.getByText(/수정을 저장했습니다/)).toBeTruthy())
    expect((screen.getByLabelText("기사 제목") as HTMLTextAreaElement).value).toBe(
      "편집 중인 내 제목"
    )
  })
})

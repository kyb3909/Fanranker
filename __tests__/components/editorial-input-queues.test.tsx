import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { PlayerNamingQueue } from "@/components/admin/player-naming-queue"
import { DeskArticlePicker } from "@/components/admin/desk-article-picker"

const mock = vi.hoisted(() => ({
  data: null as unknown,
  mutate: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("swr", () => ({
  default: () => ({
    data: mock.data,
    error: null,
    isLoading: false,
    isValidating: false,
    mutate: mock.mutate,
  }),
}))
const player = (id: string, name: string) => ({
  key: `squad:${id}`,
  kind: "squad",
  id,
  team_id: "arsenal",
  team_name: "Arsenal",
  name_en: name,
  name_kr: null,
  name_kr_draft: null,
  expected: "2026-09-15T00:00:00Z",
  given_name_ko: "",
  family_name_ko: "",
  short_name_ko: "",
})
beforeEach(() => {
  sessionStorage.clear()
  vi.clearAllMocks()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("bulk player naming worktable", () => {
  it("shows a different article canonical name and submits both original versions for review", async () => {
    mock.data = {
      items: [
        {
          ...player("1", "Bukayo Saka"),
          name_kr: "부카요 사카",
          news_id: "news-player",
          news_expected: "2026-09-15T01:00:00Z",
          news_name_kr: "부카요사카",
        },
      ],
      total: 1,
      page: 0,
      pageSize: 100,
    }
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ saved: ["squad:1"], failed: [], recheckPending: false }))
    vi.stubGlobal("fetch", fetcher)
    render(<PlayerNamingQueue />)
    fireEvent.change(screen.getByLabelText("선수 작업 범위"), { target: { value: "korean" } })
    expect(screen.getByText("기사 사전: 부카요사카")).toBeTruthy()
    fireEvent.change(screen.getByLabelText("Bukayo Saka 한글 전체 이름"), {
      target: { value: "부카요사카" },
    })
    fireEvent.click(screen.getByRole("button", { name: "입력한 1명 모두 저장" }))
    await waitFor(() => expect(fetcher).toHaveBeenCalled())
    expect(JSON.parse(fetcher.mock.calls[0][1].body).entries[0]).toMatchObject({
      name_kr: "부카요사카",
      expected: "2026-09-15T00:00:00Z",
      news_id: "news-player",
      news_expected: "2026-09-15T01:00:00Z",
    })
  })

  it("saves only changed players, removes successes and preserves failed row inputs", async () => {
    mock.data = {
      items: [player("1", "Bukayo Saka"), player("2", "Declan Rice"), player("3", "Kai Havertz")],
      total: 3,
      page: 0,
      pageSize: 100,
    }
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        saved: ["squad:1"],
        failed: [{ key: "squad:2", error: "다른 창에서 이름을 변경했습니다." }],
        recheckPending: false,
      })
    )
    vi.stubGlobal("fetch", fetcher)
    render(<PlayerNamingQueue />)
    fireEvent.change(screen.getByLabelText("Bukayo Saka 한글 전체 이름"), {
      target: { value: "부카요 사카" },
    })
    fireEvent.change(screen.getByLabelText("Declan Rice 한글 전체 이름"), {
      target: { value: "데클런 라이스" },
    })
    expect((screen.getByLabelText("입력할 선수 검색") as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "입력한 2명 모두 저장" }))
    await waitFor(() => expect(screen.getByText("다른 창에서 이름을 변경했습니다.")).toBeTruthy())
    const body = JSON.parse(fetcher.mock.calls[0][1].body)
    expect(body.entries.map((entry: { key: string }) => entry.key)).toEqual(["squad:1", "squad:2"])
    expect(body.entries[0]).toMatchObject({
      id: "1",
      team_id: "arsenal",
      expected: "2026-09-15T00:00:00Z",
      name_kr: "부카요 사카",
    })
    expect(screen.queryByLabelText("Bukayo Saka 한글 전체 이름")).toBeNull()
    expect((screen.getByLabelText("Declan Rice 한글 전체 이름") as HTMLInputElement).value).toBe(
      "데클런 라이스"
    )
    expect((screen.getByLabelText("Kai Havertz 한글 전체 이름") as HTMLInputElement).value).toBe("")
  })

  it("moves Enter to the same column next row while preserving Korean IME composition", () => {
    mock.data = {
      items: [player("1", "Saka"), player("2", "Rice")],
      total: 2,
      page: 0,
      pageSize: 100,
    }
    render(<PlayerNamingQueue />)
    const first = screen.getByLabelText("Saka 성"),
      second = screen.getByLabelText("Rice 성")
    first.focus()
    fireEvent.keyDown(first, { key: "Enter", isComposing: true })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(first, { key: "Enter" })
    expect(document.activeElement).toBe(second)
    fireEvent.keyDown(second, { key: "Enter", shiftKey: true })
    expect(document.activeElement).toBe(first)
  })

  it("requires explicit adoption of suggested Korean spelling and never guesses name parts", () => {
    mock.data = {
      items: [{ ...player("1", "Bukayo Saka"), name_kr_draft: "부카요 사카" }],
      total: 1,
      page: 0,
      pageSize: 100,
    }
    render(<PlayerNamingQueue />)
    expect((screen.getByLabelText("Bukayo Saka 한글 전체 이름") as HTMLInputElement).value).toBe("")
    fireEvent.click(screen.getByRole("button", { name: "제안 적용: 부카요 사카" }))
    expect((screen.getByLabelText("Bukayo Saka 한글 전체 이름") as HTMLInputElement).value).toBe(
      "부카요 사카"
    )
    expect((screen.getByLabelText("Bukayo Saka 성") as HTMLInputElement).value).toBe("")
    expect((screen.getByLabelText("Bukayo Saka 이후 표기") as HTMLInputElement).value).toBe("")
  })

  it("keeps only the unsaved batch if a restored session spans more than 100 players", async () => {
    const restored = Array.from({ length: 101 }, (_, index) =>
      player(String(index), `Player ${index}`)
    )
    sessionStorage.setItem(
      "admin-player-naming-queue-v1",
      JSON.stringify(
        Object.fromEntries(
          restored.map((row, index) => [
            row.key,
            {
              row,
              values: {
                name_kr: `선수 ${index}`,
                given_name_ko: "",
                family_name_ko: "",
                short_name_ko: "",
              },
            },
          ])
        )
      )
    )
    mock.data = { items: [], total: 0, page: 0, pageSize: 100 }
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          saved: restored.slice(0, 100).map((row) => row.key),
          failed: [],
          recheckPending: false,
        })
      )
      .mockRejectedValueOnce(Error("연결이 끊겼습니다."))
    vi.stubGlobal("fetch", fetcher)
    render(<PlayerNamingQueue />)
    fireEvent.click(await screen.findByRole("button", { name: "입력한 101명 모두 저장" }))
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("100명은 저장했습니다")
    )
    expect(fetcher.mock.calls.map((call) => JSON.parse(call[1].body).entries.length)).toEqual([
      100, 1,
    ])
    expect(screen.queryByLabelText("Player 0 한글 전체 이름")).toBeNull()
    expect((screen.getByLabelText("Player 100 한글 전체 이름") as HTMLInputElement).value).toBe(
      "선수 100"
    )
  })
})

describe("actual article picker", () => {
  const articles = {
    items: [
      {
        kind: "post",
        id: "published-id",
        title: "지금 올라온 아스널 기사",
        created_at: "2026-09-15T00:00:00Z",
      },
      {
        kind: "draft",
        id: "draft-id",
        title: "발행을 기다리는 기사",
        created_at: "2026-09-15T00:00:00Z",
      },
    ],
    limit: 80,
  }
  it("opens a published article by identity and resumes its existing desk item", async () => {
    mock.data = articles
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ id: "existing-desk", existing: true }))
    const onChoose = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("fetch", fetcher)
    render(<DeskArticlePicker onChoose={onChoose} disabled={false} />)
    fireEvent.click(screen.getByRole("button", { name: /지금 올라온 아스널 기사/ }))
    await waitFor(() => expect(onChoose).toHaveBeenCalledWith("existing-desk"))
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ kind: "post", id: "published-id" })
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("이어서 수정하세요")
    )
    expect(
      screen
        .getByRole("link", { name: "지금 올라온 아스널 기사 공개 기사 보기" })
        .getAttribute("href")
    ).toBe("/post/published-id")
  })

  it("protects unsaved desk edits while keeping published source links usable", () => {
    mock.data = articles
    const onChoose = vi.fn().mockResolvedValue(undefined)
    render(<DeskArticlePicker onChoose={onChoose} disabled />)
    const choice = screen.getByRole("button", {
      name: /지금 올라온 아스널 기사/,
    }) as HTMLButtonElement
    expect(choice.disabled).toBe(true)
    fireEvent.click(choice)
    expect(onChoose).not.toHaveBeenCalled()
    expect(
      screen.getByRole("link", { name: "지금 올라온 아스널 기사 공개 기사 보기" })
    ).toBeTruthy()
  })

  it("keeps the current editor when the user starts editing during an article import", async () => {
    mock.data = articles
    let finish!: (response: Response) => void
    const fetcher = vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        finish = resolve
      })
    )
    vi.stubGlobal("fetch", fetcher)
    const onChoose = vi.fn().mockResolvedValue(undefined)
    const view = render(<DeskArticlePicker onChoose={onChoose} disabled={false} />)
    fireEvent.click(screen.getByRole("button", { name: /지금 올라온 아스널 기사/ }))
    view.rerender(<DeskArticlePicker onChoose={onChoose} disabled />)
    finish(Response.json({ id: "imported-desk", existing: false }))
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("편집기 이동을 보류")
    )
    expect(onChoose).not.toHaveBeenCalled()
  })
})

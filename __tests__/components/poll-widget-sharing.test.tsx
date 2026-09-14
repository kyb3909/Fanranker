import { beforeEach, afterEach, it, expect, vi } from "vitest"
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { SWRConfig } from "swr"
const m = vi.hoisted(() => ({ userId: "member" as string | null, fetch: vi.fn() }))
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ isLoaded: true, userId: m.userId }) }))
import { PollWidget } from "@/components/sidebar/poll-widget"
const entry = (voted = false) => ({
  poll: {
    id: "poll",
    question: "오늘의 선택",
    options: [
      { key: "a", label: "A팀" },
      { key: "b", label: "B팀" },
    ],
    allowReason: false,
  },
  results: { a: 2, b: 1 },
  total: 3,
  myVote: voted ? { optionKey: "a", reason: null } : null,
})
beforeEach(() => {
  m.userId = "member"
  m.fetch.mockReset()
  m.fetch.mockImplementation(async () => ({
    ok: true,
    json: async () => ({ polls: [entry(m.userId === "member")] }),
  }))
  vi.stubGlobal("fetch", m.fetch)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
const View = () => (
  <>
    <PollWidget />
    <PollWidget />
  </>
)
it("two mounted responsive widgets share one active-poll request", async () => {
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 2000 }}>
      <View />
    </SWRConfig>
  )
  await waitFor(() => expect(screen.getAllByText("오늘의 선택")).toHaveLength(2))
  expect(m.fetch).toHaveBeenCalledTimes(1)
})
it("changing identity fetches an isolated vote state and shares the new vote", async () => {
  const cache = new Map()
  const renderTree = () => (
    <SWRConfig value={{ provider: () => cache, dedupingInterval: 2000 }}>
      <View />
    </SWRConfig>
  )
  const view = render(renderTree())
  await waitFor(() => expect(screen.getAllByText("오늘의 선택")).toHaveLength(2))
  m.userId = "other"
  view.rerender(renderTree())
  await waitFor(() => expect(screen.getAllByRole("button", { name: "A팀" })).toHaveLength(2))
  expect(m.fetch).toHaveBeenCalledTimes(2)
  m.fetch.mockImplementation(async () => ({
    ok: true,
    json: async () => ({
      results: { a: 3, b: 1 },
      total: 4,
      myVote: { optionKey: "a", reason: null },
    }),
  }))
  fireEvent.click(screen.getAllByRole("button", { name: "A팀" })[0])
  await waitFor(() => expect(screen.queryAllByRole("button", { name: "A팀" })).toHaveLength(0))
  expect(m.fetch).toHaveBeenCalledTimes(3)
})

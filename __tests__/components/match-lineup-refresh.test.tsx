import { afterEach, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { MatchLineup } from "@/components/match/match-lineup"
import { previewLineup } from "@/app/dev/match-preview/fixtures"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
const ready = (label: string, projected = false) => ({
  ...previewLineup,
  projected,
  kickoff: new Date(Date.now() + 60 * 60_000).toISOString(),
  home: {
    ...previewLineup.home,
    starters: previewLineup.home.starters.map((p, i) => (i ? p : { ...p, label })),
  },
})
it("경기 이동은 이전 확정 명단을 유지하지 않는다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "pending" }) })
  )
  const lineup = ready("이전 경기 선수")
  const view = render(
    <MatchLineup gameId="first" matchTime={lineup.kickoff} initial={lineup} alwaysOpen />
  )
  view.rerender(<MatchLineup gameId="second" matchTime={lineup.kickoff} alwaysOpen />)
  await act(async () => {})
  expect(screen.queryByText("이전 경기 선수")).toBeNull()
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("gameId=second"), expect.anything())
})
it("열린 화면은 새 서버 명단과 확정 배지를 함께 반영한다", () => {
  const before = ready("이전 선수"),
    after = ready("새 선수")
  const props = { gameId: "test", matchTime: before.kickoff, alwaysOpen: true }
  const view = render(<MatchLineup {...props} initial={before} />)
  view.rerender(<MatchLineup {...props} initial={after} />)
  expect(screen.getByText("새 선수")).toBeVisible()
  expect(screen.queryByText("이전 선수")).toBeNull()
  expect(screen.getByText(/확정 라인업/)).toBeVisible()
})
it("대기 중 서버 확정 명단이 도착하면 대기 화면을 교체한다", async () => {
  const lineup = ready("확정 선수")
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "pending" }) })
  )
  const props = { gameId: "test", matchTime: lineup.kickoff, alwaysOpen: true }
  const view = render(<MatchLineup {...props} />)
  await act(async () => {})
  view.rerender(<MatchLineup {...props} initial={lineup} />)
  expect(screen.getByText("확정 선수")).toBeVisible()
})
it("예상 ready는 재조회하고 확정 명단을 받은 뒤에만 멈춘다", async () => {
  vi.useFakeTimers()
  const predicted = ready("예상 선수", true),
    confirmed = ready("확정 선수")
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => predicted })
    .mockResolvedValue({ ok: true, json: async () => confirmed })
  vi.stubGlobal("fetch", fetcher)
  render(<MatchLineup gameId="test" matchTime={predicted.kickoff} alwaysOpen />)
  await act(async () => {})
  expect(screen.getByText(/예상 라인업/)).toBeVisible()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_001)
  })
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(screen.getByText("확정 선수")).toBeVisible()
  expect(screen.queryByText(/예상 라인업/)).toBeNull()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(180_000)
  })
  expect(fetcher).toHaveBeenCalledTimes(2)
})
it("일시 오류·none에서도 재시도하며 기존 명단을 지우지 않는다", async () => {
  vi.useFakeTimers()
  const predicted = ready("보존 선수", true)
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error("timeout"))
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValue({ ok: true, json: async () => ({ status: "none" }) })
  vi.stubGlobal("fetch", fetcher)
  render(<MatchLineup gameId="test" matchTime={predicted.kickoff} initial={predicted} alwaysOpen />)
  await act(async () => {})
  await act(async () => {
    await vi.advanceTimersByTimeAsync(120_001)
  })
  expect(fetcher).toHaveBeenCalledTimes(3)
  expect(screen.getByText("보존 선수")).toBeVisible()
})
it("늦게 도착한 예상 서버 응답이 확정 명단을 되돌리지 않는다", () => {
  const confirmed = ready("확정 유지")
  const props = { gameId: "test", matchTime: confirmed.kickoff, alwaysOpen: true }
  const view = render(<MatchLineup {...props} initial={confirmed} />)
  view.rerender(<MatchLineup {...props} initial={ready("오래된 예상", true)} />)
  expect(screen.getByText("확정 유지")).toBeVisible()
  expect(screen.queryByText("오래된 예상")).toBeNull()
})

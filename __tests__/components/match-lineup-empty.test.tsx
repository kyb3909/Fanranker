import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { MatchLineup } from "@/components/match/match-lineup"
import { previewLineup } from "@/app/dev/match-preview/fixtures"

const NOW = new Date("2026-09-16T14:00:00Z").getTime()
const kickoffAt = (hours: number) => new Date(NOW + hours * 3600_000).toISOString()
const pending = { ok: true, json: async () => ({ status: "pending" }) }

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(pending))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it.each(["none", "pending"] as const)(
  "재조회 기한이 지난 %s 경기는 공개 예정으로 안내하거나 요청하지 않는다",
  async (status) => {
    const matchTime = kickoffAt(-49)
    render(
      <MatchLineup
        gameId="old"
        matchTime={matchTime}
        initial={status === "none" ? { status } : { status, kickoff: matchTime }}
        alwaysOpen
      />
    )
    await act(async () => {})
    expect(screen.getByText("이 경기의 라인업을 제공하지 못하고 있습니다")).toBeVisible()
    expect(screen.queryByText(/공개됩니다|자동으로 다시/)).not.toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  }
)

it("킥오프가 지난 경기의 빈 응답은 미래 발표나 실제 경기 종료로 단정하지 않는다", async () => {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ status: "none" }),
  } as Response)
  render(<MatchLineup gameId="past" matchTime={kickoffAt(-3)} alwaysOpen />)
  await act(async () => {})
  expect(screen.getByText("이 경기의 라인업을 아직 확인할 수 없습니다")).toBeVisible()
  expect(screen.queryByText(/공개됩니다|경기 종료|불러오지 못했습니다/)).not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(1)
})

it("이른 예정 경기는 호출 없이 발표 시점을 안내하고 킥오프를 지나면 문구를 바꾼다", async () => {
  render(<MatchLineup gameId="future" matchTime={kickoffAt(3)} alwaysOpen />)
  await act(async () => {})
  expect(screen.getByText("라인업은 보통 킥오프 약 1시간 전에 공개됩니다")).toBeVisible()
  expect(fetch).not.toHaveBeenCalled()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2 * 3600_000)
  })
  expect(screen.getByText("아직 확인된 라인업이 없습니다")).toBeVisible()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3600_000)
  })
  expect(screen.getByText("이 경기의 라인업을 아직 확인할 수 없습니다")).toBeVisible()
})

it.each(["network", "http"])(
  "%s 오류는 재시도를 안내하고 정상 빈 응답을 받은 뒤 오류 표시를 해제한다",
  async (failure) => {
    const fetcher = vi.mocked(fetch)
    if (failure === "network") fetcher.mockRejectedValueOnce(new Error("offline"))
    else fetcher.mockResolvedValueOnce({ ok: false } as Response)
    render(<MatchLineup gameId="retry" matchTime={kickoffAt(0.5)} alwaysOpen />)
    await act(async () => {})
    expect(screen.getByText("라인업을 불러오지 못했습니다")).toBeVisible()
    expect(screen.getByText("잠시 후 자동으로 다시 확인합니다")).toBeVisible()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(screen.getByText("아직 확인된 라인업이 없습니다")).toBeVisible()
    expect(screen.queryByText(/불러오지 못했습니다|자동으로 다시/)).not.toBeInTheDocument()
  }
)

it("재조회 기한을 지나면 실패 상태의 재시도 약속을 종료한다", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("offline"))
  const matchTime = new Date(NOW - 48 * 3600_000 + 30_000).toISOString()
  render(<MatchLineup gameId="expires" matchTime={matchTime} alwaysOpen />)
  await act(async () => {})
  expect(screen.getByText("잠시 후 자동으로 다시 확인합니다")).toBeVisible()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(120_000)
  })
  expect(screen.getByText("이 경기의 라인업을 제공하지 못하고 있습니다")).toBeVisible()
  expect(screen.queryByText(/자동으로 다시/)).not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(1)
})

it("지난 경기에도 저장된 확정 명단이 있으면 빈 안내 대신 그대로 보여준다", () => {
  const lineup = { ...previewLineup, projected: false, kickoff: kickoffAt(-72) }
  render(<MatchLineup gameId="stored" matchTime={lineup.kickoff} initial={lineup} alwaysOpen />)
  expect(screen.getByText(/확정 라인업/)).toBeVisible()
  expect(screen.queryByText(/제공하지 못하고|공개됩니다/)).not.toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()
})

it("경기 이동 후에는 이전 조회 오류를 가져오지 않는다", async () => {
  vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"))
  const view = render(<MatchLineup gameId="failed" matchTime={kickoffAt(0.5)} alwaysOpen />)
  await act(async () => {})
  expect(screen.getByText("라인업을 불러오지 못했습니다")).toBeVisible()
  view.rerender(<MatchLineup gameId="future" matchTime={kickoffAt(3)} alwaysOpen />)
  await act(async () => {})
  expect(screen.getByText("라인업은 보통 킥오프 약 1시간 전에 공개됩니다")).toBeVisible()
  expect(screen.queryByText(/불러오지 못했습니다|자동으로 다시/)).not.toBeInTheDocument()
})

it("킥오프가 잘못됐으면 발표 시각이나 재시도를 약속하지 않는다", async () => {
  render(<MatchLineup gameId="unknown" matchTime="invalid" alwaysOpen />)
  await act(async () => {})
  expect(screen.getByText("이 경기의 라인업을 아직 확인할 수 없습니다")).toBeVisible()
  expect(screen.queryByText(/공개됩니다|자동으로 다시|KST/)).not.toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()
})

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { SWRConfig } from "swr"
import { PlayerDictionaryCandidates } from "@/components/admin/player-dictionary"

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }))
const data = {
  dictionarySize: 1002,
  candidates: [{ name: "새선수", hits: 2, samples: ["검수 기사"], suggestions: [] }],
}
function renderCandidates() {
  return render(
    <SWRConfig
      value={{ provider: () => new Map(), shouldRetryOnError: false, dedupingInterval: 0 }}
    >
      <PlayerDictionaryCandidates />
    </SWRConfig>
  )
}
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("player dictionary loading states", () => {
  it("처음 조회가 실패하면 빈 결과 대신 오류와 재시도를 보여준다", async () => {
    renderCandidates()
    fireEvent.click(screen.getByText("표기 사전 후보"))
    expect(await screen.findByRole("alert")).toHaveTextContent("불러오지 못했습니다")
    expect(screen.queryByText("막힌 이름이 없습니다.")).not.toBeInTheDocument()
    expect(screen.queryByText(/0건 등재됨/)).not.toBeInTheDocument()
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => data } as Response)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "다시 시도" })))
    expect(await screen.findByText("새선수")).toBeVisible()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("갱신 실패 시 기존 후보를 보존하고 갱신 전 등재를 막는다", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => data } as Response)
    const cache = new Map()
    const view = render(
      <SWRConfig value={{ provider: () => cache, shouldRetryOnError: false, dedupingInterval: 0 }}>
        <PlayerDictionaryCandidates />
      </SWRConfig>
    )
    fireEvent.click(screen.getByText("표기 사전 후보"))
    expect(await screen.findByText("새선수")).toBeVisible()
    // Remount with the same cache: SWR preserves the previous data while revalidating.
    view.unmount()
    render(
      <SWRConfig
        value={{
          provider: () => cache,
          shouldRetryOnError: false,
          dedupingInterval: 0,
          revalidateOnMount: true,
        }}
      >
        <PlayerDictionaryCandidates />
      </SWRConfig>
    )
    fireEvent.click(screen.getByText("표기 사전 후보"))
    expect(await screen.findByRole("alert")).toHaveTextContent("이전 조회 결과를 표시합니다")
    expect(screen.getByText("새선수")).toBeVisible()
    expect(screen.getByRole("button", { name: "등재" })).toBeDisabled()
    expect(screen.queryByText("막힌 이름이 없습니다.")).not.toBeInTheDocument()
  })

  it("조회 대기 중에는 후보가 없다고 단정하지 않는다", () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}))
    renderCandidates()
    expect(screen.getByRole("status", { hidden: true })).toHaveTextContent("불러오는 중")
    expect(screen.queryByText("막힌 이름이 없습니다.")).not.toBeInTheDocument()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { NewsDictionaryManager } from "@/components/admin/news-dictionary"
import { TrainingCenter } from "@/components/admin/training-center"

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
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

function training() {
  return {
    settings: {
      publish_enabled: false,
      effective_enabled: false,
      per_run_cap: 2,
      daily_job_limit: 12,
      version: 1,
      updated_at: "2026-09-15T00:00:00Z",
    },
    rules: [],
    lessons: [],
    items: [],
    jobs: [] as unknown[],
    aggSources: [],
    aggHistory: [],
    correctionIds: [],
    summary: { count: 0, baselineClean: 0, learnedClean: 0, improved: 0 },
    modelReady: true,
  }
}
function renderManualDictionary() {
  const view = render(<NewsDictionaryManager />)
  fireEvent.click(screen.getByRole("button", { name: "검색·직접 등록" }))
  return view
}
beforeEach(() => {
  sessionStorage.clear()
  window.history.replaceState(null, "", "/")
  vi.clearAllMocks()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("dictionary intensive-entry session", () => {
  it("preserves a conflicting name and aliases through search and reload", async () => {
    mock.data = { entries: [], total: 0 }
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: "이름이나 별칭이 다른 항목과 겹칩니다." }, { status: 409 })
      )
    vi.stubGlobal("fetch", fetcher)
    const view = renderManualDictionary()
    fireEvent.change(screen.getByLabelText(/^첫 등장 표기/), { target: { value: "부카요 사카" } })
    fireEvent.change(screen.getByLabelText(/^별칭/), { target: { value: "Saka\n사카" } })
    fireEvent.click(screen.getByRole("button", { name: "저장하고 다음 추가" }))
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("다른 항목과 겹칩니다")
    )
    fireEvent.click(screen.getByRole("button", { name: "이 이름으로 중복 검색" }))
    expect((screen.getByLabelText("이름 또는 별칭 검색") as HTMLInputElement).value).toBe(
      "부카요 사카"
    )
    expect((screen.getByLabelText(/^별칭/) as HTMLTextAreaElement).value).toBe("Saka\n사카")
    view.unmount()
    renderManualDictionary()
    await waitFor(() =>
      expect((screen.getByLabelText(/^첫 등장 표기/) as HTMLInputElement).value).toBe("부카요 사카")
    )
    expect((screen.getByLabelText(/^별칭/) as HTMLTextAreaElement).value).toBe("Saka\n사카")
  })

  it("saves deduplicated aliases and prepares the same category for the next entry", async () => {
    mock.data = { entries: [], total: 0 }
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ ok: true, id: "new-id", recheckPending: false }))
    vi.stubGlobal("fetch", fetcher)
    renderManualDictionary()
    fireEvent.change(screen.getByLabelText("등록 분류"), { target: { value: "team" } })
    fireEvent.change(screen.getByLabelText(/^대표 표기/), { target: { value: "아스널" } })
    fireEvent.change(screen.getByLabelText(/^별칭/), {
      target: { value: " Arsenal \nArsenal|아스날" },
    })
    fireEvent.click(screen.getByRole("button", { name: "저장하고 다음 추가" }))
    await waitFor(() => expect(screen.getByText(/‘아스널’ 저장 완료/)).toBeTruthy())
    expect(JSON.parse(fetcher.mock.calls[0][1].body).entry.surfaces).toEqual(["Arsenal", "아스날"])
    expect((screen.getByLabelText("등록 분류") as HTMLSelectElement).value).toBe("team")
    expect((screen.getByLabelText(/^대표 표기/) as HTMLInputElement).value).toBe("")
    expect(sessionStorage.getItem("admin-news-notation-draft-v1")).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/^대표 표기/)))
  })

  it("never infers a surname from a full name and uses only explicitly entered name parts", async () => {
    mock.data = { entries: [], total: 0 }
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true, id: "saka" }))
    vi.stubGlobal("fetch", fetcher)
    renderManualDictionary()
    fireEvent.change(screen.getByLabelText(/^첫 등장 표기/), { target: { value: "부카요 사카" } })
    expect((screen.getByLabelText(/^한국어 성/) as HTMLInputElement).value).toBe("")
    expect((screen.getByLabelText(/^이후 표기/) as HTMLInputElement).value).toBe("")
    fireEvent.change(screen.getByLabelText(/^한국어 이름/), { target: { value: "부카요" } })
    fireEvent.change(screen.getByLabelText(/^한국어 성/), { target: { value: "사카" } })
    fireEvent.blur(screen.getByLabelText(/^한국어 성/))
    expect((screen.getByLabelText(/^이후 표기/) as HTMLInputElement).value).toBe("사카")
    fireEvent.click(screen.getByRole("button", { name: "저장하고 다음 추가" }))
    await waitFor(() => expect(fetcher).toHaveBeenCalled())
    expect(JSON.parse(fetcher.mock.calls[0][1].body).entry).toMatchObject({
      preferred_ko: "부카요 사카",
      given_name_ko: "부카요",
      family_name_ko: "사카",
      short_name_ko: "사카",
    })
  })

  it("preserves a custom subsequent name and clears person-only values from a team save", async () => {
    mock.data = { entries: [], total: 0 }
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true, id: "team" }))
    vi.stubGlobal("fetch", fetcher)
    renderManualDictionary()
    fireEvent.change(screen.getByLabelText(/^첫 등장 표기/), { target: { value: "손흥민" } })
    fireEvent.change(screen.getByLabelText(/^한국어 이름/), { target: { value: "흥민" } })
    fireEvent.change(screen.getByLabelText(/^이후 표기/), { target: { value: "손흥민" } })
    fireEvent.change(screen.getByLabelText(/^한국어 성/), { target: { value: "손" } })
    fireEvent.blur(screen.getByLabelText(/^한국어 성/))
    expect((screen.getByLabelText(/^이후 표기/) as HTMLInputElement).value).toBe("손흥민")
    fireEvent.change(screen.getByLabelText("등록 분류"), { target: { value: "team" } })
    expect(screen.queryByLabelText(/^한국어 성/)).toBeNull()
    fireEvent.change(screen.getByLabelText(/^대표 표기/), { target: { value: "아스널" } })
    fireEvent.click(screen.getByRole("button", { name: "저장하고 다음 추가" }))
    await waitFor(() => expect(fetcher).toHaveBeenCalled())
    expect(JSON.parse(fetcher.mock.calls[0][1].body).entry).toMatchObject({
      preferred_ko: "아스널",
      given_name_ko: "",
      family_name_ko: "",
      short_name_ko: "",
    })
  })
})

describe("learning workbench continuity", () => {
  it("keeps an unfinished editorial rule when switching panels and polling", () => {
    const data = training()
    mock.data = data
    const view = render(<TrainingCenter />)
    fireEvent.click(screen.getByRole("button", { name: "편집 원칙" }))
    fireEvent.click(screen.getByRole("button", { name: "원칙 추가" }))
    fireEvent.change(screen.getByLabelText("원칙 이름"), {
      target: { value: "내가 쓰는 제목 기준" },
    })
    fireEvent.change(screen.getByLabelText(/^적용할 기준/), {
      target: { value: "협상 중인 내용을 이적 확정으로 단정하지 않는다." },
    })
    fireEvent.click(screen.getByRole("button", { name: "비교 평가" }))
    mock.data = { ...data, jobs: [] }
    view.rerender(<TrainingCenter />)
    fireEvent.click(screen.getByRole("button", { name: "편집 원칙" }))
    expect((screen.getByLabelText("원칙 이름") as HTMLInputElement).value).toBe(
      "내가 쓰는 제목 기준"
    )
    expect((screen.getByLabelText(/^적용할 기준/) as HTMLTextAreaElement).value).toContain(
      "협상 중인"
    )
  })

  it("preserves unsaved publishing limits and exposes a concurrent version change", () => {
    const data = training()
    mock.data = data
    const view = render(<TrainingCenter />)
    fireEvent.click(screen.getByRole("button", { name: "발행 설정" }))
    fireEvent.change(screen.getByLabelText("자동 실행 한 번에 발행할 최대 기사 수"), {
      target: { value: "4" },
    })
    mock.data = { ...data, settings: { ...data.settings, per_run_cap: 1, version: 2 } }
    view.rerender(<TrainingCenter />)
    expect(
      (screen.getByLabelText("자동 실행 한 번에 발행할 최대 기사 수") as HTMLInputElement).value
    ).toBe("4")
    expect(screen.getByRole("alert").textContent).toContain("다른 창에서 설정이 변경")
    expect(
      (screen.getByRole("button", { name: "자동발행·실행 한도 저장" }) as HTMLButtonElement)
        .disabled
    ).toBe(true)
  })

  it("requires reviewing both comparison drafts and saves the editor's actual errors", async () => {
    const data = training()
    data.jobs = [
      {
        id: "comparison",
        kind: "news_evaluation",
        status: "completed",
        created_at: "2026-09-15T00:00:00Z",
        payload: { sources: [] },
        error: null,
        review: null,
        review_version: 0,
        result: {
          baseline: {
            title: "이적 확정",
            article: "원문은 협상 중이지만 확정됐다고 작성한 초안입니다.",
          },
          learned: {
            title: "이적 협상 중",
            article: "원문에 맞게 아직 협상 중이라고 작성한 기사입니다.",
          },
          baseline_quality: { pass: true, reasons: [] },
          learned_quality: { pass: true, reasons: [] },
          rules: [],
          lessons: [],
        },
      },
    ]
    mock.data = data
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true }))
    vi.stubGlobal("fetch", fetcher)
    render(<TrainingCenter />)
    fireEvent.click(screen.getByRole("button", { name: "비교 평가" }))
    const save = screen.getByRole("button", { name: "비교 평가 저장" }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    fireEvent.click(
      within(screen.getByRole("region", { name: "기본 초안" })).getByLabelText("확신 수준")
    )
    fireEvent.click(screen.getByLabelText(/^기본 초안 확인 완료/))
    fireEvent.click(screen.getByLabelText(/^학습 적용 초안 확인 완료/))
    fireEvent.change(screen.getByLabelText("더 나은 초안"), { target: { value: "learned" } })
    fireEvent.click(save)
    await waitFor(() => expect(fetcher).toHaveBeenCalled())
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      action: "review",
      id: "comparison",
      version: 0,
      review: { baseline_errors: ["certainty"], learned_errors: [], preference: "learned" },
    })
  })
})

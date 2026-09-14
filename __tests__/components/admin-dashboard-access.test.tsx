import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import AdminControlCenterPage from "@/app/admin/page"
import { ControlCenter } from "@/app/admin/_control-center/control-center"
import type { ControlCenterResponse } from "@/app/admin/_control-center/types"
import { TickerModPanel } from "@/app/admin/_dashboard/widgets"
import type { DashboardData } from "@/app/admin/_dashboard/data"
import type { WorkItem } from "@/lib/admin/control-center"

// Keep the real server page, widgets, and control center. Their auth/data/SWR
// and unrelated budget-card boundary are replaced; all fetches are local mocks.
const mocks = vi.hoisted(() => ({
  getStaffRole: vi.fn(),
  loadDashboardData: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
  useSWR: vi.fn(),
}))

vi.mock("@/lib/admin/roles", () => ({
  getStaffRole: mocks.getStaffRole,
  requireStaff: mocks.getStaffRole,
}))
vi.mock("@/app/admin/_dashboard/data", () => ({
  loadDashboardData: mocks.loadDashboardData,
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock("@/hooks/use-toast", () => ({ toast: mocks.toast }))
vi.mock("swr", () => ({ default: mocks.useSWR }))
vi.mock("@/app/admin/_dashboard/report-budget-card", () => ({
  ReportBudgetCard: ({ canManage }: { canManage: boolean }) => (
    <div data-testid="report-budget" data-can-manage={String(canManage)} />
  ),
}))

function dashboardFixture(): DashboardData {
  return {
    news: [
      {
        id: "news-fixture",
        title: "검수할 뉴스",
        originalTitle: "Review fixture",
        body: "뉴스 초안 본문",
        sourceText: "원문 근거",
        image: null,
        breaking: false,
        credibility: 5,
        importance: 3,
        expiresAt: new Date(Date.now() + 12 * 3600_000).toISOString(),
      },
    ],
    newsTotal: 1,
    dictCandidates: 1,
    blockedPlayers: [
      { playerEn: "New Player", playerKrDraft: "신규 선수", count: 2, sample: "등재 근거" },
    ],
    blockedUnparsed: 0,
    squadBacklog: 1,
    squadPreview: [
      {
        nameEn: "Squad Player",
        nameKrDraft: "스쿼드 선수",
        teamKr: "아스널",
        teamId: "team-fixture",
        playerSlug: "squad-player",
      },
    ],
    ticker: { recent: [{ id: "ticker-fixture", title: "확인할 티커" }] },
    participation: [{ label: "글", today: 2, yesterday: 1 }],
    activeGames: 1,
    dailyRound: { roundNum: 1, closeAt: null },
  }
}

async function renderPage(role: "admin" | "editor") {
  mocks.getStaffRole.mockResolvedValue(role)
  const tree = await AdminControlCenterPage()
  const [controlCenter, boundary] = tree.props.children
  const panels = boundary.props.children
  // Resolve the real async server child before mounting its client widgets.
  return render(
    <>
      {controlCenter}
      {await panels.type(panels.props)}
    </>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.useSWR.mockReturnValue({ data: undefined, mutate: vi.fn() })
  mocks.loadDashboardData.mockResolvedValue(dashboardFixture())
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ updated: 1 }) })
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("admin dashboard capabilities", () => {
  it("returns the control center while slower dashboard data is still pending", async () => {
    mocks.getStaffRole.mockResolvedValue("admin")
    const pending = new Promise<ReturnType<typeof dashboardFixture>>(() => {})
    mocks.loadDashboardData.mockReturnValue(pending)
    const tree = await AdminControlCenterPage()
    expect(tree.props.children[0].type).toBe(ControlCenter)
    expect(tree.props.children[1].props.children.props.data).toBe(pending)
  })
  it("editor keeps staff review work and ticker reads without admin-only controls", async () => {
    await renderPage("editor")

    expect(screen.getByText("확인할 티커")).toBeVisible()
    expect(screen.queryByRole("button", { name: "즉시 삭제" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "선수단 사전 전체 열기 →" })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "검수 페이지 (편집·사가 연결) →" })).toHaveAttribute(
      "href",
      "/admin/news-review"
    )
    expect(screen.getByRole("button", { name: "승인" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "등재" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "발행 (P)" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "반려 (R)" })).toBeEnabled()
    expect(screen.getByTestId("report-budget")).toHaveAttribute("data-can-manage", "false")
    expect(fetch).not.toHaveBeenCalled()
  })

  it("admin retains the full squad page, budget management, and working ticker deletion", async () => {
    await renderPage("admin")

    expect(screen.getByRole("link", { name: "선수단 사전 전체 열기 →" })).toHaveAttribute(
      "href",
      "/admin/team-squads"
    )
    expect(screen.getByTestId("report-budget")).toHaveAttribute("data-can-manage", "true")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "즉시 삭제" })))
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/admin/content/ticker?id=ticker-fixture", {
      method: "DELETE",
    })
    expect(screen.queryByText("확인할 티커")).not.toBeInTheDocument()
  })

  it("editor can still edit and approve a squad name from the home page", async () => {
    await renderPage("editor")
    fireEvent.change(screen.getByRole("textbox", { name: "Squad Player 한글 표기" }), {
      target: { value: "수정된 선수" },
    })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "고쳐서 승인" })))

    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/admin/team-squads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "inline_save",
        rows: [
          {
            soccerway_team_id: "team-fixture",
            player_slug: "squad-player",
            name_kr: "수정된 선수",
          },
        ],
      }),
    })
    expect(
      screen.queryByRole("textbox", { name: "Squad Player 한글 표기" })
    ).not.toBeInTheDocument()
  })

  it("editor can still register a blocked player from the home page", async () => {
    await renderPage("editor")
    fireEvent.change(screen.getByRole("textbox", { name: "New Player 한글 표기" }), {
      target: { value: "새 선수" },
    })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "등재" })))

    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/admin/player-dictionary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "new", preferred_ko: "새 선수", romanized: "New Player" }),
    })
    expect(screen.queryByRole("textbox", { name: "New Player 한글 표기" })).not.toBeInTheDocument()
  })

  it.each([
    ["발행 (P)", "publish"],
    ["반려 (R)", "reject"],
  ])("editor retains news %s and its delayed submission", async (label, action) => {
    vi.useFakeTimers()
    await renderPage("editor")
    fireEvent.click(screen.getByRole("button", { name: label }))
    expect(fetch).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/admin/news-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "news-fixture", action }),
    })
  })
})

describe("TickerModPanel", () => {
  it("a read-only panel preserves every item and has no delete action", () => {
    render(<TickerModPanel items={[{ id: "read-only", title: "읽기용 티커" }]} canManage={false} />)
    expect(screen.getByText("읽기용 티커")).toBeVisible()
    expect(screen.queryByRole("button", { name: "즉시 삭제" })).not.toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("an admin deletion failure restores the item and reports the error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "삭제 거절" }),
    } as Response)
    render(<TickerModPanel items={[{ id: "failed-ticker", title: "보존할 티커" }]} canManage />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "즉시 삭제" })))

    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/admin/content/ticker?id=failed-ticker", {
      method: "DELETE",
    })
    expect(screen.getByText("보존할 티커")).toBeVisible()
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        title: "삭제 실패",
        description: "삭제 거절",
      })
    )
  })
})

function controlCenterFixture(role: "admin" | "editor"): ControlCenterResponse {
  const makeItem = (key: string, href: string, count = 1): WorkItem => ({
    key,
    label: `${key} 업무`,
    domain: "검수",
    impact: "검수 대기",
    count,
    oldestAt: null,
    dueAt: null,
    owner: null,
    state: "actionable",
    nextAction: "검수 확인",
    href,
    severity: "normal",
    observation: "ok",
    actionWired: true,
  })
  return {
    role,
    generatedAt: new Date().toISOString(),
    observations: [],
    items: [
      // This selected item exercises the detail action; every row also renders
      // in the domain list. Query/hash links must retain their original URLs.
      makeItem("squads", "/admin/team-squads", 9),
      makeItem("saga", "/admin/saga-review"),
      makeItem("stickers", "/admin/content/stickers"),
      makeItem("operations", "/admin/operations?view=cron#failed"),
      makeItem("news", "/admin/news-review?state=drafted#queue"),
      makeItem("agg", "/admin/agg-review?state=drafted"),
    ],
    outcomes: [],
    pipelines: [],
  }
}

describe("control-center role links", () => {
  it("editor preserves work observations and allowed review links without forbidden navigation", () => {
    const data = controlCenterFixture("editor")
    mocks.useSWR.mockReturnValue({ data, mutate: vi.fn() })
    render(<ControlCenter />)

    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"))
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/admin/news-review?state=drafted#queue",
        "/admin/agg-review?state=drafted",
      ])
    )
    expect(hrefs).not.toContain("/admin/team-squads")
    expect(hrefs).not.toContain("/admin/saga-review")
    expect(hrefs).not.toContain("/admin/content/stickers")
    expect(hrefs).not.toContain("/admin/operations?view=cron#failed")
    expect(screen.queryByRole("link", { name: "처리 화면 열기" })).not.toBeInTheDocument()
    expect(screen.getByText("관리자 권한으로 처리할 수 있습니다.")).toBeVisible()
    expect(screen.queryByText(/이 업무를 처리하는 화면이 아직 없습니다/)).not.toBeInTheDocument()
    for (const item of data.items) expect(screen.getAllByText(item.label).length).toBeGreaterThan(0)

    const queue = within(screen.getByRole("list", { name: /처리할 일 목록/ }))
    for (const key of ["news", "agg"]) {
      fireEvent.click(queue.getByRole("button", { name: new RegExp(`${key} 업무`) }))
      expect(screen.getByRole("link", { name: "처리 화면 열기" })).toHaveAttribute(
        "href",
        data.items.find((item) => item.key === key)!.href
      )
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it("admin retains every wired domain link and selected work action", () => {
    const data = controlCenterFixture("admin")
    mocks.useSWR.mockReturnValue({ data, mutate: vi.fn() })
    render(<ControlCenter />)

    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"))
    for (const item of data.items) expect(hrefs).toContain(item.href)
    expect(screen.getByRole("link", { name: "처리 화면 열기" })).toHaveAttribute(
      "href",
      "/admin/team-squads"
    )
    expect(screen.queryByText("관리자 권한으로 처리할 수 있습니다.")).not.toBeInTheDocument()
  })
})

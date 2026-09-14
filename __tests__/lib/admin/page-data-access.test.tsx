import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Actual SSR entry points, actual page-access guard, isolated role lookup and data boundary.
 * A sentinel stops execution at the first protected loader, so no real DB or UI effects run.
 * null is getStaffRole's real result for both guests and non-staff (including moderators).
 */
const audit = vi.hoisted(() => ({
  getStaffRole: vi.fn(),
  createServiceRoleClient: vi.fn(),
  loadDashboardData: vi.fn(),
  order: [] as string[],
  dataStarted: new Error("PROTECTED_DATA_READ_STARTED"),
}))

vi.mock("@/lib/admin/roles", () => ({ getStaffRole: audit.getStaffRole }))
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: audit.createServiceRoleClient,
}))
vi.mock("@/app/admin/_dashboard/data", () => ({ loadDashboardData: audit.loadDashboardData }))
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`)
  },
  useRouter: vi.fn(),
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}))

// Presentation is outside this authorization contract. Keep their imports inert.
vi.mock("@/app/admin/_dashboard/widgets", () => ({
  MiniNewsDeck: () => null,
  Widget: () => null,
  SquadReviewList: () => null,
  BlockedPlayerRegisterList: () => null,
  ParticipationPanel: () => null,
  TickerModPanel: () => null,
  RefreshButton: () => null,
  WINE: "#000",
}))
vi.mock("@/app/admin/_control-center/control-center", () => ({ ControlCenter: () => null }))
vi.mock("@/app/admin/_dashboard/report-budget-card", () => ({ ReportBudgetCard: () => null }))
vi.mock("@/app/admin/agg-review/agg-review-client", () => ({ AggReviewClient: () => null }))
vi.mock("@/app/admin/agg-training/training-client", () => ({ TrainingClient: () => null }))
vi.mock("@/app/admin/content/banners/banner-management", () => ({ BannerManagement: () => null }))
vi.mock("@/app/admin/content/boards/board-config-table", () => ({ BoardConfigTable: () => null }))
vi.mock("@/app/admin/content/comments/comment-management-table", () => ({
  CommentManagementTable: () => null,
}))
vi.mock("@/app/admin/content/metaverse-reports/metaverse-report-queue", () => ({
  MetaverseReportQueue: () => null,
}))
vi.mock("@/app/admin/content/polls/poll-form", () => ({ PollForm: () => null }))
vi.mock("@/app/admin/content/polls/poll-list", () => ({ PollList: () => null }))
vi.mock("@/app/admin/content/posts/post-management-table", () => ({
  PostManagementTable: () => null,
}))
vi.mock("@/app/admin/content/ticker/ticker-management", () => ({ TickerManagement: () => null }))
vi.mock("@/app/admin/content/ticker/crawler-status", () => ({ CrawlerStatus: () => null }))
vi.mock("@/app/admin/event/actions", () => ({
  updateLeagueCodes: vi.fn(),
  updateEventStatus: vi.fn(),
}))
vi.mock("@/app/admin/experts/expert-approval-table", () => ({ ExpertApprovalTable: () => null }))
vi.mock("@/components/admin/saga-review-queue", () => ({ SagaReviewQueue: () => null }))
vi.mock("@/components/admin/published-fixes", () => ({ PublishedFixes: () => null }))
vi.mock("@/components/admin/player-dictionary", () => ({ PlayerDictionaryCandidates: () => null }))
vi.mock("@/app/admin/news-review/fast-review", () => ({ FastReview: () => null }))
vi.mock("@/app/admin/system/system-health-cards", () => ({ SystemHealthCards: () => null }))
vi.mock("@/app/admin/system/crawler-history", () => ({ CrawlerHistory: () => null }))
vi.mock("@/app/admin/system/cron-monitor", () => ({ CronMonitor: () => null, CRON_JOBS: [] }))
vi.mock("@/app/admin/system/api-health-strip", () => ({ ApiHealthStrip: () => null }))
vi.mock("@/app/admin/system/queue-backlog-card", () => ({ QueueBacklogCard: () => null }))
vi.mock("@/app/admin/system/api-cost-card", () => ({ ApiCostCard: () => null }))
vi.mock("@/app/admin/tokens/token-table", () => ({ TokenMonitoringTable: () => null }))
vi.mock("@/app/admin/tokens/economy-health", () => ({ EconomyHealthCards: () => null }))
vi.mock("@/app/admin/users/user-directory-table", () => ({ UserDirectoryTable: () => null }))

const pages = [
  { path: "/admin", staff: true, load: () => import("@/app/admin/page") },
  { path: "/admin/news-review", staff: true, load: () => import("@/app/admin/news-review/page") },
  { path: "/admin/agg-review", staff: true, load: () => import("@/app/admin/agg-review/page") },
  {
    path: "/admin/agg-training",
    staff: false,
    load: () => import("@/app/admin/agg-training/page"),
  },
  {
    path: "/admin/content/banners",
    staff: false,
    load: () => import("@/app/admin/content/banners/page"),
  },
  {
    path: "/admin/content/boards",
    staff: false,
    load: () => import("@/app/admin/content/boards/page"),
  },
  {
    path: "/admin/content/comments",
    staff: false,
    load: () => import("@/app/admin/content/comments/page"),
  },
  {
    path: "/admin/content/metaverse-reports",
    staff: false,
    load: () => import("@/app/admin/content/metaverse-reports/page"),
  },
  {
    path: "/admin/content/newsroom",
    staff: false,
    load: () => import("@/app/admin/content/newsroom/page"),
  },
  {
    path: "/admin/content/polls",
    staff: false,
    load: () => import("@/app/admin/content/polls/page"),
  },
  {
    path: "/admin/content/posts",
    staff: false,
    load: () => import("@/app/admin/content/posts/page"),
  },
  {
    path: "/admin/content/ticker",
    staff: false,
    load: () => import("@/app/admin/content/ticker/page"),
  },
  { path: "/admin/event", staff: false, load: () => import("@/app/admin/event/page") },
  { path: "/admin/experts", staff: false, load: () => import("@/app/admin/experts/page") },
  { path: "/admin/system", staff: false, load: () => import("@/app/admin/system/page") },
  { path: "/admin/tokens", staff: false, load: () => import("@/app/admin/tokens/page") },
  { path: "/admin/users", staff: false, load: () => import("@/app/admin/users/page") },
] as const

beforeEach(() => {
  vi.clearAllMocks()
  audit.order.length = 0
  audit.getStaffRole.mockImplementation(async () => {
    audit.order.push("role-check")
    return null
  })
  const startData = () => {
    audit.order.push("protected-data")
    throw audit.dataStarted
  }
  audit.createServiceRoleClient.mockImplementation(startData)
  audit.loadDashboardData.mockImplementation(startData)
})

describe("admin SSR page data boundary", () => {
  for (const page of pages) {
    it(`${page.path}: guest/non-staff cannot start a protected loader`, async () => {
      const { default: Page } = await page.load()
      await expect(Page()).rejects.toThrow("NEXT_REDIRECT:/")
      expect(audit.getStaffRole).toHaveBeenCalledOnce()
      expect(audit.createServiceRoleClient).not.toHaveBeenCalled()
      expect(audit.loadDashboardData).not.toHaveBeenCalled()
    })

    if (!page.staff) {
      it(`${page.path}: editor cannot start a protected loader`, async () => {
        audit.getStaffRole.mockImplementation(async () => {
          audit.order.push("role-check")
          return "editor"
        })
        const { default: Page } = await page.load()
        await expect(Page()).rejects.toThrow("NEXT_REDIRECT:/admin")
        expect(audit.getStaffRole).toHaveBeenCalledOnce()
        expect(audit.createServiceRoleClient).not.toHaveBeenCalled()
        expect(audit.loadDashboardData).not.toHaveBeenCalled()
      })
    }

    for (const role of page.staff ? ["admin", "editor"] : ["admin"]) {
      it(`${page.path}: ${role} reaches protected data only after role verification`, async () => {
        audit.getStaffRole.mockImplementation(async () => {
          audit.order.push("role-check")
          return role
        })
        const { default: Page } = await page.load()
        await expect(Page()).rejects.toBe(audit.dataStarted)
        expect(audit.order).toEqual(["role-check", "protected-data"])
      })
    }

    it(`${page.path}: pending role lookup cannot start a protected loader`, async () => {
      let resolveRole!: (value: "admin") => void
      audit.getStaffRole.mockImplementation(
        () =>
          new Promise<"admin">((resolve) => {
            resolveRole = resolve
          })
      )
      const { default: Page } = await page.load()
      const pending = Page()
      const completed = expect(pending).rejects.toBe(audit.dataStarted)
      expect(audit.getStaffRole).toHaveBeenCalledOnce()
      expect(audit.createServiceRoleClient).not.toHaveBeenCalled()
      expect(audit.loadDashboardData).not.toHaveBeenCalled()
      resolveRole("admin")
      await completed
    })
  }
})

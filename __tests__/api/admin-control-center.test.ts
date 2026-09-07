import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Observation, WorkItem } from "@/lib/admin/control-center"

/**
 * 관제 센터 API — 역할 범위와 관측 상태 전달 (2026-09-08).
 *
 * 메뉴를 숨기는 것과 별개로 **서버가 자른다**. editor 응답에 돈·제재 업무가 섞이면
 * 화면을 고쳐도 데이터는 이미 나간 것이다.
 */

const authMock = vi.fn()
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
  currentUser: () => authMock(),
}))

let role = "admin"
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === "profiles") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { role } }) }) }) }
      }
      // 파이프라인 조회 — 전부 실패시켜 "조회 실패는 정상이 아니다"를 확인한다
      return {
        select: () => ({
          order: () => ({ limit: () => ({ maybeSingle: async () => failing }) }),
          eq: () => ({
            order: () => ({ limit: () => ({ maybeSingle: async () => failing }) }),
            is: () => ({
              order: () => ({ limit: () => ({ maybeSingle: async () => failing }) }),
            }),
          }),
        }),
      }
    },
  }),
}))

const failing = { data: null, error: { message: "boom" } }

const item = (over: Partial<WorkItem> & Pick<WorkItem, "key" | "domain">): WorkItem => ({
  label: over.key,
  impact: "",
  count: 1,
  oldestAt: null,
  dueAt: null,
  owner: null,
  state: "actionable",
  nextAction: "",
  href: null,
  severity: "normal",
  observation: "ok",
  actionWired: true,
  ...over,
})

const observation = (key: string): Observation => ({
  key,
  label: key,
  state: "ok",
  observedAt: "2026-09-08T00:00:00Z",
  lastOkAt: "2026-09-08T00:00:00Z",
})

vi.mock("@/lib/admin/control-center-sources", () => ({
  loadControlCenter: async () => ({
    generatedAt: "2026-09-08T00:00:00Z",
    observations: [
      observation("refunds-pending"),
      observation("news-review"),
      observation("reports-pending"),
    ],
    items: [
      item({ key: "refunds-pending", domain: "재화·정산", severity: "critical" }),
      item({ key: "reports-pending", domain: "신고·문의", severity: "high" }),
      item({ key: "news-review", domain: "검수" }),
    ],
    outcomes: [
      {
        key: "o1",
        at: "2026-09-08T00:00:00Z",
        actor: "admin-1",
        action: "환불 큐 종료",
        target: "pending_refund",
        state: "partial" as const,
        evidence: "큐에서만 종료됨",
      },
    ],
  }),
}))

const loadGet = async () => (await import("@/app/api/admin/control-center/route")).GET

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  role = "admin"
  authMock.mockResolvedValue({ userId: "admin-1", id: "admin-1" })
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("GET /api/admin/control-center", () => {
  it("admin 은 돈·제재 업무를 포함해 전부 받는다", async () => {
    const GET = await loadGet()
    const res = await GET()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.items.map((i: WorkItem) => i.key).sort()).toEqual([
      "news-review",
      "refunds-pending",
      "reports-pending",
    ])
    expect(body.outcomes).toHaveLength(1)
  })

  it("editor 응답에는 돈·신고 업무가 아예 없다", async () => {
    role = "editor"
    const GET = await loadGet()
    const res = await GET()
    const body = await res.json()
    expect(body.items.map((i: WorkItem) => i.key)).toEqual(["news-review"])
    // 못 보는 영역을 "확인함"으로 세면 종료 판단이 거짓이 된다 — 관측 목록에서도 빠진다
    expect(body.observations.map((o: Observation) => o.key)).toEqual(["news-review"])
    expect(body.outcomes).toEqual([])
  })

  it("운영 권한이 없으면 403", async () => {
    role = "user"
    const GET = await loadGet()
    expect((await GET()).status).toBe(403)
  })

  it("파이프라인 조회가 실패하면 정상이 아니라 중단으로 표시한다", async () => {
    const GET = await loadGet()
    const body = await (await GET()).json()
    expect(body.pipelines).toHaveLength(4)
    for (const p of body.pipelines) {
      expect(p.status).toBe("down")
      expect(p.detail).toContain("조회하지 못했습니다")
    }
  })
})

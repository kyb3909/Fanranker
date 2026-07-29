import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * 커뮤글 자동승인 cron — drafted → approved(발행 큐 예약)만 한다. 실제 게시는 F17 큐.
 * 여기서 잠그는 계약:
 *   · 미디어 없는 글은 자동승인하지 않는다 (사람 검수로만)
 *   · 일일/페르소나별 cap 은 수동 승인과 같은 규칙으로 지킨다
 *   · 동시 수동 검수와 경합해도 이중 처리되지 않는다 (status=drafted 조건부 업데이트)
 */

let todayCountsResult = { total: 0, byPersona: {} as Record<string, number>, queued: 0 }
// cap 집계·슬롯 계산만 목킹 — hasPublishableMedia(미디어 게이트)는 실물을 그대로 쓴다
vi.mock("@/lib/agg/publish", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/agg/publish")>()
  return {
    ...mod,
    todayCounts: async () => todayCountsResult,
    nextSlot: async () => "2026-07-29T13:00:00.000Z",
    personaNickname: (id: string) => id,
  }
})

interface DraftRow {
  id: string
  rewritten: { title?: string; paragraphs?: string[]; persona_user_id?: string } | null
  media: Array<{ type: string; url: string; rehosted_url?: string | null }> | null
  audit: unknown[] | null
  created_at: string
}

let drafts: DraftRow[] = []
const updates: Array<{ id: string; patch: { status: string } }> = []

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table !== "agg_reservoir") throw new Error(`예상치 못한 테이블: ${table}`)
      return {
        select: () => ({
          eq: () => ({
            gte: () => ({
              order: () => ({ limit: async () => ({ data: drafts, error: null }) }),
            }),
          }),
        }),
        update: (patch: { status: string }) => ({
          eq: (_c: string, id: string) => ({
            eq: async () => {
              updates.push({ id, patch })
              return { error: null }
            },
          }),
        }),
      }
    },
  }),
}))

function draft(id: string, persona: string, media: DraftRow["media"]): DraftRow {
  return {
    id,
    rewritten: { title: `글 ${id}`, paragraphs: ["본문"], persona_user_id: persona },
    media,
    audit: [],
    created_at: new Date().toISOString(),
  }
}

const IMG = [{ type: "image", url: "https://a.com/1.jpg", rehosted_url: "/storage/agg/1.jpg" }]
const EMBED = [{ type: "x", url: "https://x.com/a/status/1" }]
const NO_REHOST = [{ type: "image", url: "https://a.com/1.jpg", rehosted_url: null }]

async function call() {
  const { GET } = await import("@/app/api/cron/agg-auto-approve/route")
  const { NextRequest } = await import("next/server")
  return GET(
    new NextRequest("http://localhost/api/cron/agg-auto-approve", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
  )
}

describe("GET /api/cron/agg-auto-approve", () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.CRON_SECRET = "test-secret"
    delete process.env.AGG_AUTO_APPROVE
    drafts = []
    updates.length = 0
    todayCountsResult = { total: 0, byPersona: {}, queued: 0 }
  })

  it("미디어 있는 글만 승인한다 (rehost 실패 이미지·텍스트만은 제외)", async () => {
    drafts = [
      draft("a", "p1", IMG),
      draft("b", "p2", NO_REHOST), // rehost 실패 → 원본 핫링크 금지라 자동 불가
      draft("c", "p3", null),
      draft("d", "p4", EMBED),
    ]

    const body = await (await call()).json()

    expect(body.approved).toBe(2)
    expect(updates.map((u) => u.id).sort()).toEqual(["a", "d"])
    expect(updates.every((u) => u.patch.status === "approved")).toBe(true)
  })

  it("일일 cap 도달 시 스킵한다", async () => {
    todayCountsResult = { total: 40, byPersona: {}, queued: 0 }
    drafts = [draft("a", "p1", IMG)]

    const body = await (await call()).json()

    expect(body.approved).toBe(0)
    expect(body.skipped).toContain("cap")
  })

  it("페르소나별 cap 이 찬 페르소나는 건너뛴다", async () => {
    todayCountsResult = { total: 5, byPersona: { p1: 10 }, queued: 0 }
    drafts = [draft("a", "p1", IMG), draft("b", "p2", IMG)]

    const body = await (await call()).json()

    expect(body.approved).toBe(1)
    expect(updates[0].id).toBe("b")
  })

  it("회당 상한 3건을 지킨다", async () => {
    drafts = [1, 2, 3, 4, 5].map((n) => draft(`d${n}`, `p${n}`, IMG))

    const body = await (await call()).json()

    expect(body.approved).toBe(3)
  })

  it("킬스위치 AGG_AUTO_APPROVE=off 면 스킵한다", async () => {
    process.env.AGG_AUTO_APPROVE = "off"
    drafts = [draft("a", "p1", IMG)]

    const body = await (await call()).json()

    expect(body.skipped).toContain("off")
    expect(updates).toHaveLength(0)
  })
})

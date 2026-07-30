import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * 뉴스 자동발행 cron — 검수 없이 담벼락에 나가는 유일한 경로.
 * 여기서 잠그는 계약:
 *   · 사진/임베드 없는 초안은 자동으로 나가지 않는다 (사람 검수로만)
 *   · 일일 총량 상한(자동+수동 합산) 도달 시 멈춘다
 *   · 킬스위치 env 로 배포 없이 끌 수 있다
 *   · 자동발행분은 publish.auto=true 로 표시된다 (사후 회수용)
 */

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>()
  return { ...mod, after: (fn: () => void) => fn() }
})

// 디스코드/학습/말머리 추천은 이 테스트의 관심사가 아니다 — no-op 모킹
vi.mock("@/lib/discord/news-notify", () => ({
  notifyNewsPublished: vi.fn().mockResolvedValue(undefined),
  resolveNewsChannel: () => "football",
}))
vi.mock("@/lib/news/learn-corrections", () => ({
  learnFromDeskEdit: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/news/suggest-flair", () => ({
  suggestFlairs: () => ({ flairIds: [] }),
}))

interface DraftRow {
  id: string
  status: string
  urls: null
  draft: { title?: string; content?: unknown }
  entities: null
  tags: null
  created_at: string
}

let drafts: DraftRow[] = []
let botPublishedToday = 0
const inserted: Record<string, unknown>[] = []
const reservoirUpdates: Array<{ id: string; patch: Record<string, unknown> }> = []

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === "posts") {
        return {
          select: () => ({
            eq: () => ({
              gte: async () => ({ count: botPublishedToday, error: null }),
            }),
          }),
          insert: (row: Record<string, unknown>) => {
            inserted.push(row)
            return {
              select: () => ({
                single: async () => ({ data: { id: `post_${inserted.length}` }, error: null }),
              }),
            }
          },
        }
      }
      if (table === "news_reservoir") {
        return {
          select: () => ({
            eq: () => ({
              gte: () => ({
                order: () => ({ limit: async () => ({ data: drafts, error: null }) }),
              }),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: async (_col: string, id: string) => {
              reservoirUpdates.push({ id, patch })
              return { error: null }
            },
          }),
        }
      }
      if (table === "post_flairs" || table === "post_flair_map") {
        return {
          select: () => ({
            eq: () => ({ eq: async () => ({ data: [], error: null }) }),
            in: async () => ({ data: [], error: null }),
          }),
          insert: async () => ({ error: null }),
        }
      }
      throw new Error(`예상치 못한 테이블: ${table}`)
    },
  }),
}))

const visualDoc = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "본문" }] },
    { type: "image", attrs: { src: "https://example.com/a.jpg" } },
  ],
}
const textOnlyDoc = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "글만 있는 기사" }] }],
}

function draft(id: string, content: unknown): DraftRow {
  return {
    id,
    status: "drafted",
    urls: null,
    draft: { title: `기사 ${id}`, content },
    entities: null,
    tags: null,
    created_at: new Date().toISOString(),
  }
}

async function call() {
  const { GET } = await import("@/app/api/cron/news-auto-publish/route")
  const { NextRequest } = await import("next/server")
  return GET(
    new NextRequest("http://localhost/api/cron/news-auto-publish", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
  )
}

describe("GET /api/cron/news-auto-publish", () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.CRON_SECRET = "test-secret"
    // 2026-07-30 opt-in 전환 — 발행 동작 테스트는 명시적으로 켠다
    process.env.NEWS_AUTO_PUBLISH = "on"
    drafts = []
    botPublishedToday = 0
    inserted.length = 0
    reservoirUpdates.length = 0
  })

  it("사진/임베드 있는 초안만 발행하고 auto=true 로 표시한다", async () => {
    drafts = [draft("a", visualDoc), draft("b", textOnlyDoc)]

    const body = await (await call()).json()

    expect(body.published).toBe(1)
    expect(inserted).toHaveLength(1)
    const patch = reservoirUpdates.find((u) => u.id === "a")?.patch as {
      status: string
      publish: { auto?: boolean }
    }
    expect(patch.status).toBe("published")
    expect(patch.publish.auto).toBe(true)
    // 텍스트만인 b 는 건드리지 않는다 — drafted 로 남아 사람 검수 대상
    expect(reservoirUpdates.find((u) => u.id === "b")).toBeUndefined()
  })

  it("회당 상한(2건)을 지킨다", async () => {
    drafts = [draft("a", visualDoc), draft("b", visualDoc), draft("c", visualDoc)]

    const body = await (await call()).json()

    expect(body.published).toBe(2)
  })

  it("일일 총량 상한 도달 시 아무것도 발행하지 않는다", async () => {
    botPublishedToday = 20
    drafts = [draft("a", visualDoc)]

    const body = await (await call()).json()

    expect(body.published).toBe(0)
    expect(inserted).toHaveLength(0)
  })

  it("상한 직전이면 남은 만큼만 발행한다", async () => {
    botPublishedToday = 19
    drafts = [draft("a", visualDoc), draft("b", visualDoc)]

    const body = await (await call()).json()

    expect(body.published).toBe(1)
  })

  it("기본값은 정지 — env NEWS_AUTO_PUBLISH=on 없이는 발행하지 않는다 (opt-in)", async () => {
    delete process.env.NEWS_AUTO_PUBLISH
    drafts = [draft("a", visualDoc)]

    const body = await (await call()).json()

    expect(body.skipped).toContain("정지")
    expect(inserted).toHaveLength(0)
  })

  it("임베드만 있고 실제 이미지가 없는 초안은 발행하지 않는다 (2026-07-30 강화)", async () => {
    const embedOnlyDoc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "본문" }] },
        { type: "embed", attrs: { provider: "x", url: "https://x.com/a/status/1" } },
      ],
    }
    drafts = [draft("a", embedOnlyDoc)]

    const body = await (await call()).json()

    expect(body.published).toBe(0)
  })

  it("CRON_SECRET 없는 요청은 401", async () => {
    const { GET } = await import("@/app/api/cron/news-auto-publish/route")
    const { NextRequest } = await import("next/server")
    const res = await GET(new NextRequest("http://localhost/api/cron/news-auto-publish"))
    expect(res.status).toBe(401)
  })
})

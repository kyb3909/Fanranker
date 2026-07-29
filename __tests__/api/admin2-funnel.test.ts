import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * 유입 채널 퍼널 집계 — 유튜버에게 돌려줄 숫자이자 "어느 채널을 더 밀지"의 근거다.
 * 집계가 틀리면 예산이 엉뚱한 채널로 간다.
 *
 * 잠그는 계약:
 *   · 귀속이 없는 가입자는 버리지 않고 "귀속 불명"으로 센다(분모 보존)
 *   · 게시판 활동 = 글 **또는** 댓글 (이벤트 응모 조건과 같은 정의)
 *   · 지표는 admin 전권 전용 — editor 는 403
 */

const authMock = vi.fn()
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
  currentUser: () => authMock(),
}))

type Row = {
  utm_source: string | null
  utm_campaign: string | null
  signup_at: string
  first_slip_at: string | null
  first_post_at: string | null
  first_comment_at: string | null
}

let rows: Row[] = []
let requesterRole = "admin"

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: { role: requesterRole }, error: null }) }),
          }),
        }
      }
      if (table === "user_acquisition") {
        return {
          select: () => ({
            gte: () => ({ limit: async () => ({ data: rows, error: null }) }),
          }),
        }
      }
      throw new Error(`예상치 못한 테이블: ${table}`)
    },
  }),
}))

const T = "2026-07-29T00:00:00.000Z"
function row(p: Partial<Row>): Row {
  return {
    utm_source: null,
    utm_campaign: null,
    signup_at: T,
    first_slip_at: null,
    first_post_at: null,
    first_comment_at: null,
    ...p,
  }
}

async function call(url = "http://localhost/api/admin2/funnel") {
  const { GET } = await import("@/app/api/admin2/funnel/route")
  const { NextRequest } = await import("next/server")
  return GET(new NextRequest(url))
}

describe("GET /api/admin2/funnel", () => {
  beforeEach(() => {
    vi.resetModules()
    rows = []
    requesterRole = "admin"
    authMock.mockResolvedValue({ userId: "user_admin" })
  })

  it("채널별로 가입·첫예측·게시판활동을 센다", async () => {
    rows = [
      row({ utm_source: "cog", first_slip_at: T, first_comment_at: T }),
      row({ utm_source: "cog", first_slip_at: T }),
      row({ utm_source: "cog" }),
      row({ utm_source: "arsenal_tv", first_post_at: T }),
    ]

    const res = await call()
    const body = await res.json()

    expect(res.status).toBe(200)
    const cog = body.channels.find((c: { channel: string }) => c.channel === "cog")
    expect(cog).toMatchObject({ signups: 3, firstSlip: 2, community: 1, both: 1 })

    const tv = body.channels.find((c: { channel: string }) => c.channel === "arsenal_tv")
    // 글만 써도 게시판 활동이다 — 예측은 안 했으므로 both 는 0
    expect(tv).toMatchObject({ signups: 1, firstSlip: 0, community: 1, both: 0 })
  })

  it("귀속 없는 가입자를 버리지 않고 '귀속 불명'으로 센다", async () => {
    rows = [row({}), row({ utm_source: "cog" })]

    const body = await (await call()).json()

    expect(body.channels.map((c: { channel: string }) => c.channel).sort()).toEqual(
      ["cog", "귀속 불명"].sort()
    )
    expect(body.totals.signups).toBe(2)
  })

  it("가입수 많은 채널이 위로 온다", async () => {
    rows = [row({ utm_source: "small" }), row({ utm_source: "big" }), row({ utm_source: "big" })]

    const body = await (await call()).json()

    expect(body.channels[0].channel).toBe("big")
  })

  it("days 는 1~365 로 클램프된다", async () => {
    expect((await (await call("http://localhost/api/admin2/funnel?days=9999")).json()).days).toBe(
      365
    )
    expect((await (await call("http://localhost/api/admin2/funnel?days=0")).json()).days).toBe(1)
    expect((await (await call("http://localhost/api/admin2/funnel?days=말")).json()).days).toBe(30)
  })

  it("editor 는 지표를 볼 수 없다 (전권 전용)", async () => {
    requesterRole = "editor"

    const res = await call()

    expect(res.status).toBe(403)
  })

  it("비로그인은 401", async () => {
    authMock.mockResolvedValue({ userId: null })

    const res = await call()

    expect(res.status).toBe(401)
  })
})

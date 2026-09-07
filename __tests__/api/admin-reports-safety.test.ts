import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * 신고 처리 실행 안전성 (2026-09-08).
 *
 * 잠그는 것:
 *  · 같은 신고에 인정을 두 번 보내도 **카드가 두 번 발급되지 않는다**
 *    (응답 유실 후 재실행, 두 운영자 동시 처리)
 *  · 카드 발급 실패를 성공으로 보고하지 않는다
 *  · 정지 기록 실패를 "정지 발효"로 보고하지 않는다
 *  · 티커 신고가 댓글 표를 뒤지지 않는다
 */

const authMock = vi.fn()
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
  currentUser: () => authMock(),
}))

let db: ReturnType<typeof makeDb>
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => db.client,
}))

const REPORT_ID = "11111111-1111-4111-8111-111111111111"

interface Opts {
  status?: string
  targetType?: string
  activeYellow?: number
  cardInsertFails?: boolean
  suspensionInsertFails?: boolean
  hasActiveSuspension?: boolean
}

/** 상태를 들고 있는 가짜 DB — 두 번째 실행이 자연스럽게 0행이 되도록 실제처럼 동작한다 */
function makeDb(o: Opts = {}) {
  const state = {
    reportStatus: o.status ?? "pending",
    cards: [] as { report_id: string; card_type: string }[],
    suspensions: o.hasActiveSuspension ? [{ user_id: "author-1" }] : ([] as { user_id: string }[]),
    audits: [] as Record<string, unknown>[],
  }
  const activeYellow = o.activeYellow ?? 0
  const targetType = o.targetType ?? "post"

  const client = {
    from(table: string) {
      if (table === "profiles") {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { role: "admin" } }) }) }),
        }
      }

      if (table === "content_reports") {
        return {
          select: (cols: string) => ({
            eq: () => ({
              // issueCardAndCheckSuspension 의 재조회
              single: async () => ({
                data: { target_type: targetType, target_id: "target-1", reason: "profanity" },
              }),
              // 409 분기에서 현재 상태 확인
              maybeSingle: async () => ({ data: { status: state.reportStatus } }),
            }),
            _cols: cols,
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: () => ({
              // ⚠️ 여기가 핵심 — 현재 상태가 허용 목록에 있을 때만 갱신된다
              in: (_col: string, allowed: string[]) => ({
                select: async () => {
                  if (!allowed.includes(state.reportStatus)) return { data: [], error: null }
                  state.reportStatus = String(patch.status)
                  return { data: [{ id: REPORT_ID, status: patch.status }], error: null }
                },
              }),
            }),
          }),
        }
      }

      if (table === "posts" || table === "comments") {
        return {
          select: () => ({
            eq: () => ({
              single: async () =>
                table === "posts"
                  ? { data: { user_id: "author-1" } }
                  : // 티커가 잘못 흘러오면 여기가 불린다 — 그 사실을 드러내려고 표시를 남긴다
                    { data: { user_id: "WRONG-TABLE" } },
            }),
          }),
        }
      }

      if (table === "user_cards") {
        return {
          insert: async (row: Record<string, unknown>) => {
            if (o.cardInsertFails) return { error: { message: "insert denied" } }
            state.cards.push({
              report_id: String(row.report_id),
              card_type: String(row.card_type),
            })
            return { error: null }
          },
          select: () => ({
            eq: () => ({
              eq: () => ({
                gt: async () => ({ count: activeYellow + state.cards.length, error: null }),
              }),
            }),
          }),
        }
      }

      if (table === "user_suspensions") {
        return {
          select: () => ({
            eq: () => ({
              or: () => ({
                maybeSingle: async () => ({ data: state.suspensions[0] ?? null }),
              }),
            }),
          }),
          insert: async (row: Record<string, unknown>) => {
            if (o.suspensionInsertFails) return { error: { message: "suspension denied" } }
            state.suspensions.push({ user_id: String(row.user_id) })
            return { error: null }
          },
        }
      }

      if (table === "admin_audit_logs") {
        return {
          insert: async (row: Record<string, unknown>) => {
            state.audits.push(row)
            return { error: null }
          },
        }
      }

      throw new Error(`unexpected table: ${table}`)
    },
  }

  return { client, state }
}

const req = (body: unknown) =>
  ({
    json: async () => body,
    headers: new Headers(),
    url: "https://gongnori.fan/api/admin/content/reports",
  }) as never

const loadPatch = async () => (await import("@/app/api/admin/content/reports/route")).PATCH

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  authMock.mockResolvedValue({ userId: "admin-1", id: "admin-1" })
  db = makeDb()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("PATCH /api/admin/content/reports — 중복 실행 방지", () => {
  it("두 번째 인정은 409 로 막히고 카드가 한 장만 남는다", async () => {
    const PATCH = await loadPatch()

    const first = await PATCH(req({ reportId: REPORT_ID, action: "resolve" }))
    expect(first.status).toBe(200)
    expect(db.state.cards).toHaveLength(1)

    // 응답이 유실돼 운영자가 다시 눌렀다고 가정
    const second = await PATCH(req({ reportId: REPORT_ID, action: "resolve" }))
    const body = await second.json()
    expect(second.status).toBe(409)
    expect(body.alreadyHandled).toBe(true)
    expect(body.currentStatus).toBe("resolved")
    // 같은 효과를 다시 실행하지 않았다
    expect(db.state.cards).toHaveLength(1)
  })

  it("동시에 두 요청이 와도 카드는 한 장이다", async () => {
    const PATCH = await loadPatch()
    const results = await Promise.all([
      PATCH(req({ reportId: REPORT_ID, action: "resolve" })),
      PATCH(req({ reportId: REPORT_ID, action: "resolve" })),
    ])
    const codes = results.map((r) => r.status).sort()
    expect(codes).toEqual([200, 409])
    expect(db.state.cards).toHaveLength(1)
  })

  it("이미 기각된 신고는 인정으로 뒤집히지 않는다", async () => {
    db = makeDb({ status: "dismissed" })
    const PATCH = await loadPatch()
    const res = await PATCH(req({ reportId: REPORT_ID, action: "resolve" }))
    expect(res.status).toBe(409)
    expect(db.state.cards).toHaveLength(0)
  })

  it("검토 중 표시는 대기 상태에서만 가능하다", async () => {
    db = makeDb({ status: "reviewing" })
    const PATCH = await loadPatch()
    const res = await PATCH(req({ reportId: REPORT_ID, action: "reviewing" }))
    expect(res.status).toBe(409)
  })
})

describe("PATCH /api/admin/content/reports — 결과를 정직하게 보고한다", () => {
  it("카드 발급이 실패하면 부분 성공으로 알린다", async () => {
    db = makeDb({ cardInsertFails: true })
    const PATCH = await loadPatch()
    const res = await PATCH(req({ reportId: REPORT_ID, action: "resolve" }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.verdict).toBe("partial")
    expect(body.cardIssued).toBe(false)
    expect(body.message).toContain("카드 발급에 실패")
  })

  it("정지 기록이 실패하면 정지 발효라고 말하지 않는다", async () => {
    // 기존 옐로 1장 + 이번 1장 = 임계치 도달
    db = makeDb({ activeYellow: 1, suspensionInsertFails: true })
    const PATCH = await loadPatch()
    const res = await PATCH(req({ reportId: REPORT_ID, action: "resolve" }))
    const body = await res.json()
    expect(body.userSuspended).toBe(false)
    expect(body.verdict).toBe("partial")
    expect(body.message).toContain("정지가 걸리지 않았습니다")
  })

  it("임계치를 넘으면 정지가 적용되고 그렇게 보고한다", async () => {
    db = makeDb({ activeYellow: 1 })
    const PATCH = await loadPatch()
    const res = await PATCH(req({ reportId: REPORT_ID, action: "resolve" }))
    const body = await res.json()
    expect(body.userSuspended).toBe(true)
    expect(body.verdict).toBe("applied")
    expect(db.state.suspensions).toHaveLength(1)
  })

  it("티커 신고는 댓글 표를 뒤지지 않고 카드도 발급하지 않는다", async () => {
    db = makeDb({ targetType: "ticker" })
    const PATCH = await loadPatch()
    const res = await PATCH(req({ reportId: REPORT_ID, action: "resolve" }))
    const body = await res.json()
    expect(db.state.cards).toHaveLength(0)
    expect(body.verdict).toBe("partial")
    expect(body.message).toContain("작성자를 찾지 못해")
  })

  it("기각은 카드를 발급하지 않는다", async () => {
    const PATCH = await loadPatch()
    const res = await PATCH(req({ reportId: REPORT_ID, action: "dismiss" }))
    expect(res.status).toBe(200)
    expect(db.state.cards).toHaveLength(0)
  })

  it("감사 로그에 실패 여부까지 남긴다", async () => {
    db = makeDb({ cardInsertFails: true })
    const PATCH = await loadPatch()
    await PATCH(req({ reportId: REPORT_ID, action: "resolve" }))
    const audit = db.state.audits[0] as { details: Record<string, unknown> }
    expect(audit.details.cardError).toBe(true)
    expect(audit.details.cardIssued).toBe(false)
  })
})

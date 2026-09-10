import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { auditDb, auditGame, auditLfa } from "../../helpers/audit-db"

const state = vi.hoisted(() => ({ db: null as unknown, notify: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: () => state.db }))
vi.mock("@/lib/cron-auth", () => ({ verifyCronSecret: () => null }))
vi.mock("@/lib/cron/log-run", () => ({ withCronLog: (_name: string, handler: unknown) => handler }))
vi.mock("@/lib/discord-notify", () => ({ notifyDiscordOps: state.notify }))
vi.mock("@/lib/news/publish", () => ({ NEWS_BOT_USER_ID: "news-bot" }))
vi.mock("@/lib/news/notation", () => ({
  loadNotation: async () => ({ entries: [], persons: [] }),
  findNotationViolations: () => [],
  findAliasPoisoning: () => [],
}))
vi.mock("@/lib/lfa/match", () => ({ cachedTeamEn: async () => [] }))
vi.mock("@/lib/ops/cron-schedule", () => ({
  cronJobNameFromPath: (path: string) => path,
  cronMaxGapMinutes: () => null,
  heartbeatThresholdMinutes: () => Infinity,
}))

import { GET } from "@/app/api/cron/invariant-audit/route"

describe("운영 감시의 LFA 산출물 및 조회 장애", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-09-10T04:00:00Z"))
    vi.stubEnv("DISCORD_OPS_WEBHOOK_URL", "https://example.invalid/test-only")
    state.notify.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })
  function setup(withThread: boolean) {
    const lfa = auditLfa()
    const fake = auditDb({
      betman_games: [auditGame(), auditGame("betman-b")],
      lfa_fixtures: [lfa],
      match_lineups: [
        { game_id: lfa.id, created_at: "2026-09-09T18:00:00Z", payload: { status: "ready" } },
      ],
      match_details_cache: [
        {
          game_id: lfa.id,
          lfa_match_id: lfa.lfa_match_id,
          finished: true,
          updated_at: "2026-09-09T22:00:00Z",
          payload: { homeScore: 6, awayScore: 3 },
        },
      ],
      posts: withThread ? [{ match_game_id: lfa.id, deleted_at: null }] : [],
      invariant_findings: [
        {
          id: "old",
          fingerprint: "match_thread_missing:previous",
          invariant: "match_thread_missing",
          status: "open",
          detail: { game_id: "betman-a", sibling_ids: ["betman-a", "betman-b", "lfa-uuid"] },
        },
      ],
    })
    state.db = fake.db
    return fake
  }
  const run = async () =>
    (await GET(new NextRequest("https://example.invalid/api/cron/invariant-audit"))).json()
  it("LFA UUID에 저장된 불판은 누락 경보를 만들지 않는다", async () => {
    const fake = setup(true)
    expect(await run()).toMatchObject({ ok: true, findings: 0 })
    expect(fake.writes.some((w) => w.method === "upsert")).toBe(false)
  })
  it("진짜 불판 누락은 연결된 경기당 한 번만 경고한다", async () => {
    const fake = setup(false)
    expect(await run()).toMatchObject({ ok: true, findings: 1 })
    const finding = fake.writes.find((w) => w.method === "upsert")?.data
    expect(finding).toEqual([
      expect.objectContaining({
        invariant: "match_thread_missing",
        detail: expect.objectContaining({
          sibling_ids: expect.arrayContaining(["betman-a", "betman-b", "lfa-uuid"]),
        }),
      }),
    ])
  })
  it("조회 시간창이 지난 미완료 경기의 경보를 자동으로 닫지 않는다", async () => {
    const fake = setup(false)
    vi.setSystemTime(new Date("2026-09-14T04:00:00Z"))
    expect(await run()).toMatchObject({ ok: true, findings: 0, resolved: 0 })
    expect(fake.writes).toEqual([])
  })
  it("열린 경보 조회 실패 시 새 누락으로 기존 경기 ID를 덮거나 새 알림을 보내지 않는다", async () => {
    const fake = setup(false)
    const original = structuredClone(fake.tables.invariant_findings)
    fake.state.fail = "invariant_findings"
    const result = await run()
    expect(result).toMatchObject({ ok: false, findings: 1, fresh: 0, resolved: 0 })
    expect(result.errors.some((error: string) => error.includes("열린 경보 조회 실패"))).toBe(true)
    expect(fake.writes).toEqual([])
    expect(fake.tables.invariant_findings).toEqual(original)
    expect(state.notify).not.toHaveBeenCalled()
  })
  it("시간창이 지났어도 LFA 별칭에서 불판을 확인하면 경보를 닫는다", async () => {
    const fake = setup(true)
    vi.setSystemTime(new Date("2026-09-14T04:00:00Z"))
    expect(await run()).toMatchObject({ ok: true, findings: 0, resolved: 1 })
    expect(fake.writes).toEqual([
      expect.objectContaining({
        table: "invariant_findings",
        method: "update",
        data: expect.objectContaining({ status: "resolved" }),
      }),
    ])
  })
  it.each([
    "posts",
    "match_lineups",
    "match_details_cache",
    "lfa_fixtures",
    "polls",
    "match_reports",
  ])("%s 조회 오류 때 누락으로 경보하거나 기존 경보를 해소하지 않는다", async (table) => {
    const fake = setup(true)
    fake.state.fail = table
    const result = await run()
    expect(result.ok).toBe(false)
    expect(result.errors.some((error: string) => error.includes("DB unavailable"))).toBe(true)
    expect(result.findings).toBe(0)
    expect(fake.writes).toEqual([])
    expect(state.notify).not.toHaveBeenCalled()
  })
})

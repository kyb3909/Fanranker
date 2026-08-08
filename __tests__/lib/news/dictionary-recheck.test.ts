import { describe, expect, it, beforeEach, vi } from "vitest"
import { requeueDraftsUnblockedByDictionary } from "@/lib/news/dictionary-recheck"

/**
 * 사전 등재 → 막힌 초안 부활.
 * 잠그는 계약:
 *  · 등재로 모든 미등재 이름이 풀린 초안만 반려 기록을 걷는다
 *  · 다른 미등재 이름이 남으면 안 건드린다
 *  · 사전과 무관한 반려(검사관·이미지·중복)는 절대 안 건드린다
 *  · 걷을 때 이력(auto_gate_cleared)을 남기고, 원장에 전이를 기록한다
 */

interface ReservoirRow {
  id: string
  decision: Record<string, unknown> | null
}

let dictRows: { preferred_ko: string; hangul_alts: string[] | null }[] = []
let reservoirRows: ReservoirRow[] = []
let updates: Array<{ id: string; patch: Record<string, unknown>; statusGuard: boolean }> = []
let updateError: { message: string } | null = null
let ledgerEvents: { candidate_id: string; to_state: string; reason_code?: string }[] = []

function mockSupabase() {
  return {
    rpc: async (
      _name: string,
      args: { p_events: { candidate_id: string; to_state: string; reason_code?: string }[] }
    ) => {
      ledgerEvents.push(...args.p_events)
      return { data: args.p_events.length, error: null }
    },
    from: (table: string) => {
      if (table === "news_alias_dictionary") {
        // 사전 조회는 category in (player, coach) — 감독 표기도 게이트와 같은 범위 (2026-08-09)
        return {
          select: () => ({
            eq: async () => ({ data: dictRows, error: null }),
            in: async () => ({ data: dictRows, error: null }),
          }),
        }
      }
      if (table === "news_reservoir") {
        return {
          select: () => ({
            eq: () => ({
              not: () => ({ limit: async () => ({ data: reservoirRows, error: null }) }),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: (_col: string, id: string) => ({
              eq: async (col2: string, val2: string) => {
                updates.push({ id, patch, statusGuard: col2 === "status" && val2 === "drafted" })
                return { error: updateError }
              },
            }),
          }),
        }
      }
      throw new Error(`예상치 못한 테이블: ${table}`)
    },
  } as never
}

function blockedRow(
  id: string,
  reasons: string[],
  extra: Record<string, unknown> = {}
): ReservoirRow {
  return { id, decision: { ...extra, auto_gate: { pass: false, reasons, at: "t" } } }
}

describe("requeueDraftsUnblockedByDictionary", () => {
  beforeEach(() => {
    dictRows = []
    reservoirRows = []
    updates = []
    updateError = null
    ledgerEvents = []
    vi.restoreAllMocks()
  })

  it("등재로 풀린 초안의 반려 기록을 걷고 이력·원장을 남긴다", async () => {
    dictRows = [{ preferred_ko: "맥스 도우먼", hangul_alts: null }]
    reservoirRows = [blockedRow("a", ["사전 미등재 선수명: 도우먼"], { interest: { keep: true } })]

    const result = await requeueDraftsUnblockedByDictionary(mockSupabase())

    expect(result).toEqual({ requeued: 1, stillBlocked: 0, failed: 0 })
    expect(updates).toHaveLength(1)
    const patch = updates[0].patch as { decision: Record<string, unknown> }
    // 낙인은 사라지고, 다른 결정(interest)과 이력은 보존된다
    expect(patch.decision.auto_gate).toBeUndefined()
    expect(patch.decision.interest).toEqual({ keep: true })
    expect(patch.decision.auto_gate_cleared).toMatchObject({
      by: "player-dictionary",
      reasons: ["사전 미등재 선수명: 도우먼"],
    })
    // 그 사이 발행/반려된 행을 덮지 않도록 status 가드가 걸린다
    expect(updates[0].statusGuard).toBe(true)
    expect(ledgerEvents).toEqual([
      expect.objectContaining({
        candidate_id: "a",
        to_state: "drafted",
        reason_code: "dictionary_recheck",
      }),
    ])
  })

  it("부분 표기 등재도 게이트와 같은 규칙으로 풀린다 (성만 쓴 기사 ↔ 풀네임 등재)", async () => {
    dictRows = [{ preferred_ko: "브루노 기마랑이스", hangul_alts: null }]
    reservoirRows = [blockedRow("a", ["사전 미등재 선수명: 기마랑이스"])]

    const result = await requeueDraftsUnblockedByDictionary(mockSupabase())

    expect(result.requeued).toBe(1)
  })

  it("다른 미등재 이름이 남으면 건드리지 않는다", async () => {
    dictRows = [{ preferred_ko: "맥스 도우먼", hangul_alts: null }]
    reservoirRows = [blockedRow("a", ["사전 미등재 선수명: 도우먼, 은가누"])]

    const result = await requeueDraftsUnblockedByDictionary(mockSupabase())

    expect(result).toEqual({ requeued: 0, stillBlocked: 1, failed: 0 })
    expect(updates).toHaveLength(0)
    expect(ledgerEvents).toHaveLength(0)
  })

  it("사전과 무관한 반려(이미지·검사관)는 절대 건드리지 않는다", async () => {
    dictRows = [{ preferred_ko: "맥스 도우먼", hangul_alts: null }]
    reservoirRows = [
      blockedRow("a", ["이미지 부적합: 구독 배너"]),
      blockedRow("b", ["제목-본문 불일치"]),
      // 혼합 사유(사전+기타)도 안 건드린다 — 사전만 풀렸다고 통과 보증이 아니다
      blockedRow("c", ["사전 미등재 선수명: 도우먼", "이미지 부적합: 로고"]),
    ]

    const result = await requeueDraftsUnblockedByDictionary(mockSupabase())

    expect(result).toEqual({ requeued: 0, stillBlocked: 0, failed: 0 })
    expect(updates).toHaveLength(0)
  })

  it("DB 갱신 실패는 failed로 세고 원장에 남기지 않는다 (침묵 실패 금지)", async () => {
    dictRows = [{ preferred_ko: "맥스 도우먼", hangul_alts: null }]
    reservoirRows = [blockedRow("a", ["사전 미등재 선수명: 도우먼"])]
    updateError = { message: "boom" }
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

    const result = await requeueDraftsUnblockedByDictionary(mockSupabase())

    expect(result).toEqual({ requeued: 0, stillBlocked: 0, failed: 1 })
    expect(ledgerEvents).toHaveLength(0)
    expect(errorSpy).toHaveBeenCalled()
  })

  it("hangul_alts 별칭 등재로도 풀린다", async () => {
    dictRows = [{ preferred_ko: "비니시우스 주니오르", hangul_alts: ["비니시우스 주니어"] }]
    reservoirRows = [blockedRow("a", ["사전 미등재 선수명: 비니시우스 주니어"])]

    const result = await requeueDraftsUnblockedByDictionary(mockSupabase())

    expect(result.requeued).toBe(1)
  })
})

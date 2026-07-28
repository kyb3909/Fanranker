import { describe, it, expect, vi, beforeEach } from "vitest"
import { settlePredictions } from "@/lib/betman/settle"

/**
 * settlePredictions 의 **슬립 단계**(2단계) 테스트.
 *
 * 왜 별도 파일인가
 * - 기존 settle.test.ts 는 1단계(개별 예측)만 다루고, 목이 테이블을 구분하지 않아
 *   슬립 단계를 태울 수 없다. 그 파일을 건드리지 않고 하네스만 새로 만든다.
 * - risk-map.md #1: 실제 지급·환불이 일어나는 구간이 여기인데 커버리지 0% 였다.
 *
 * 무엇을 검증하는가 — **행동**이지 구현이 아니다.
 *   · 이중 환불이 일어나지 않는가 (멱등성)  ← 가장 중요
 *   · 전부 취소된 슬립만 환불되는가
 *   · 하나라도 pending 이면 슬립을 건드리지 않는가
 *   · 전부 적중이면 won, 하나라도 틀리면 lost
 *   · 부분 취소 시 total_odds 를 살아있는 예측만으로 재계산하는가
 */

vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}))
vi.mock("@/lib/betman/stats", () => ({
  batchUpdateUserStats: vi.fn().mockResolvedValue({ updated: 0, errors: [] }),
}))

/* ────────── 테이블 인식 목 ────────── */

interface SlipRow {
  user_id: string
  stake: number
  status: string
  total_odds: number
}
interface SlipPredRow {
  id: string
  status: string
  is_correct: boolean | null
  locked_odds: number | null
}

/**
 * 실제 DB 처럼 동작하는 최소 목.
 * 핵심: prediction_slips 의 UPDATE 는 `.eq("status","pending")` 조건부라
 * 이미 pending 이 아니면 **0행**을 돌려줘야 한다. 이게 멱등성의 근거다.
 */
function makeSupabase(opts: {
  slip: SlipRow
  slipPreds: SlipPredRow[]
  /**
   * 동시 실행 경합 재현. true 면 SELECT 는 항상 status='pending' 을 돌려주지만
   * 실제 상태는 이미 다른 워커가 바꿔놓은 상태다 — 조건부 UPDATE 만이 이를 막는다.
   */
  staleRead?: boolean
}) {
  const state = { slip: { ...opts.slip } }
  const updates: Array<{ table: string; patch: Record<string, unknown> }> = []
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = []

  const from = vi.fn((table: string) => {
    if (table === "betman_predictions") {
      return {
        update: () => ({
          eq: function () {
            return this
          },
          select: async () => ({ data: [{ id: "pred-1" }], error: null }),
        }),
        select: () => ({
          // .eq("slip_id", …) 뒤 await → 슬립에 속한 예측 목록
          eq: async () => ({ data: opts.slipPreds, error: null }),
        }),
        insert: async () => ({ error: null }),
        upsert: async () => ({ error: null }),
      } as any
    }

    if (table === "prediction_slips") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: opts.staleRead
                ? { ...state.slip, status: "pending" } // 낡은 읽기
                : { ...state.slip },
              error: null,
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          let requiredStatus: string | null = null
          const chain: any = {
            eq: (col: string, val: unknown) => {
              if (col === "status") requiredStatus = String(val)
              return chain
            },
            select: async () => {
              // 조건부 UPDATE 재현: status 조건이 현재 상태와 다르면 0행
              if (requiredStatus !== null && state.slip.status !== requiredStatus) {
                return { data: [], error: null }
              }
              updates.push({ table, patch })
              if (typeof patch.status === "string") state.slip.status = patch.status
              return { data: [{ id: "slip-1" }], error: null }
            },
            // total_odds 갱신처럼 .select() 없이 끝나는 UPDATE 를 await 하는 경우
            then: (res: (v: unknown) => unknown) => {
              updates.push({ table, patch })
              return Promise.resolve({ error: null }).then(res)
            },
          }
          return chain
        },
        insert: async () => ({ error: null }),
        upsert: async () => ({ error: null }),
      } as any
    }

    // audit / notifications 등 그 외 테이블
    return {
      insert: async () => ({ error: null }),
      upsert: async () => ({ error: null }),
      update: () => ({
        eq: function () {
          return this
        },
        select: async () => ({ data: [], error: null }),
      }),
      select: () => ({
        eq: async () => ({ data: [], error: null }),
        single: async () => ({ data: null, error: null }),
      }),
    } as any
  })

  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args })
    return { error: null }
  })

  return { client: { from, rpc } as any, updates, rpcCalls, state }
}

const game = (over: Record<string, unknown> = {}) => ({
  id: "game-1",
  game_no: 1,
  game_type: "win_lose",
  sport: "football",
  result: "home",
  status: "finished",
  home_win_odds: "2.00",
  away_win_odds: "2.10",
  draw_odds: "3.50",
  over_odds: "1.90",
  under_odds: "1.95",
  odd_odds: "1.85",
  even_odds: "2.00",
  daily_round_id: "round-1",
  ...over,
})

const pred = (over: Record<string, unknown> = {}) => ({
  id: "pred-1",
  user_id: "user-1",
  game_id: "game-1",
  prediction: "home",
  status: "pending",
  stake: 10,
  slip_id: "slip-1",
  locked_odds: null,
  ...over,
})

type RpcCall = { fn: string; args: Record<string, unknown> }
const refunds = (rpcCalls: RpcCall[]) => rpcCalls.filter((c) => c.fn === "refund_tokens")
const slipStatuses = (updates: Array<{ table: string; patch: Record<string, unknown> }>) =>
  updates.filter((u) => u.table === "prediction_slips" && u.patch.status).map((u) => u.patch.status)

beforeEach(() => vi.clearAllMocks())

describe("settlePredictions — 슬립 단계", () => {
  it("전부 취소된 슬립은 취소 처리하고 스테이크를 1회 환불한다", async () => {
    const { client, rpcCalls, updates } = makeSupabase({
      slip: { user_id: "user-1", stake: 30, status: "pending", total_odds: 2.0 },
      slipPreds: [{ id: "pred-1", status: "cancelled", is_correct: null, locked_odds: null }],
    })

    await settlePredictions(client, [game({ status: "cancelled" })], [pred()])

    expect(slipStatuses(updates)).toContain("cancelled")
    const r = refunds(rpcCalls)
    expect(r).toHaveLength(1)
    expect(r[0].args.p_amount).toBe(30)
    expect(r[0].args.p_user_id).toBe("user-1")
  })

  /** ★ 가장 중요한 계약 — 15분마다 도는 cron 이 같은 슬립을 다시 태워도 재지급이 없어야 한다 */
  it("이미 취소된 슬립을 다시 정산해도 환불이 반복되지 않는다 (멱등성)", async () => {
    const { client, rpcCalls } = makeSupabase({
      slip: { user_id: "user-1", stake: 30, status: "cancelled", total_odds: 2.0 },
      slipPreds: [{ id: "pred-1", status: "cancelled", is_correct: null, locked_odds: null }],
    })

    await settlePredictions(client, [game({ status: "cancelled" })], [pred()])

    expect(refunds(rpcCalls)).toHaveLength(0)
  })

  /**
   * ★ 조건부 UPDATE(.eq("status","pending")) 자체를 지키는 테스트.
   *
   * 앞의 멱등성 테스트는 "읽어보니 이미 cancelled" 경로에서 멈추기 때문에,
   * UPDATE 의 조건절을 지워도 통과한다(돌연변이 검증으로 확인함).
   * 여기서는 **읽을 땐 pending 인데 쓸 때는 이미 cancelled** 인 경합을 재현한다.
   * 15분마다 도는 cron 이 겹쳐 돌면 실제로 발생할 수 있는 상황이고,
   * 조건부 UPDATE 가 0행을 돌려주는 것만이 이중 환불을 막는다.
   */
  it("동시 실행으로 읽기는 pending 이지만 이미 취소됐다면 환불하지 않는다", async () => {
    const { client, rpcCalls } = makeSupabase({
      slip: { user_id: "user-1", stake: 30, status: "cancelled", total_odds: 2.0 },
      slipPreds: [{ id: "pred-1", status: "cancelled", is_correct: null, locked_odds: null }],
      staleRead: true,
    })

    await settlePredictions(client, [game({ status: "cancelled" })], [pred()])

    // 조건부 UPDATE 가 0행 → 환불 블록에 진입하지 않아야 한다
    expect(refunds(rpcCalls)).toHaveLength(0)
  })

  it("예측이 하나라도 pending 이면 슬립을 건드리지 않는다", async () => {
    const { client, rpcCalls, updates } = makeSupabase({
      slip: { user_id: "user-1", stake: 30, status: "pending", total_odds: 2.0 },
      slipPreds: [
        { id: "pred-1", status: "settled", is_correct: true, locked_odds: 2.0 },
        { id: "pred-2", status: "pending", is_correct: null, locked_odds: null },
      ],
    })

    await settlePredictions(client, [game()], [pred()])

    expect(slipStatuses(updates)).toHaveLength(0)
    expect(refunds(rpcCalls)).toHaveLength(0)
  })

  it("살아있는 예측이 전부 적중이면 won 이고 환불은 없다", async () => {
    const { client, updates, rpcCalls } = makeSupabase({
      slip: { user_id: "user-1", stake: 10, status: "pending", total_odds: 2.0 },
      slipPreds: [
        { id: "pred-1", status: "settled", is_correct: true, locked_odds: 2.0 },
        { id: "pred-2", status: "settled", is_correct: true, locked_odds: 1.5 },
      ],
    })

    const res = await settlePredictions(client, [game()], [pred()])

    expect(slipStatuses(updates)).toContain("won")
    expect(res.slipsWon).toBe(1)
    expect(res.slipsLost).toBe(0)
    // 적중은 "점수만" 모델 — 토큰 환불/지급이 나가면 안 된다
    expect(refunds(rpcCalls)).toHaveLength(0)
  })

  it("하나라도 틀리면 lost 이고 환불은 없다", async () => {
    const { client, updates, rpcCalls } = makeSupabase({
      slip: { user_id: "user-1", stake: 10, status: "pending", total_odds: 2.0 },
      slipPreds: [
        { id: "pred-1", status: "settled", is_correct: true, locked_odds: 2.0 },
        { id: "pred-2", status: "settled", is_correct: false, locked_odds: 1.5 },
      ],
    })

    const res = await settlePredictions(client, [game()], [pred()])

    expect(slipStatuses(updates)).toContain("lost")
    expect(res.slipsLost).toBe(1)
    expect(res.slipsWon).toBe(0)
    expect(refunds(rpcCalls)).toHaveLength(0)
  })

  it("이미 won 인 슬립은 다시 정산하지 않는다 (멱등성)", async () => {
    const { client, updates } = makeSupabase({
      slip: { user_id: "user-1", stake: 10, status: "won", total_odds: 2.0 },
      slipPreds: [{ id: "pred-1", status: "settled", is_correct: true, locked_odds: 2.0 }],
    })

    const res = await settlePredictions(client, [game()], [pred()])

    expect(slipStatuses(updates)).toHaveLength(0)
    expect(res.slipsWon).toBe(0)
  })

  /**
   * won/lost 경로의 조건부 UPDATE 도 같은 이유로 별도 검증이 필요하다.
   * 적중은 "점수만" 모델이라 토큰이 움직이진 않지만, 가드가 없으면 같은 슬립에
   * settlement_result 알림이 중복 발송되고 집계(slipsWon)도 부풀려진다.
   */
  it("동시 실행으로 읽기는 pending 이지만 이미 won 이라면 다시 확정하지 않는다", async () => {
    const { client, updates } = makeSupabase({
      slip: { user_id: "user-1", stake: 10, status: "won", total_odds: 2.0 },
      slipPreds: [{ id: "pred-1", status: "settled", is_correct: true, locked_odds: 2.0 }],
      staleRead: true,
    })

    const res = await settlePredictions(client, [game()], [pred()])

    expect(res.slipsWon).toBe(0)
    expect(slipStatuses(updates)).toHaveLength(0)
  })

  it("부분 취소 시 살아있는 예측만으로 total_odds 를 재계산한다", async () => {
    const { client, updates } = makeSupabase({
      slip: { user_id: "user-1", stake: 10, status: "pending", total_odds: 6.0 },
      slipPreds: [
        { id: "pred-1", status: "settled", is_correct: true, locked_odds: 2.0 },
        { id: "pred-2", status: "settled", is_correct: true, locked_odds: 1.5 },
        { id: "pred-3", status: "cancelled", is_correct: null, locked_odds: 2.0 },
      ],
    })

    const res = await settlePredictions(client, [game()], [pred()])

    // 취소된 2.0 을 뺀 2.0 × 1.5 = 3.0
    const oddsPatch = updates.find((u) => u.patch.total_odds !== undefined)
    expect(oddsPatch?.patch.total_odds).toBe(3)
    // payout 은 재계산된 배당 기준 (stake 10 × 3.0)
    expect(res.totalPayout).toBe(30)
    expect(res.slipsWon).toBe(1)
  })
})

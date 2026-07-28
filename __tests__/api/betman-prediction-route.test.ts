import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * POST /api/betman/prediction — **라우트를 실제로 import 해서** 검증한다.
 *
 * 왜 새로 쓰는가
 * - 기존 __tests__/api/betman-prediction.test.ts 는 라우트를 import 하지 않고
 *   스키마 복사본만 검증한다(test-gaps.md). 라우트 본문이 바뀌어도 영원히 초록불이다.
 * - 이 파일은 볼이 실제로 움직이는 계약을 지킨다 (risk-map.md #2).
 *
 * 지키는 계약 — 전부 "돈이 어떻게 되는가"에 대한 것이다.
 *   1. 배당이 0/null 이면 **볼을 차감하기 전에** 거부한다   ← 순서가 핵심
 *   2. 볼 부족이면 슬립을 만들지 않는다
 *   3. 슬립 생성 실패 시 차감액 전액을 환불한다
 *   4. 예측 저장 실패 시 슬립을 지우고 환불한다 (고아 슬립 방지)
 *   5. total_odds 는 검증에 쓴 배당의 곱이다 (0 슬립이 열리면 안 된다)
 */

/* ────────── 모듈 목 ────────── */

const currentUserMock = vi.fn()
vi.mock("@clerk/nextjs/server", () => ({
  currentUser: () => currentUserMock(),
}))

const retryRefundTokensMock = vi.fn().mockResolvedValue(undefined)
vi.mock("@/lib/betman/refund-tokens", () => ({
  retryRefundTokens: (...args: unknown[]) => retryRefundTokensMock(...args),
}))

vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}))

// 마감/라운드 시간 계산은 이 테스트의 관심사가 아니다 — 항상 "베팅 가능"으로 고정
vi.mock("@/lib/betman/daily-round", () => ({
  getGameBetDeadline: () => new Date(Date.now() + 60 * 60 * 1000),
  getDailyWindow: () => ({
    start: new Date(Date.now() - 3600_000),
    end: new Date(Date.now() + 3600_000),
    dailyId: "2026-07-28",
  }),
  getTodayDailyId: () => "2026-07-28",
}))

let supabaseMock: ReturnType<typeof makeSupabase>
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => supabaseMock.client,
}))

/* ────────── Supabase 목 ────────── */

interface Opts {
  /** betman_games 가 돌려줄 경기들 */
  games?: Record<string, unknown>[]
  /** spend_tokens 결과 */
  spend?: { success: boolean; remaining_balance: number; error_message: string | null }
  /** prediction_slips insert 실패 여부 */
  slipInsertFails?: boolean
  /** betman_predictions insert 실패 (코드 지정 시 그 code 로) */
  predInsertFailCode?: string | true
}

const baseGame = (over: Record<string, unknown> = {}) => ({
  id: "game-1",
  round_id: "round-1",
  daily_round_id: "dr-1",
  sport: "축구",
  game_type: "win_lose",
  status: "scheduled",
  match_time: new Date(Date.now() + 3600_000).toISOString(),
  home_team_name: "서울",
  away_team_name: "수원",
  home_win_odds: "2.00",
  away_win_odds: "3.00",
  draw_odds: "3.50",
  over_odds: "1.90",
  under_odds: "1.95",
  odd_odds: "1.85",
  even_odds: "2.00",
  over_under_line: null,
  handicap: null,
  league_code: "K1",
  ...over,
})

function makeSupabase(o: Opts = {}) {
  const games = o.games ?? [baseGame()]
  const spend = o.spend ?? { success: true, remaining_balance: 7, error_message: null }
  const calls = {
    rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
    slipInserts: [] as Record<string, unknown>[],
    predInserts: [] as Record<string, unknown>[][],
    slipDeletes: [] as string[],
  }

  const client: any = {
    rpc: vi.fn((fn: string, args: Record<string, unknown>) => {
      calls.rpc.push({ fn, args })
      return { single: async () => ({ data: spend, error: null }) }
    }),
    from: vi.fn((table: string) => {
      if (table === "betman_games") {
        return { select: () => ({ in: async () => ({ data: games, error: null }) }) }
      }
      if (table === "betman_daily_rounds") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { id: "dr-1", status: "open" }, error: null }),
            }),
          }),
        }
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: { is_journalist: false }, error: null }) }),
          }),
        }
      }
      if (table === "prediction_slips") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
          insert: (row: Record<string, unknown>) => {
            calls.slipInserts.push(row)
            return {
              select: () => ({
                single: async () =>
                  o.slipInsertFails
                    ? { data: null, error: { message: "slip insert failed" } }
                    : { data: { id: "slip-1", ...row }, error: null },
              }),
            }
          },
          delete: () => ({
            eq: async (_c: string, id: string) => {
              calls.slipDeletes.push(id)
              return { error: null }
            },
          }),
        }
      }
      if (table === "betman_predictions") {
        return {
          insert: (rows: Record<string, unknown>[]) => {
            calls.predInserts.push(rows)
            return {
              select: async () =>
                o.predInsertFailCode
                  ? {
                      data: null,
                      error: {
                        message: "pred insert failed",
                        code: o.predInsertFailCode === true ? "XXXXX" : o.predInsertFailCode,
                      },
                    }
                  : { data: rows.map((r, i) => ({ id: `p${i}`, ...r })), error: null },
            }
          },
          select: () => ({
            eq: function () {
              return this
            },
            in: async () => ({ data: [], error: null }),
            then: (res: (v: unknown) => unknown) =>
              Promise.resolve({ data: [], error: null, count: 0 }).then(res),
          }),
        }
      }
      // 그 외(활동 피드·알림·팔로워 등)는 성공만 반환
      return {
        select: () => ({
          eq: function () {
            return this
          },
          in: async () => ({ data: [], error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
          single: async () => ({ data: null, error: null }),
          then: (res: (v: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null, count: 0 }).then(res),
        }),
        insert: async () => ({ data: null, error: null }),
        upsert: async () => ({ data: null, error: null }),
        update: () => ({ eq: async () => ({ error: null }) }),
        delete: () => ({ eq: async () => ({ error: null }) }),
      }
    }),
  }

  return { client, calls }
}

const req = (body: unknown) =>
  ({ json: async () => body, headers: new Headers() }) as unknown as Request

const loadRoute = async () => (await import("@/app/api/betman/prediction/route")).POST

const spendCalls = () => supabaseMock.calls.rpc.filter((c) => c.fn === "spend_tokens")

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  currentUserMock.mockResolvedValue({ id: "user-1" })
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("POST /api/betman/prediction — 볼 차감 계약", () => {
  it("정상 흐름: 볼을 차감하고 슬립과 예측을 만든다", async () => {
    supabaseMock = makeSupabase()
    const POST = await loadRoute()

    const res = await POST(
      req({ predictions: [{ game_id: "game-1", prediction: "home" }], betAmount: 3 }) as never
    )

    expect(res.status).toBe(200)
    expect(spendCalls()).toHaveLength(1)
    expect(spendCalls()[0].args.p_amount).toBe(3)
    expect(supabaseMock.calls.slipInserts).toHaveLength(1)
    expect(retryRefundTokensMock).not.toHaveBeenCalled()
  })

  /** ★ 순서 계약 — 배당 검증이 차감보다 먼저여야 한다 */
  it("배당이 0 인 경기는 볼을 차감하기 전에 거부한다", async () => {
    supabaseMock = makeSupabase({ games: [baseGame({ home_win_odds: "0" })] })
    const POST = await loadRoute()

    const res = await POST(
      req({ predictions: [{ game_id: "game-1", prediction: "home" }] }) as never
    )

    expect(res.status).toBe(400)
    // 차감이 일어났다면 환불 로직이 안 걸려 볼만 사라진다
    expect(spendCalls()).toHaveLength(0)
    expect(supabaseMock.calls.slipInserts).toHaveLength(0)
  })

  it("배당이 null 인 경기도 차감 전에 거부한다", async () => {
    supabaseMock = makeSupabase({ games: [baseGame({ home_win_odds: null })] })
    const POST = await loadRoute()

    const res = await POST(
      req({ predictions: [{ game_id: "game-1", prediction: "home" }] }) as never
    )

    expect(res.status).toBe(400)
    expect(spendCalls()).toHaveLength(0)
  })

  it("볼이 부족하면 슬립을 만들지 않는다", async () => {
    supabaseMock = makeSupabase({
      spend: { success: false, remaining_balance: 0, error_message: "insufficient" },
    })
    const POST = await loadRoute()

    const res = await POST(
      req({ predictions: [{ game_id: "game-1", prediction: "home" }] }) as never
    )

    expect(res.status).toBe(400)
    expect(supabaseMock.calls.slipInserts).toHaveLength(0)
    expect(retryRefundTokensMock).not.toHaveBeenCalled()
  })

  /** ★ 슬립 생성 실패 = 볼은 이미 빠진 상태 → 반드시 환불 */
  it("슬립 생성이 실패하면 차감액 전액을 환불한다", async () => {
    supabaseMock = makeSupabase({ slipInsertFails: true })
    const POST = await loadRoute()

    const res = await POST(
      req({ predictions: [{ game_id: "game-1", prediction: "home" }], betAmount: 5 }) as never
    )

    expect(res.status).toBe(500)
    expect(retryRefundTokensMock).toHaveBeenCalledTimes(1)
    // (supabase, userId, amount, description)
    expect(retryRefundTokensMock.mock.calls[0][1]).toBe("user-1")
    expect(retryRefundTokensMock.mock.calls[0][2]).toBe(5)
  })

  /** ★ 예측 저장 실패 = 슬립까지 지우고 환불 (고아 슬립 방지) */
  it("예측 저장이 실패하면 슬립을 삭제하고 환불한다", async () => {
    supabaseMock = makeSupabase({ predInsertFailCode: true })
    const POST = await loadRoute()

    const res = await POST(
      req({ predictions: [{ game_id: "game-1", prediction: "home" }], betAmount: 4 }) as never
    )

    expect(res.status).toBe(500)
    expect(supabaseMock.calls.slipDeletes).toContain("slip-1")
    expect(retryRefundTokensMock).toHaveBeenCalledTimes(1)
    expect(retryRefundTokensMock.mock.calls[0][2]).toBe(4)
  })

  it("중복 제출(23505)은 409 로 안내하고 환불한다", async () => {
    supabaseMock = makeSupabase({ predInsertFailCode: "23505" })
    const POST = await loadRoute()

    const res = await POST(
      req({ predictions: [{ game_id: "game-1", prediction: "home" }] }) as never
    )

    expect(res.status).toBe(409)
    expect(retryRefundTokensMock).toHaveBeenCalledTimes(1)
  })

  /** ★ total_odds 가 0 인 슬립이 열리면 정산이 조용히 틀어진다 */
  it("total_odds 는 검증에 쓴 배당의 곱이다", async () => {
    supabaseMock = makeSupabase({
      games: [
        baseGame({ id: "game-1", home_win_odds: "2.00" }),
        baseGame({
          id: "game-2",
          home_win_odds: "1.50",
          home_team_name: "전북",
          away_team_name: "울산",
        }),
      ],
    })
    const POST = await loadRoute()

    await POST(
      req({
        predictions: [
          { game_id: "game-1", prediction: "home" },
          { game_id: "game-2", prediction: "home" },
        ],
      }) as never
    )

    const slip = supabaseMock.calls.slipInserts[0]
    expect(slip.total_odds).toBe(3) // 2.00 × 1.50
    expect(slip.total_odds).not.toBe(0)
  })

  it("각 예측에 선택한 쪽의 배당이 locked_odds 로 박힌다", async () => {
    supabaseMock = makeSupabase()
    const POST = await loadRoute()

    await POST(req({ predictions: [{ game_id: "game-1", prediction: "away" }] }) as never)

    const rows = supabaseMock.calls.predInserts[0]
    expect(rows[0].locked_odds).toBe(3) // away_win_odds "3.00"
    expect(rows[0].prediction).toBe("away")
  })

  it("비로그인은 차감 없이 거부한다", async () => {
    currentUserMock.mockResolvedValue(null)
    supabaseMock = makeSupabase()
    const POST = await loadRoute()

    const res = await POST(
      req({ predictions: [{ game_id: "game-1", prediction: "home" }] }) as never
    )

    expect(res.status).toBe(401)
    expect(spendCalls()).toHaveLength(0)
  })
})

/**
 * 입력 검증 계약 — 전부 볼 차감 전에 400 으로 끝나야 한다.
 * (구 미러 테스트 betman-prediction.test.ts 43건이 복사본으로 검증하던 규칙을
 *  실제 라우트 행동으로 이관. 미러는 삭제됨 — test-gaps.md)
 */
describe("POST /api/betman/prediction — 입력 검증 (차감 전 거부)", () => {
  /** 검증 실패는 예외 없이: 400 + spend_tokens 0회 + 슬립 0개 */
  async function expectRejected(body: unknown) {
    const POST = await loadRoute()
    const res = await POST(req(body) as never)
    expect(res.status).toBe(400)
    expect(spendCalls()).toHaveLength(0)
    expect(supabaseMock.calls.slipInserts).toHaveLength(0)
    return res
  }

  beforeEach(() => {
    supabaseMock = makeSupabase()
  })

  it.each([
    ["0", 0],
    ["11 (MAX 10 초과)", 11],
    ["소수", 1.5],
  ])("betAmount %s → 400", async (_label, betAmount) => {
    await expectRejected({ predictions: [{ game_id: "game-1", prediction: "home" }], betAmount })
  })

  it("빈 predictions 배열 → 400", async () => {
    await expectRejected({ predictions: [] })
  })

  it("enum 밖의 prediction 값 → 400", async () => {
    await expectRejected({ predictions: [{ game_id: "game-1", prediction: "banker" }] })
  })

  it("두 종목 혼합 슬립 → 400 (단일 종목 규칙)", async () => {
    supabaseMock = makeSupabase({
      games: [
        baseGame({ id: "game-1", sport: "축구" }),
        baseGame({ id: "game-2", sport: "야구", home_team_name: "LG", away_team_name: "두산" }),
      ],
    })
    await expectRejected({
      predictions: [
        { game_id: "game-1", prediction: "home" },
        { game_id: "game-2", prediction: "home" },
      ],
    })
  })

  it("같은 경기 중복 선택 → 400", async () => {
    await expectRejected({
      predictions: [
        { game_id: "game-1", prediction: "home" },
        { game_id: "game-1", prediction: "draw" },
      ],
    })
  })

  it("진행 중(in_progress) 경기 → 400", async () => {
    supabaseMock = makeSupabase({ games: [baseGame({ status: "in_progress" })] })
    await expectRejected({ predictions: [{ game_id: "game-1", prediction: "home" }] })
  })

  it("언더오버 경기에 home 선택 → 400", async () => {
    supabaseMock = makeSupabase({ games: [baseGame({ game_type: "언더오버" })] })
    await expectRejected({ predictions: [{ game_id: "game-1", prediction: "home" }] })
  })

  it("일반 경기에 over 선택 → 400", async () => {
    await expectRejected({ predictions: [{ game_id: "game-1", prediction: "over" }] })
  })

  it("농구 일반 경기에 draw 선택 → 400 (무승부 없음)", async () => {
    supabaseMock = makeSupabase({ games: [baseGame({ sport: "농구" })] })
    await expectRejected({ predictions: [{ game_id: "game-1", prediction: "draw" }] })
  })

  it("전반전 마켓(S 접두사) → 400", async () => {
    supabaseMock = makeSupabase({ games: [baseGame({ game_type: "S일반" })] })
    await expectRejected({ predictions: [{ game_id: "game-1", prediction: "home" }] })
  })

  it("서로 다른 daily round 의 경기 혼합 → 400", async () => {
    supabaseMock = makeSupabase({
      games: [
        baseGame({ id: "game-1", daily_round_id: "dr-1" }),
        baseGame({
          id: "game-2",
          daily_round_id: "dr-2",
          home_team_name: "전북",
          away_team_name: "울산",
        }),
      ],
    })
    await expectRejected({
      predictions: [
        { game_id: "game-1", prediction: "home" },
        { game_id: "game-2", prediction: "home" },
      ],
    })
  })

  it("팀 미정 placeholder 경기 → 400", async () => {
    supabaseMock = makeSupabase({ games: [baseGame({ home_team_name: "미정" })] })
    await expectRejected({ predictions: [{ game_id: "game-1", prediction: "home" }] })
  })

  it("경기 시간 미정(match_time null) → 400 (NaN 마감 통과 버그 회귀 방지)", async () => {
    supabaseMock = makeSupabase({ games: [baseGame({ match_time: null })] })
    await expectRejected({ predictions: [{ game_id: "game-1", prediction: "home" }] })
  })
})

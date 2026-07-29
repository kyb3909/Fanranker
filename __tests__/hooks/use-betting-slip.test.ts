import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import type { GroupedMatch, SportsGame } from "@/types/betting"

/**
 * useBettingSlip — **실제 훅을 renderHook 으로 렌더해서** 검증한다.
 * (기존 파일은 훅을 import 하지 않고 로직 복사본 45케이스를 검증하는 미러였다 —
 *  test-gaps.md P4. hooks/ 폴더 커버리지가 0.00% 였던 이유.)
 *
 * 지키는 계약:
 *   1. totalOdds = 선택 배당의 곱, expectedReturn = floor(betAmount × totalOdds)
 *   2. 같은 매치 다른 마켓 → 교체 / 같은 선택 재클릭 → 해제 / 같은 게임 다른 선택 → 변경
 *   3. 단일 종목 슬립 — 타 종목 추가 거부
 *   4. 시작된 경기·마감 지난 게임 선택 거부
 *   5. 제출 전 검증(빈 슬립·0볼·MAX 10볼)은 fetch 자체를 막는다
 *   6. 제출은 /api/sports/prediction 프록시 경로로만 (betman 직접 노출 금지) +
 *      idempotency_key 포함
 *   7. 성공 → 슬립/금액/종목 초기화 + 완료 모달, 실패 → 슬립 유지 + 에러 모달
 */

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isSignedIn: false }), // 초기 잔액/프로필 fetch 이펙트 차단 (기본 10볼)
}))

const globalMutateMock = vi.fn()
vi.mock("swr", () => ({
  useSWRConfig: () => ({ mutate: globalMutateMock }),
}))

const trackEventMock = vi.fn()
vi.mock("@/lib/analytics/events", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}))

import { useBettingSlip } from "@/hooks/use-betting-slip"

/* ────────── 픽스처 ────────── */

const FUTURE = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
const PAST = new Date(Date.now() - 60 * 60 * 1000).toISOString()

function makeGame(id: string, over: Partial<SportsGame> = {}): SportsGame {
  return {
    id,
    round_id: "r1",
    game_no: 1,
    match_time: FUTURE,
    sport: "축구",
    league_code: "EPL",
    game_type: "일반",
    home_team_name: "아스날",
    away_team_name: "리버풀",
    handicap: null,
    over_under_line: null,
    venue: "에미레이트",
    status: "scheduled",
    ...over,
  }
}

function makeMatch(
  matchKey: string,
  games: SportsGame[],
  over: Partial<GroupedMatch> = {}
): GroupedMatch {
  return {
    matchKey,
    sport: games[0]?.sport ?? "축구",
    leagueCode: "EPL",
    homeTeam: "아스날",
    awayTeam: "리버풀",
    matchTime: FUTURE,
    venue: "에미레이트",
    games,
    ...over,
  }
}

const MATCHES: GroupedMatch[] = [
  makeMatch("m1", [makeGame("g1"), makeGame("g1-half", { is_half_time: true })]),
  makeMatch("m2", [makeGame("g2")]),
  makeMatch("m3-baseball", [makeGame("g3", { sport: "야구" })], { sport: "야구" }),
  makeMatch("m4-started", [makeGame("g4")], { matchTime: PAST }),
  makeMatch("m5-closed", [makeGame("g5", { bet_close_at: PAST })]),
]

function setup(matches: GroupedMatch[] = MATCHES) {
  const loadMatches = vi.fn()
  const utils = renderHook(() => useBettingSlip(matches, loadMatches))
  return { ...utils, loadMatches }
}

type SelectArgs = [string, string, string, string, string, number | null, number | null, number?]
const select = (
  gameId: string,
  matchKey: string,
  selection: string,
  odds?: number,
  sport = "축구"
): SelectArgs => [gameId, matchKey, selection, sport, "일반", null, null, odds]

/* ────────── 테스트 ────────── */

describe("useBettingSlip", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("배당·수익 계산", () => {
    it("totalOdds 는 선택 배당의 곱이다", () => {
      const { result } = setup()
      act(() => result.current.handleBetSelection(...select("g1", "m1", "home", 2.1)))
      act(() => result.current.handleBetSelection(...select("g2", "m2", "away", 3.0)))
      expect(result.current.totalOdds).toBeCloseTo(6.3)
    })

    it("expectedReturn = floor(betAmount × totalOdds)", () => {
      const { result } = setup()
      act(() => result.current.handleBetSelection(...select("g1", "m1", "home", 1.85)))
      act(() => result.current.setBetAmount(3))
      expect(result.current.expectedReturn).toBe(Math.floor(3 * 1.85)) // 5 — 내림, 반올림 아님
    })

    it("배당 없는 선택은 1 로 취급한다 (0 배당 슬립 금지)", () => {
      const { result } = setup()
      act(() => result.current.handleBetSelection(...select("g1", "m1", "home", undefined)))
      expect(result.current.totalOdds).toBe(1)
    })
  })

  describe("선택 규칙", () => {
    it("첫 선택이 슬립의 종목을 잠근다", () => {
      const { result } = setup()
      act(() => result.current.handleBetSelection(...select("g1", "m1", "home", 2.0)))
      expect(result.current.selectedSport).toBe("축구")
    })

    it("같은 게임 같은 선택 재클릭 → 해제 + 종목 잠금 해제", () => {
      const { result } = setup()
      act(() => result.current.handleBetSelection(...select("g1", "m1", "home", 2.0)))
      act(() => result.current.handleBetSelection(...select("g1", "m1", "home", 2.0)))
      expect(result.current.selectedBets).toHaveLength(0)
      expect(result.current.selectedSport).toBeNull()
    })

    it("같은 게임 다른 선택 → 선택·배당이 교체된다 (중복 추가 아님)", () => {
      const { result } = setup()
      act(() => result.current.handleBetSelection(...select("g1", "m1", "home", 2.0)))
      act(() => result.current.handleBetSelection(...select("g1", "m1", "away", 3.5)))
      expect(result.current.selectedBets).toHaveLength(1)
      expect(result.current.selectedBets[0]).toMatchObject({ selection: "away", odds: 3.5 })
    })

    it("같은 매치의 다른 마켓 선택 → 기존 베팅이 교체된다 (한 경기 한 픽)", () => {
      const { result } = setup()
      act(() => result.current.handleBetSelection(...select("g1", "m1", "home", 2.0)))
      act(() => result.current.handleBetSelection(...select("g1-half", "m1", "home", 1.5)))
      expect(result.current.selectedBets).toHaveLength(1)
      expect(result.current.selectedBets[0].gameId).toBe("g1-half")
    })

    it("다른 종목 추가 → 거부하고 경고 모달을 띄운다 (단일 종목 슬립)", () => {
      const { result } = setup()
      act(() => result.current.handleBetSelection(...select("g1", "m1", "home", 2.0)))
      act(() =>
        result.current.handleBetSelection(...select("g3", "m3-baseball", "home", 1.7, "야구"))
      )
      expect(result.current.selectedBets).toHaveLength(1)
      expect(result.current.selectedBets[0].sport).toBe("축구")
      expect(result.current.alertModal.isOpen).toBe(true)
      expect(result.current.alertModal.title).toContain("종목 조합 불가")
    })

    it("이미 시작된 경기는 선택할 수 없다", () => {
      const { result } = setup()
      act(() => result.current.handleBetSelection(...select("g4", "m4-started", "home", 2.0)))
      expect(result.current.selectedBets).toHaveLength(0)
      expect(result.current.alertModal.isOpen).toBe(true)
    })

    it("bet_close_at 이 지난 게임은 선택할 수 없다", () => {
      const { result } = setup()
      act(() => result.current.handleBetSelection(...select("g5", "m5-closed", "home", 2.0)))
      expect(result.current.selectedBets).toHaveLength(0)
      expect(result.current.alertModal.isOpen).toBe(true)
    })

    it("removeBet — 마지막 베팅 제거 시 종목 잠금도 풀린다", () => {
      const { result } = setup()
      act(() => result.current.handleBetSelection(...select("g1", "m1", "home", 2.0)))
      act(() => result.current.handleBetSelection(...select("g2", "m2", "away", 3.0)))
      act(() => result.current.removeBet("g1"))
      expect(result.current.selectedBets.map((b) => b.gameId)).toEqual(["g2"])
      expect(result.current.selectedSport).toBe("축구")
      act(() => result.current.removeBet("g2"))
      expect(result.current.selectedSport).toBeNull()
    })

    it("clearAllBets — 슬립과 종목 잠금이 초기화된다", () => {
      const { result } = setup()
      act(() => result.current.handleBetSelection(...select("g1", "m1", "home", 2.0)))
      act(() => result.current.clearAllBets())
      expect(result.current.selectedBets).toHaveLength(0)
      expect(result.current.selectedSport).toBeNull()
      expect(result.current.totalOdds).toBe(1)
    })
  })

  describe("제출 전 검증 — 실패 시 fetch 자체가 없어야 한다", () => {
    it("빈 슬립 → 경고 모달 + 네트워크 미호출", async () => {
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)
      const { result } = setup()
      await act(() => result.current.handleSubmitPrediction())
      expect(result.current.alertModal.isOpen).toBe(true)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it("betAmount 0 이하 → 거부", async () => {
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)
      const { result } = setup()
      act(() => result.current.handleBetSelection(...select("g1", "m1", "home", 2.0)))
      act(() => result.current.setBetAmount(0))
      await act(() => result.current.handleSubmitPrediction())
      expect(result.current.alertModal.isOpen).toBe(true)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it("MAX 10볼 초과 → 거부", async () => {
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)
      const { result } = setup()
      act(() => result.current.handleBetSelection(...select("g1", "m1", "home", 2.0)))
      act(() => result.current.setBetAmount(11))
      await act(() => result.current.handleSubmitPrediction())
      expect(result.current.alertModal.title).toContain("사용 볼 초과")
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe("제출", () => {
    it("성공 — /api/sports/prediction 프록시로 idempotency_key 포함 POST, 슬립 초기화 + 완료 모달", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: "ok", pickDistribution: [{ label: "홈", pct: 60 }] }),
      })
      vi.stubGlobal("fetch", fetchMock)
      const { result, loadMatches } = setup()

      act(() => result.current.handleBetSelection(...select("g1", "m1", "home", 2.0)))
      act(() => result.current.setBetAmount(5))
      await act(() => result.current.handleSubmitPrediction())

      // 프록시 경로 계약 — betman 을 클라이언트에서 직접 부르면 안 된다
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe("/api/sports/prediction")
      const body = JSON.parse((init as RequestInit).body as string)
      expect(body.predictions).toEqual([{ game_id: "g1", prediction: "home" }])
      expect(body.betAmount).toBe(5)
      expect(typeof body.idempotency_key).toBe("string")
      expect(body.idempotency_key.length).toBeGreaterThan(0)

      // 성공 후 상태 초기화 + 모달
      expect(result.current.selectedBets).toHaveLength(0)
      expect(result.current.selectedSport).toBeNull()
      expect(result.current.betAmount).toBe(1)
      expect(result.current.successModal.isOpen).toBe(true)
      expect(result.current.successModal.distribution).toHaveLength(1)
      expect(loadMatches).toHaveBeenCalled()
      expect(globalMutateMock).toHaveBeenCalledWith("/api/tokens/balance")
    })

    it("실패(res.ok=false) — 서버 에러 메시지로 에러 모달, 슬립은 유지된다", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "볼이 부족합니다" }),
      })
      vi.stubGlobal("fetch", fetchMock)
      const { result } = setup()

      act(() => result.current.handleBetSelection(...select("g1", "m1", "home", 2.0)))
      await act(() => result.current.handleSubmitPrediction())

      expect(result.current.alertModal.type).toBe("error")
      expect(result.current.alertModal.message).toContain("볼이 부족합니다")
      // 재시도할 수 있게 슬립이 남아 있어야 한다
      expect(result.current.selectedBets).toHaveLength(1)
      expect(result.current.successModal.isOpen).toBe(false)
      expect(result.current.isSubmittingPrediction).toBe(false)
    })
  })
})

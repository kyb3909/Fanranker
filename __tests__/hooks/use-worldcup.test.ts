import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"

/**
 * useWorldcup — **실제 훅을 renderHook 으로 렌더해서** 검증한다.
 * (기존 파일은 separateByes/shuffle 복사본만 검증하는 미러였다 — test-gaps.md P4 잔여분)
 *
 * 지키는 계약:
 *   1. 시작: 짝수 → 전원 대진, 홀수 → 마지막 1명 부전승(다음 라운드 직행)
 *   2. 투표 payload: session_id·round·match_index·양측 후보·winner_id
 *   3. 라운드 진행: 매치 소진 시 다음 라운드 재편성 + current_round 증가
 *   4. 최종 1인 → finish API + 통계 로드 + winner 확정
 *   5. battleId 없으면 시작하지 않음, API 실패 시 로딩/투표 플래그 원복
 */

import { useWorldcup } from "@/hooks/use-worldcup"

const candidate = (id: string) => ({
  id,
  battle_id: "battle-1",
  name: `후보 ${id}`,
  image_url: null,
  seed: 0,
  win_count: 0,
})

const SESSION = { id: "session-1", battle_id: "battle-1", current_round: 1, status: "active" }

/** URL prefix → 응답 매핑으로 fetch 목 구성. 호출 로그 반환 */
function mockFetchByUrl(routes: Record<string, unknown>) {
  const calls: Array<{ url: string; body: unknown }> = []
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : null })
    for (const [prefix, body] of Object.entries(routes)) {
      if (url.startsWith(prefix)) return { ok: true, json: async () => body }
    }
    return { ok: true, json: async () => ({}) }
  })
  vi.stubGlobal("fetch", fetchMock)
  return { fetchMock, calls }
}

async function start(result: { current: ReturnType<typeof useWorldcup> }, size?: number) {
  await act(() => result.current.startWorldcup(size))
}

describe("useWorldcup", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // shuffle 을 항등으로 고정 — 대진 순서를 결정적으로
    vi.spyOn(Math, "random").mockReturnValue(0.99)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("battleId 가 없으면 시작하지 않는다", async () => {
    const { fetchMock } = mockFetchByUrl({})
    const { result } = renderHook(() => useWorldcup(null))
    await start(result)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("짝수(4명) 시작 → 전원 대진, 부전승 없음, 첫 페어 세팅", async () => {
    mockFetchByUrl({
      "/api/battles/worldcup/start": {
        session: SESSION,
        candidates: [candidate("a"), candidate("b"), candidate("c"), candidate("d")],
      },
    })
    const { result } = renderHook(() => useWorldcup("battle-1"))
    await start(result)

    expect(result.current.roundCandidates).toHaveLength(4)
    expect(result.current.nextRoundCandidates).toHaveLength(0)
    expect(result.current.currentPair).not.toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.winner).toBeNull()
  })

  it("홀수(3명) 시작 → 마지막 1명은 부전승으로 다음 라운드 직행", async () => {
    mockFetchByUrl({
      "/api/battles/worldcup/start": {
        session: SESSION,
        candidates: [candidate("a"), candidate("b"), candidate("c")],
      },
    })
    const { result } = renderHook(() => useWorldcup("battle-1"))
    await start(result)

    expect(result.current.roundCandidates).toHaveLength(2)
    expect(result.current.nextRoundCandidates).toHaveLength(1)
  })

  it("투표 payload 계약 — session·round·match_index·양측·승자", async () => {
    const { calls } = mockFetchByUrl({
      "/api/battles/worldcup/start": {
        session: SESSION,
        candidates: [candidate("a"), candidate("b"), candidate("c"), candidate("d")],
      },
      "/api/battles/worldcup/stats": { stats: [] },
    })
    const { result } = renderHook(() => useWorldcup("battle-1"))
    await start(result)

    const [a, b] = result.current.currentPair!
    await act(() => result.current.vote(a.id))

    const voteCall = calls.find((c) => c.url.startsWith("/api/battles/worldcup/vote"))!
    expect(voteCall.body).toMatchObject({
      session_id: "session-1",
      round: 1,
      match_index: 0,
      candidate_a_id: a.id,
      candidate_b_id: b.id,
      winner_id: a.id,
    })
  })

  it("4강 풀 진행 — 라운드 재편성·current_round 증가·최종 finish + winner", async () => {
    const { calls } = mockFetchByUrl({
      "/api/battles/worldcup/start": {
        session: SESSION,
        candidates: [candidate("a"), candidate("b"), candidate("c"), candidate("d")],
      },
      "/api/battles/worldcup/stats": {
        stats: [{ candidate_id: "a", name: "후보 a", image_url: null, win_count: 3 }],
      },
    })
    const { result } = renderHook(() => useWorldcup("battle-1"))
    await start(result)

    // 1라운드 매치 1: 첫 번째 후보 승
    const m1winner = result.current.currentPair![0]
    await act(() => result.current.vote(m1winner.id))
    expect(result.current.currentMatchIndex).toBe(1)
    expect(result.current.winner).toBeNull()

    // 1라운드 매치 2 → 결승 라운드로 재편성
    const m2winner = result.current.currentPair![0]
    await act(() => result.current.vote(m2winner.id))
    expect(result.current.roundCandidates).toHaveLength(2)
    expect(result.current.session!.current_round).toBe(2)
    expect(result.current.currentMatchIndex).toBe(0)

    // 결승 → 우승 확정
    const finalWinner = result.current.currentPair![0]
    await act(() => result.current.vote(finalWinner.id))

    expect(result.current.winner?.id).toBe(finalWinner.id)
    const finishCall = calls.find((c) => c.url.startsWith("/api/battles/worldcup/finish"))!
    expect(finishCall.body).toMatchObject({ session_id: "session-1", winner_id: finalWinner.id })
    expect(result.current.stats).toHaveLength(1)
    expect(result.current.isVoting).toBe(false)
  })

  it("시작 API 실패 → 로딩 플래그 해제, 상태 유지", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")))
    const { result } = renderHook(() => useWorldcup("battle-1"))
    await start(result)

    expect(result.current.isLoading).toBe(false)
    expect(result.current.currentPair).toBeNull()
  })

  it("투표 API 실패 → isVoting 원복, 매치 진행 안 됨", async () => {
    const routes = mockFetchByUrl({
      "/api/battles/worldcup/start": {
        session: SESSION,
        candidates: [candidate("a"), candidate("b"), candidate("c"), candidate("d")],
      },
    })
    const { result } = renderHook(() => useWorldcup("battle-1"))
    await start(result)

    routes.fetchMock.mockRejectedValue(new Error("vote failed"))
    await act(() => result.current.vote(result.current.currentPair![0].id))

    expect(result.current.isVoting).toBe(false)
    expect(result.current.currentMatchIndex).toBe(0) // 진행 안 됨
  })
})

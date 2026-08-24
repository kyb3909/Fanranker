import { describe, it, expect, beforeAll, vi } from "vitest"
import * as playersMod from "@/lib/draft/players"
import type { Player, Position } from "@/lib/draft/players"
import {
  createInitialState,
  isValidPick,
  makePick,
  getCurrentSeat,
  getPickablePlayers,
  type Participant,
} from "@/lib/draft/engine"

/**
 * 예산 잔여 검사 — "예산을 다 쓰면 더는 영입을 못 한다"(운영자 제보)를 막는다.
 *
 * 종전엔 `budget < price` 만 봤다. 그래서 비싼 선수를 연달아 잡으면 11명을 못 채우고
 * 드래프트가 막혔다. 이제 **이 선수를 사고도 남은 자리를 채울 수 있는지**까지 본다.
 */

let seq = 0
const mk = (position: Position, price: number): Player => ({
  id: `t${++seq}`,
  name: `p${seq}`,
  nameKo: `선수${seq}`,
  team: "T",
  teamKo: "티",
  position,
  price,
})

/** 비싼 선수 몇 + 싼 선수 다수 — 실제 FPL 분포(£4 다수 + £15 소수)를 축소 재현 */
function pool(): Player[] {
  seq = 0
  const out: Player[] = []
  for (let i = 0; i < 6; i++) out.push(mk("GK", 4))
  for (let i = 0; i < 20; i++) out.push(mk("DF", 4))
  for (let i = 0; i < 20; i++) out.push(mk("MF", 4))
  for (let i = 0; i < 20; i++) out.push(mk("FW", 4))
  // 스타 몇 명
  out.push(mk("FW", 15), mk("MF", 12), mk("FW", 10), mk("DF", 9))
  return out
}

const solo = (): Participant[] => [{ seatIndex: 0, name: "나", isAI: false, formation: "4-4-2" }]

beforeAll(() => {
  vi.spyOn(playersMod, "getAllPlayers").mockImplementation(() => POOL)
})

let POOL: Player[] = []

describe("예산 잔여 검사", () => {
  it("남은 자리를 채울 수 없게 만드는 픽은 거부된다", () => {
    POOL = pool()
    // 예산 50, 11명. £15 를 사면 잔액 35 인데 남은 10명 최저가 합은 40 → 불가
    const state = createInitialState(solo(), 50)
    const star = POOL.find((p) => p.price === 15)!
    expect(isValidPick(state, 0, star.id)).toBe(false)
  })

  it("여유가 있으면 같은 선수도 허용된다", () => {
    POOL = pool()
    // 예산 60: £15 사면 잔액 45, 남은 10명 최저 40 → 가능
    const state = createInitialState(solo(), 60)
    const star = POOL.find((p) => p.price === 15)!
    expect(isValidPick(state, 0, star.id)).toBe(true)
  })

  it("⭐예산을 다 써서 막히는 상황이 만들어지지 않는다 — 끝까지 11명을 채운다", () => {
    POOL = pool()
    let state = createInitialState(solo(), 60)
    // 매번 **가장 비싼 유효 후보**를 고른다 = 사람이 저지를 수 있는 최악의 낭비
    for (let i = 0; i < 11; i++) {
      const options = getPickablePlayers(state, 0)
      expect(options.length).toBeGreaterThan(0) // 막히면 여기서 터진다
      const worst = options.reduce((a, b) => (b.price > a.price ? b : a))
      state = makePick(state, worst.id)
    }
    const roster = state.roster[0]
    expect(roster).toHaveLength(11)
    const spent = roster.reduce((s, p) => s + p.price, 0)
    expect(spent).toBeLessThanOrEqual(60)
  })

  it("마지막 픽에서는 잔액으로 살 수 있는 선수가 남아 있다", () => {
    POOL = pool()
    let state = createInitialState(solo(), 60)
    for (let i = 0; i < 10; i++) {
      const options = getPickablePlayers(state, 0)
      const worst = options.reduce((a, b) => (b.price > a.price ? b : a))
      state = makePick(state, worst.id)
    }
    expect(getPickablePlayers(state, 0).length).toBeGreaterThan(0)
  })

  it("4인 드래프트에서도 전원이 11명을 채운다", () => {
    POOL = pool()
    const four: Participant[] = [0, 1, 2, 3].map((i) => ({
      seatIndex: i,
      name: `P${i}`,
      isAI: true,
      formation: "4-4-2" as const,
    }))
    // 선수 풀을 넉넉히 (4팀 × 11명 = 44명 필요)
    POOL = [...pool(), ...pool().map((p) => ({ ...p, id: p.id + "b" }))]
    let state = createInitialState(four, 60)
    let guard = 0
    while (state.status === "drafting" && guard++ < 100) {
      const seat = getCurrentSeat(state)
      const options = getPickablePlayers(state, seat)
      expect(options.length).toBeGreaterThan(0)
      state = makePick(state, options.reduce((a, b) => (b.price > a.price ? b : a)).id)
    }
    for (const seat of [0, 1, 2, 3]) {
      expect(state.roster[seat]).toHaveLength(11)
      expect(state.roster[seat].reduce((s, p) => s + p.price, 0)).toBeLessThanOrEqual(60)
    }
  })
})

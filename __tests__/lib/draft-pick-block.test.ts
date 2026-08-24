import { describe, it, expect, beforeAll, vi } from "vitest"
import * as playersMod from "@/lib/draft/players"
import type { Player, Position } from "@/lib/draft/players"
import { createInitialState, makePick, pickBlockReason, type Participant } from "@/lib/draft/engine"

/**
 * 못 뽑는 이유 — 선수 풀이 엔진과 **같은 판정**을 쓰는지 지킨다.
 *
 * 종전엔 풀이 "그 포지션 인원 >= 포메이션 정원" 으로 따로 계산했다. 그래서 자격을
 * 유연하게 바꾼 뒤에도 화면에서는 여전히 잠겼다 — 운영자 제보:
 * "메리노가 미드로 되어 있지만 공격수로도 쓸 수 있는데 못 뽑는다".
 */

let seq = 0
const mk = (position: Position, price = 4): Player => ({
  id: `b${++seq}`,
  name: `p${seq}`,
  nameKo: `선수${seq}`,
  team: "T",
  teamKo: "티",
  position,
  price,
})

let POOL: Player[] = []
beforeAll(() => {
  vi.spyOn(playersMod, "getAllPlayers").mockImplementation(() => POOL)
})

const solo = (): Participant[] => [{ seatIndex: 0, name: "나", isAI: false, formation: "4-4-2" }]

describe("pickBlockReason", () => {
  it("⭐미드가 정원까지 찼어도 공격 자리가 비면 미드를 더 뽑을 수 있다 (메리노 사례)", () => {
    seq = 0
    const mids = [mk("MF"), mk("MF"), mk("MF"), mk("MF")]
    const extra = mk("MF") // 5번째 미드 — 4-4-2 의 MF 정원(4)을 넘는다
    POOL = [...mids, extra, ...Array.from({ length: 20 }, () => mk("DF"))]

    let state = createInitialState(solo(), 200)
    for (const m of mids) state = makePick(state, m.id)

    // 정원 기준이면 막혔을 픽 — FW 자리가 비어 있으니 통과해야 한다
    expect(pickBlockReason(state, 0, extra.id)).toBeNull()
  })

  it("설 수 있는 자리가 아예 없으면 slots 로 막는다", () => {
    seq = 0
    const gks = [mk("GK"), mk("GK")]
    POOL = [...gks, ...Array.from({ length: 20 }, () => mk("DF"))]
    let state = createInitialState(solo(), 200)
    state = makePick(state, gks[0].id) // GK 자리는 1개뿐
    expect(pickBlockReason(state, 0, gks[1].id)).toBe("slots")
  })

  it("잔액보다 비싸면 budget", () => {
    seq = 0
    const rich = mk("FW", 50)
    POOL = [rich, ...Array.from({ length: 20 }, () => mk("DF"))]
    const state = createInitialState(solo(), 40)
    expect(pickBlockReason(state, 0, rich.id)).toBe("budget")
  })

  it("살 수는 있지만 남은 자리를 못 채우면 reserve", () => {
    seq = 0
    const star = mk("FW", 15)
    POOL = [star, ...Array.from({ length: 30 }, () => mk("DF"))]
    // 예산 50, 11명. £15 를 사면 잔액 35 < 남은 10명 최저 합 40
    const state = createInitialState(solo(), 50)
    expect(pickBlockReason(state, 0, star.id)).toBe("reserve")
  })

  it("이미 뽑힌 선수는 taken", () => {
    seq = 0
    const p = mk("DF")
    POOL = [p, ...Array.from({ length: 20 }, () => mk("DF"))]
    let state = createInitialState(solo(), 200)
    state = makePick(state, p.id)
    expect(pickBlockReason(state, 0, p.id)).toBe("taken")
  })
})

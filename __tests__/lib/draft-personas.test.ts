import { describe, it, expect, beforeAll, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PERSONAS, personaForSeat } from "@/lib/draft/personas"
import type { Player, Position } from "@/lib/draft/players"
import * as playersMod from "@/lib/draft/players"
import {
  createInitialState,
  getAIPick,
  makePick,
  getCurrentSeat,
  type Participant,
} from "@/lib/draft/engine"

/**
 * AI 감독 성격 — 셋이 실제로 **다르게 뽑는지**를 시뮬레이션으로 확인한다.
 *
 * 사람 대 사람 대결이 성립하지 않는 상태(30일 신규 4명)라 솔로 vs AI 3인이 주력인데,
 * AI 셋이 같은 로직으로 뽑으면 매 판이 똑같아 두세 판이면 질린다. 성격이 결과에
 * 실제로 드러나지 않으면 이 기능은 있으나 마나다.
 */

function loadRealPlayers(): Player[] {
  // EPL 드래프트가 실제로 쓰는 데이터로 돈다 (arsenal 199명은 4팀 44픽이면 풀이 22% 빠져
  // 싼 선수가 먼저 팔리는 바람에 예비비 계산이 뒤늦게 무너진다 — 공유 풀의 구조적 한계)
  const p = join(process.cwd(), "public", "data", "fpl-players.json")
  return JSON.parse(readFileSync(p, "utf-8")) as Player[]
}

/** 성격 셋이 각각 11명을 뽑게 하고 포지션 분포·지출을 잰다 */
function runDraft(): Record<number, Player[]> {
  const participants: Participant[] = [
    { seatIndex: 0, name: "나", isAI: false, formation: "4-4-2" },
    { seatIndex: 1, name: "밸런스", isAI: true, formation: "4-4-2" },
    { seatIndex: 2, name: "수비", isAI: true, formation: "5-3-2" },
    { seatIndex: 3, name: "공격", isAI: true, formation: "3-4-3" },
  ]
  let state = createInitialState(participants, 80)
  while (state.status === "drafting") {
    const seat = getCurrentSeat(state)
    const id = getAIPick(state, seat, 0)
    state = makePick(state, id, true)
  }
  return state.roster
}

function countPos(roster: Player[]): Record<Position, number> {
  const c: Record<Position, number> = { GK: 0, DF: 0, MF: 0, FW: 0 }
  for (const p of roster) c[p.position]++
  return c
}

const spend = (roster: Player[]) => roster.reduce((s, p) => s + p.price, 0)

beforeAll(() => {
  // players 모듈은 브라우저 fetch 로 로드하므로, 시험에서는 실제 JSON 을 직접 주입한다
  const real = loadRealPlayers()
  vi.spyOn(playersMod, "getAllPlayers").mockReturnValue(real)
})

describe("성격 배정", () => {
  it("좌석 1·2·3 에 밸런스·수비·공격이 하나씩 들어간다", () => {
    const ids = [1, 2, 3].map((s) => personaForSeat(s, 0).id)
    expect(new Set(ids).size).toBe(3)
    expect(ids).toContain("balanced")
    expect(ids).toContain("defensive")
    expect(ids).toContain("attacking")
  })

  it("사람이 가운데 앉아도 셋이 안 겹친다", () => {
    const ids = [0, 2, 3].map((s) => personaForSeat(s, 1).id)
    expect(new Set(ids).size).toBe(3)
  })

  it("성격마다 포메이션 성향이 다르다", () => {
    expect(PERSONAS.defensive.formations.every((f) => f.startsWith("5"))).toBe(true)
    expect(PERSONAS.attacking.formations.some((f) => f.endsWith("3"))).toBe(true)
  })
})

describe("성격이 실제 픽에 드러난다", () => {
  it("수비형은 공격형보다 수비수를 많이 뽑는다", () => {
    // 무작위(top5 중 랜덤)가 섞이므로 여러 판 평균으로 본다
    let defDF = 0
    let atkDF = 0
    const RUNS = 12
    for (let i = 0; i < RUNS; i++) {
      const r = runDraft()
      defDF += countPos(r[2]).DF
      atkDF += countPos(r[3]).DF
    }
    expect(defDF / RUNS).toBeGreaterThan(atkDF / RUNS)
  })

  it("공격형은 수비형보다 공격수를 많이 뽑는다", () => {
    let defFW = 0
    let atkFW = 0
    const RUNS = 12
    for (let i = 0; i < RUNS; i++) {
      const r = runDraft()
      defFW += countPos(r[2]).FW
      atkFW += countPos(r[3]).FW
    }
    expect(atkFW / RUNS).toBeGreaterThan(defFW / RUNS)
  })

  it("모두 11명을 채우고 예산을 넘기지 않는다 — 자격 유연화 후에도 드래프트가 막히지 않는다", () => {
    const r = runDraft()
    for (const seat of [0, 1, 2, 3]) {
      expect(r[seat]).toHaveLength(11)
      expect(spend(r[seat])).toBeLessThanOrEqual(80)
    }
  })
})

/**
 * 드래프트 예산 산정 — 예산 구간별로 드래프트를 반복 시뮬레이션해 "적합한 £"를 찾는다.
 *
 *   pnpm exec tsx scripts/_draft-budget-sweep.ts [반복수]
 *
 * ## 무엇을 재는가
 * "적합한 예산"은 총액이 아니라 **선택의 긴장**이 있느냐다. 네 가지로 본다:
 *  1. 소진율      — 예산을 실제로 다 쓰는가. 많이 남으면 제약이 아니다.
 *  2. 스타 확보   — 한 팀이 £8+ 선수를 몇 명이나 잡는가. 전원이 여럿 잡으면 희소성이 없다.
 *  3. 전력 격차   — 팀 총액의 표준편차. 0에 가까우면 누가 뽑든 똑같다는 뜻이다.
 *  4. 막힘        — 11명을 못 채우거나 예산을 넘기는 판이 있는가 (있으면 그 예산은 탈락).
 */

import "dotenv/config"
import { readFileSync } from "fs"
import path from "path"

// players 모듈은 브라우저 fetch 로 로드한다 — 로컬 JSON 을 주는 fetch 로 바꿔치기한다.
const DATA = path.join(process.cwd(), "public", "data", "fpl-players.json")
const raw = readFileSync(DATA, "utf-8")
globalThis.fetch = (async (url: string) => {
  if (String(url).includes("fpl-players")) {
    return { ok: true, json: async () => JSON.parse(raw) } as unknown as Response
  }
  throw new Error("unexpected fetch " + url)
}) as typeof fetch

import { loadPlayers } from "../lib/draft/players"
import {
  createInitialState,
  getAIPick,
  makePick,
  getCurrentSeat,
  type Participant,
} from "../lib/draft/engine"

const RUNS = Number(process.argv[2] || 30)
const BUDGETS = [70, 76, 78, 80, 82, 85, 90]
const STAR = 8 // £8 이상 = 스타 (609명 중 12명뿐)

function runOne(budget: number) {
  const participants: Participant[] = [
    { seatIndex: 0, name: "A", isAI: true, formation: "4-4-2" },
    { seatIndex: 1, name: "B", isAI: true, formation: "4-4-2" },
    { seatIndex: 2, name: "C", isAI: true, formation: "5-3-2" },
    { seatIndex: 3, name: "D", isAI: true, formation: "3-4-3" },
  ]
  let state = createInitialState(participants, budget)
  let guard = 0
  while (state.status === "drafting" && guard++ < 200) {
    const seat = getCurrentSeat(state)
    state = makePick(state, getAIPick(state, seat, 0), true)
  }
  return [0, 1, 2, 3].map((s) => {
    const roster = state.roster[s] ?? []
    const spent = roster.reduce((a, p) => a + p.price, 0)
    return {
      count: roster.length,
      spent,
      left: budget - spent,
      stars: roster.filter((p) => p.price >= STAR).length,
      over: spent > budget + 1e-9,
    }
  })
}

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length
const sd = (a: number[]) => {
  const m = mean(a)
  return Math.sqrt(mean(a.map((v) => (v - m) ** 2)))
}

async function main() {
  await loadPlayers("fpl-players.json")
  console.log(`반복 ${RUNS}판 × 4팀 = 팀 표본 ${RUNS * 4}개\n`)
  console.log("예산   소진율   남는돈   스타/팀  스타0팀  전력격차  막힘")
  console.log("─".repeat(66))

  const rows: { budget: number; useRate: number; stars: number; zero: number; spread: number }[] =
    []

  for (const budget of BUDGETS) {
    const teams: ReturnType<typeof runOne>[number][] = []
    for (let i = 0; i < RUNS; i++) teams.push(...runOne(budget))

    const incomplete = teams.filter((t) => t.count !== 11).length
    const over = teams.filter((t) => t.over).length
    const spents = teams.map((t) => t.spent)
    const useRate = (mean(spents) / budget) * 100
    const starsPer = mean(teams.map((t) => t.stars))
    const zeroStar = (teams.filter((t) => t.stars === 0).length / teams.length) * 100
    const spread = sd(spents)

    console.log(
      `£${String(budget).padEnd(4)} ` +
        `${useRate.toFixed(1).padStart(6)}%  ` +
        `£${(budget - mean(spents)).toFixed(1).padStart(5)}  ` +
        `${starsPer.toFixed(2).padStart(7)}  ` +
        `${zeroStar.toFixed(0).padStart(6)}%  ` +
        `${spread.toFixed(2).padStart(7)}  ` +
        `${incomplete + over > 0 ? `⚠️ ${incomplete + over}` : "없음"}`
    )
    rows.push({ budget, useRate, stars: starsPer, zero: zeroStar, spread })
  }

  console.log("\n해석")
  console.log("  소진율이 낮으면 예산이 제약이 아니다 (아무나 다 산다)")
  console.log(`  스타 = £${STAR} 이상. 609명 중 12명뿐이라 4팀이 나눠 가지면 팀당 3명이 상한`)
  console.log("  '스타0팀' 비율이 0%면 전원이 스타를 갖는다 = 희소성 없음")
  console.log("  전력격차가 0에 가까우면 누가 뽑든 결과가 같다")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

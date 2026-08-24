import { getAllPlayers, type Player, type Position } from "./players"
import { canAssignAll, formationSlots } from "./positions"
import { personaForSeat } from "./personas"

export type Formation = "4-4-2" | "4-3-3" | "3-5-2" | "3-4-3" | "5-3-2" | "5-4-1"

export const FORMATIONS: Record<Formation, Record<Position, number>> = {
  "4-4-2": { GK: 1, DF: 4, MF: 4, FW: 2 },
  "4-3-3": { GK: 1, DF: 4, MF: 3, FW: 3 },
  "3-5-2": { GK: 1, DF: 3, MF: 5, FW: 2 },
  "3-4-3": { GK: 1, DF: 3, MF: 4, FW: 3 },
  "5-3-2": { GK: 1, DF: 5, MF: 3, FW: 2 },
  "5-4-1": { GK: 1, DF: 5, MF: 4, FW: 1 },
}

export interface Participant {
  seatIndex: number
  name: string
  isAI: boolean
  formation: Formation
  avatarUrl?: string
}

interface Pick {
  pickNumber: number
  seatIndex: number
  playerId: string
  isAutoPick: boolean
}

export interface DraftState {
  participants: Participant[]
  picks: Pick[]
  currentPick: number
  snakeOrder: number[]
  status: "setup" | "drafting" | "completed"
  budget: number[]
  /** 게임 시작 시점의 1인당 예산. 잔액 표시에 필요 (잔액은 budget[]). */
  initialBudget: number
  roster: Record<number, Player[]>
  draftedPlayerIds: Set<string>
  totalRounds: number
}

const DEFAULT_BUDGET = 80.0
const TOTAL_ROUNDS = 11

/** 좌석별 포지션 제한 가져오기 */
export function getSeatLimits(state: DraftState, seatIndex: number): Record<Position, number> {
  const participant = state.participants.find((p) => p.seatIndex === seatIndex)
  if (!participant) return { GK: 1, DF: 4, MF: 4, FW: 2 }
  return FORMATIONS[participant.formation]
}

/** 스네이크 드래프트 순서 생성: 1→2→3→4→4→3→2→1→... */
export function generateSnakeOrder(playerCount: number, rounds: number): number[] {
  const order: number[] = []
  for (let round = 0; round < rounds; round++) {
    const seats = Array.from({ length: playerCount }, (_, i) => i)
    if (round % 2 === 1) seats.reverse()
    order.push(...seats)
  }
  return order
}

/** 초기 상태 생성. budget 생략 시 80 (EPL 호환 기본값). */
export function createInitialState(
  participants: Participant[],
  initialBudget: number = DEFAULT_BUDGET
): DraftState {
  const snakeOrder = generateSnakeOrder(participants.length, TOTAL_ROUNDS)
  const budget = participants.map(() => initialBudget)
  const roster: Record<number, Player[]> = {}
  participants.forEach((p) => {
    roster[p.seatIndex] = []
  })

  return {
    participants,
    picks: [],
    currentPick: 0,
    snakeOrder,
    status: "drafting",
    budget,
    initialBudget,
    roster,
    draftedPlayerIds: new Set(),
    totalRounds: TOTAL_ROUNDS,
  }
}

/** 현재 차례의 좌석 인덱스 */
export function getCurrentSeat(state: DraftState): number {
  return state.snakeOrder[state.currentPick]
}

/** 현재 라운드 (1-based) */
export function getCurrentRound(state: DraftState): number {
  return Math.floor(state.currentPick / state.participants.length) + 1
}

/** 해당 좌석의 포지션별 픽 수 */
function getPositionCounts(state: DraftState, seatIndex: number): Record<Position, number> {
  const counts: Record<Position, number> = { GK: 0, DF: 0, MF: 0, FW: 0 }
  for (const player of state.roster[seatIndex] || []) {
    counts[player.position]++
  }
  return counts
}

/** 해당 좌석의 남은 픽 수 */
function getRemainingPicks(state: DraftState, seatIndex: number): number {
  const picked = (state.roster[seatIndex] || []).length
  return TOTAL_ROUNDS - picked
}

/** 픽이 유효한지 검사 */
export function isValidPick(state: DraftState, seatIndex: number, playerId: string): boolean {
  if (state.draftedPlayerIds.has(playerId)) return false

  const player = getAllPlayers().find((p: Player) => p.id === playerId)
  if (!player) return false

  if (state.budget[seatIndex] < player.price) return false

  // 포지션 자격 (2026-08-25) — 종전엔 `counts[pos] >= limits[pos]` 로 **개수**를 셌다.
  // 그러면 "수비수를 하나 더 뽑아 미드에 세우기"가 불가능하다. 이제 묻는 것은
  // **이 선수를 더해도 11자리에 전원 배치가 되느냐**다 (canAssignAll, 이분 매칭).
  const participant = state.participants.find((p) => p.seatIndex === seatIndex)
  const slots = formationSlots(participant?.formation ?? "4-4-2")
  const roster = state.roster[seatIndex] || []
  const nextPositions = [...roster.map((p) => p.position), player.position]
  if (!canAssignAll(nextPositions, slots)) return false

  // ⚠️ 예산 잔여 검사 (2026-08-25 운영자 제보: "예산을 다 소비해버리면 더는 영입을 못 한다").
  //    종전 코드에는 "남은 픽으로 나머지 **포지션**을 채울 수 있는가" 검사가 있었는데,
  //    자격을 유연화하면서 그 자리를 canAssignAll 로 갈아 끼우며 **예산 쪽 검사를 빠뜨렸다**.
  //    AI 에는 예비비를 넣어 뒀지만 사람에게는 없어서, 비싼 선수를 연달아 잡으면
  //    11명을 못 채우고 막혔다. 여기서 막으면 사람·AI 가 같은 규칙으로 보호된다.
  const remainingAfter = getRemainingPicks(state, seatIndex) - 1
  if (remainingAfter > 0) {
    const { asc, prefix } = cheapestIndex(state)
    // 이 선수를 빼고 남는 것 중 가장 싼 `remainingAfter` 명의 합이 최소 필요액이다.
    // 후보가 그 구간 안에 들어 있으면 한 칸 더 보고 자기 값을 뺀다.
    const pos = lowerBound(asc, player.price)
    const need =
      pos < remainingAfter
        ? prefix[Math.min(remainingAfter + 1, asc.length)] - player.price
        : prefix[Math.min(remainingAfter, asc.length)]
    if (asc.length - 1 < remainingAfter) return false // 남은 선수 수가 부족
    if (state.budget[seatIndex] - player.price < need - 1e-9) return false
  }

  return true
}

/**
 * 미드래프트 선수 가격의 오름차순 배열과 누적합.
 *
 * isValidPick 은 선수 풀 전체(600명+)에 대해 매 렌더 호출된다 — 매번 정렬하면
 * O(n² log n) 이 된다. `draftedPlayerIds` Set 은 픽마다 새로 만들어지므로
 * 그 객체를 열쇠로 캐시하면 픽이 바뀔 때 자동으로 무효화된다.
 */
const cheapestCache = new WeakMap<object, { asc: number[]; prefix: number[] }>()
function cheapestIndex(state: DraftState) {
  const hit = cheapestCache.get(state.draftedPlayerIds)
  if (hit) return hit
  const asc = getAllPlayers()
    .filter((p: Player) => !state.draftedPlayerIds.has(p.id))
    .map((p: Player) => p.price)
    .sort((a, b) => a - b)
  const prefix = [0]
  for (const v of asc) prefix.push(prefix[prefix.length - 1] + v)
  const entry = { asc, prefix }
  cheapestCache.set(state.draftedPlayerIds, entry)
  return entry
}

/** asc 에서 value 가 들어갈 첫 위치 */
function lowerBound(asc: number[], value: number): number {
  let lo = 0
  let hi = asc.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (asc[mid] < value) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** 픽 실행 - 새 state 반환 */
export function makePick(state: DraftState, playerId: string, isAutoPick = false): DraftState {
  const seatIndex = getCurrentSeat(state)
  const player = getAllPlayers().find((p: Player) => p.id === playerId)!

  const newPick: Pick = {
    pickNumber: state.currentPick,
    seatIndex,
    playerId,
    isAutoPick,
  }

  const newDraftedIds = new Set(state.draftedPlayerIds)
  newDraftedIds.add(playerId)

  const newRoster = { ...state.roster }
  newRoster[seatIndex] = [...(newRoster[seatIndex] || []), player]

  const newBudget = [...state.budget]
  newBudget[seatIndex] = Math.round((newBudget[seatIndex] - player.price) * 10) / 10

  const nextPick = state.currentPick + 1
  const isCompleted = nextPick >= state.snakeOrder.length

  return {
    ...state,
    picks: [...state.picks, newPick],
    currentPick: nextPick,
    roster: newRoster,
    budget: newBudget,
    draftedPlayerIds: newDraftedIds,
    status: isCompleted ? "completed" : "drafting",
  }
}

/** AI 픽 로직 - 필요 포지션과 가성비 고려 */
export function getAIPick(state: DraftState, seatIndex: number, mySeat = 0): string {
  const limits = getSeatLimits(state, seatIndex)
  const counts = getPositionCounts(state, seatIndex)
  const remaining = getRemainingPicks(state, seatIndex)
  const budget = state.budget[seatIndex]

  // 필수로 채워야 할 포지션 확인
  const urgentPositions: Position[] = []
  let otherNeeded = 0
  for (const pos of ["GK", "DF", "MF", "FW"] as Position[]) {
    const needed = limits[pos] - counts[pos]
    if (needed > 0) {
      otherNeeded += needed
      if (remaining <= otherNeeded + 1) {
        urgentPositions.push(pos)
      }
    }
  }

  // 후보 선수 필터링 — 개수가 아니라 **배치 가능성**으로 거른다 (isValidPick 과 같은 자)
  const allPlayers = getAllPlayers()
  const undraftedAll = allPlayers.filter((p: Player) => !state.draftedPlayerIds.has(p.id))
  // 남은 픽을 살 돈은 남겨 둔다 — 안 그러면 비싼 선수를 먼저 잡고 후반에 아무도 못 산다.
  // 공격형(starBias 1.35)이 특히 여기서 걸렸다.
  // ⚠️ "가장 싼 선수 × 남은 픽" 으로 잡으면 과소 추정된다 — 싼 선수부터 팔리기 때문이다
  //    (실측: 그 방식으로도 £80 예산에 £81 을 썼다). 남은 픽 수만큼 **실제로 가장 싼
  //    선수들의 합**을 남겨야 정확하다.
  const ascPrices = undraftedAll.map((p) => p.price).sort((a, b) => a - b)
  const reserve = ascPrices.slice(0, Math.max(0, remaining - 1)).reduce((s, v) => s + v, 0)
  const spendCap = budget - reserve

  // isValidPick 이 이미 예산과 배치 가능성을 다 본다 — 여기서 나온 후보는 절대 예산을
  // 넘지 않는다. 캡은 그 위에 얹는 **선호**일 뿐이라, 캡 때문에 후보가 비면 캡만 버린다.
  const valid = undraftedAll.filter((p: Player) => isValidPick(state, seatIndex, p.id))
  const withinCap = valid.filter((p: Player) => p.price <= spendCap)
  // 캡 안에 아무도 없으면 **가장 싼 유효 후보 하나**로 좁힌다. 여기서 캡을 통째로
  // 버리면 비싼 선수를 집어 후반에 돈이 말라 다시 초과가 난다 (실측 82 → 81 로만 줄었다).
  const available =
    withinCap.length > 0
      ? withinCap
      : valid.length > 0
        ? [valid.reduce((min, p) => (p.price < min.price ? p : min))]
        : []

  if (available.length === 0) {
    // ⚠️ 종전엔 마지막 줄이 `allPlayers[0].id` 였다 — **예산을 아예 무시**해서 잔액이
    //    바닥나면 AI 가 £80 짜리 팀에 £140 을 쓰기도 했다 (시뮬레이션 12판 실측).
    //    남은 선수 중 **가장 싼 쪽**으로 떨어뜨린다. 그래도 못 사면 어쩔 수 없지만
    //    최소한 초과폭이 최소가 된다.
    const undrafted = allPlayers.filter((p: Player) => !state.draftedPlayerIds.has(p.id))
    const affordable = undrafted.filter((p: Player) => p.price <= budget)
    const pool = affordable.length > 0 ? affordable : undrafted
    if (pool.length === 0) return allPlayers[0].id
    return pool.reduce((min, p) => (p.price < min.price ? p : min)).id
  }

  // urgent 포지션이 있으면 해당 포지션 우선
  let candidates = available
  if (urgentPositions.length > 0) {
    const urgentCandidates = available.filter((p) => urgentPositions.includes(p.position))
    if (urgentCandidates.length > 0) {
      candidates = urgentCandidates
    }
  }

  const avgBudgetPerPick = budget / remaining
  // 감독 성격 (2026-08-25) — 셋이 같은 로직으로 뽑으면 매 판이 똑같다.
  // 포지션 선호와 스타 선호 두 손잡이로 성격을 낸다 (lib/draft/personas.ts).
  const persona = personaForSeat(seatIndex, mySeat)

  const scoreOf = (p: Player) => {
    // 목표가: starBias 가 크면 평균보다 비싼 선수를 노린다
    const target = avgBudgetPerPick * 1.2 * persona.starBias
    const fit = p.price - Math.abs(p.price - target)
    return fit * persona.posWeight[p.position]
  }

  candidates.sort((a, b) => scoreOf(b) - scoreOf(a))

  const topN = Math.min(5, candidates.length)
  const randomIndex = Math.floor(Math.random() * topN)
  return candidates[randomIndex].id
}

/** 가용 선수 목록 (드래프트 안 된 선수) */
export function getAvailablePlayers(state: DraftState): Player[] {
  return getAllPlayers().filter((p: Player) => !state.draftedPlayerIds.has(p.id))
}

/** 특정 좌석이 픽 가능한 선수 목록 */
export function getPickablePlayers(state: DraftState, seatIndex: number): Player[] {
  return getAllPlayers().filter((p: Player) => isValidPick(state, seatIndex, p.id))
}

import { getAllPlayers, type Player, type Position } from "./players"

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

export interface Pick {
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

  const limits = getSeatLimits(state, seatIndex)
  const counts = getPositionCounts(state, seatIndex)
  if (counts[player.position] >= limits[player.position]) return false

  // 남은 픽으로 나머지 포지션을 채울 수 있는지 확인
  const remaining = getRemainingPicks(state, seatIndex) - 1
  const newCounts = { ...counts }
  newCounts[player.position]++
  let neededSlots = 0
  for (const pos of ["GK", "DF", "MF", "FW"] as Position[]) {
    const needed = limits[pos] - newCounts[pos]
    if (needed > 0) neededSlots += needed
  }
  if (neededSlots > remaining) return false

  return true
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
export function getAIPick(state: DraftState, seatIndex: number): string {
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

  // 후보 선수 필터링
  const allPlayers = getAllPlayers()
  const available = allPlayers.filter((p: Player) => {
    if (state.draftedPlayerIds.has(p.id)) return false
    if (p.price > budget) return false
    if (counts[p.position] >= limits[p.position]) return false
    return true
  })

  if (available.length === 0) {
    const fallback = allPlayers.find(
      (p: Player) => !state.draftedPlayerIds.has(p.id) && p.price <= budget
    )
    return fallback?.id || allPlayers[0].id
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

  candidates.sort((a, b) => {
    const scoreA = a.price - Math.abs(a.price - avgBudgetPerPick * 1.2)
    const scoreB = b.price - Math.abs(b.price - avgBudgetPerPick * 1.2)
    return scoreB - scoreA
  })

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

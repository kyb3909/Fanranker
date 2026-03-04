import type { DraftPlayer, DraftPick, GameModeConfig, PositionConstraint } from './types'

/**
 * 현재 팀의 포지션별 선택 수 계산
 */
export function getPositionCounts(
  picks: DraftPick[],
  seatIndex: number,
  allPlayers: DraftPlayer[]
): Record<string, number> {
  const playerMap = new Map(allPlayers.map(p => [p.id, p]))
  const counts: Record<string, number> = {}

  for (const pick of picks) {
    if (pick.seat_index !== seatIndex) continue
    const player = playerMap.get(pick.player_id)
    if (player) {
      counts[player.position] = (counts[player.position] || 0) + 1
    }
  }

  return counts
}

/**
 * 포지션 제약 조건 검증
 * 이미 max에 도달한 포지션의 선수는 뽑을 수 없음
 */
export function validatePositionConstraint(
  position: string,
  positionCounts: Record<string, number>,
  constraints: PositionConstraint[]
): { valid: boolean; reason?: string } {
  const constraint = constraints.find(c => c.position === position)
  if (!constraint) return { valid: true } // 제약 없는 포지션은 허용

  const current = positionCounts[position] || 0
  if (current >= constraint.max) {
    return {
      valid: false,
      reason: `${constraint.label} 포지션은 최대 ${constraint.max}명까지 선택 가능합니다 (현재 ${current}명)`,
    }
  }

  return { valid: true }
}

/**
 * 샐러리캡 검증
 */
export function validateSalaryCap(
  playerCost: number,
  currentSpent: number,
  salaryCap: number,
  remainingPicks: number
): { valid: boolean; reason?: string } {
  const newTotal = currentSpent + playerCost
  // 남은 픽에 최소 비용(가정: 4.0)을 확보해야 함
  const minReserve = (remainingPicks - 1) * 4.0
  if (newTotal + minReserve > salaryCap) {
    return {
      valid: false,
      reason: `예산 초과: 현재 ${currentSpent}${playerCost} 선택 시 남은 ${remainingPicks - 1}명을 뽑기 어렵습니다 (캡: ${salaryCap})`,
    }
  }
  if (newTotal > salaryCap) {
    return {
      valid: false,
      reason: `예산 초과: ${currentSpent} + ${playerCost} = ${newTotal} > ${salaryCap}`,
    }
  }

  return { valid: true }
}

/**
 * 현재 팀의 총 사용 비용 계산
 */
export function calculateSpent(
  picks: DraftPick[],
  seatIndex: number,
  allPlayers: DraftPlayer[]
): number {
  const playerMap = new Map(allPlayers.map(p => [p.id, p]))
  let total = 0

  for (const pick of picks) {
    if (pick.seat_index !== seatIndex) continue
    const player = playerMap.get(pick.player_id)
    if (player) total += player.cost
  }

  return total
}

/**
 * 필요한 포지션 중 가장 부족한 포지션 찾기
 */
function getMostNeededPosition(
  positionCounts: Record<string, number>,
  constraints: PositionConstraint[]
): string | null {
  let maxDeficit = 0
  let neededPosition: string | null = null

  for (const c of constraints) {
    const current = positionCounts[c.position] || 0
    const deficit = c.min - current
    if (deficit > maxDeficit) {
      maxDeficit = deficit
      neededPosition = c.position
    }
  }

  return neededPosition
}

/**
 * 자동 픽: 가장 필요한 포지션의 최고 몸값 선수 선택
 */
export function autoPickPlayer(
  picks: DraftPick[],
  seatIndex: number,
  allPlayers: DraftPlayer[],
  config: GameModeConfig
): DraftPlayer | null {
  const pickedIds = new Set(picks.map(p => p.player_id))
  const available = allPlayers.filter(p => !pickedIds.has(p.id))
  if (available.length === 0) return null

  const positionCounts = getPositionCounts(picks, seatIndex, allPlayers)
  const spent = calculateSpent(picks, seatIndex, allPlayers)
  const myPickCount = picks.filter(p => p.seat_index === seatIndex).length
  const remainingPicks = config.picksPerTeam - myPickCount
  const remainingBudget = config.salaryCap - spent

  // 1. 가장 부족한 포지션 찾기
  const neededPosition = getMostNeededPosition(positionCounts, config.positions)

  // 2. 해당 포지션에서 예산 내 최고 비용 선수
  const candidates = available
    .filter(p => {
      if (neededPosition && p.position === neededPosition) return true
      if (!neededPosition) {
        // 필수 포지션 다 채웠으면 max 안 넘는 포지션 아무거나
        const c = config.positions.find(c => c.position === p.position)
        const current = positionCounts[p.position] || 0
        if (c && current >= c.max) return false
        return true
      }
      return false
    })
    .filter(p => {
      const minReserve = (remainingPicks - 1) * 4.0
      return p.cost <= remainingBudget - minReserve
    })
    .sort((a, b) => b.cost - a.cost)

  if (candidates.length > 0) return candidates[0]

  // 3. 후보 없으면 예산 내 아무나
  const fallback = available
    .filter(p => p.cost <= remainingBudget)
    .sort((a, b) => b.cost - a.cost)

  return fallback[0] || available.sort((a, b) => a.cost - b.cost)[0]
}

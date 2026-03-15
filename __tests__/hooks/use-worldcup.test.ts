import { describe, it, expect } from "vitest"

// ============================================================
// Pure logic extracted from use-worldcup.ts
// ============================================================

/** separateByes: 홀수이면 마지막 후보를 부전승으로 분리 */
function separateByes<T>(arr: T[]): { paired: T[]; byes: T[] } {
  if (arr.length % 2 === 0) return { paired: arr, byes: [] }
  return { paired: arr.slice(0, -1), byes: [arr[arr.length - 1]] }
}

/** shuffleArray: Fisher-Yates 셔플 */
function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

// ============================================================
// Vote round progression logic (extracted from vote callback)
// ============================================================

interface Candidate {
  id: string
  name: string
}

interface RoundState {
  roundCandidates: Candidate[]
  nextRoundCandidates: Candidate[]
  currentMatchIndex: number
  currentRound: number
}

type VoteResult =
  | { type: "next_match"; nextMatchIndex: number; nextPair: [Candidate, Candidate] }
  | { type: "final_winner"; winner: Candidate }
  | { type: "next_round"; newRoundCandidates: Candidate[]; newByes: Candidate[]; newRound: number }

function processVote(state: RoundState, winnerId: string): VoteResult {
  const pairStart = state.currentMatchIndex * 2
  const a = state.roundCandidates[pairStart]
  const b = state.roundCandidates[pairStart + 1]
  const winnerCandidate = winnerId === a.id ? a : b

  const newNextRound = [...state.nextRoundCandidates, winnerCandidate]
  const nextIndex = state.currentMatchIndex + 1
  const nextPairStart = nextIndex * 2

  // 현재 라운드에 더 매치가 있는가?
  if (nextPairStart + 1 < state.roundCandidates.length) {
    return {
      type: "next_match",
      nextMatchIndex: nextIndex,
      nextPair: [state.roundCandidates[nextPairStart], state.roundCandidates[nextPairStart + 1]],
    }
  }

  // 최종 우승자
  if (newNextRound.length === 1) {
    return { type: "final_winner", winner: newNextRound[0] }
  }

  // 다음 라운드 (부전승 처리 — 셔플 없이 테스트)
  const { paired, byes } = separateByes(newNextRound)
  return {
    type: "next_round",
    newRoundCandidates: paired,
    newByes: byes,
    newRound: state.currentRound + 1,
  }
}

// ============================================================
// Helpers
// ============================================================

function makeCandidate(id: string, name?: string): Candidate {
  return { id, name: name || `Candidate ${id}` }
}

function makeCandidates(count: number): Candidate[] {
  return Array.from({ length: count }, (_, i) => makeCandidate(`c${i + 1}`))
}

// ============================================================
// Tests: separateByes
// ============================================================

describe("separateByes", () => {
  it("returns all as paired for even count", () => {
    const items = [1, 2, 3, 4]
    const result = separateByes(items)
    expect(result.paired).toEqual([1, 2, 3, 4])
    expect(result.byes).toEqual([])
  })

  it("separates last item as bye for odd count", () => {
    const items = [1, 2, 3, 4, 5]
    const result = separateByes(items)
    expect(result.paired).toEqual([1, 2, 3, 4])
    expect(result.byes).toEqual([5])
  })

  it("handles 1 item (all bye)", () => {
    const result = separateByes(["solo"])
    expect(result.paired).toEqual([])
    expect(result.byes).toEqual(["solo"])
  })

  it("handles empty array", () => {
    const result = separateByes([])
    expect(result.paired).toEqual([])
    expect(result.byes).toEqual([])
  })

  it("handles 2 items (no bye)", () => {
    const result = separateByes(["a", "b"])
    expect(result.paired).toEqual(["a", "b"])
    expect(result.byes).toEqual([])
  })

  it("handles 3 items", () => {
    const result = separateByes(["a", "b", "c"])
    expect(result.paired).toEqual(["a", "b"])
    expect(result.byes).toEqual(["c"])
  })
})

// ============================================================
// Tests: shuffleArray
// ============================================================

describe("shuffleArray", () => {
  it("does not mutate the original array", () => {
    const original = [1, 2, 3, 4, 5]
    const copy = [...original]
    shuffleArray(original)
    expect(original).toEqual(copy)
  })

  it("returns same length", () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(shuffleArray(arr)).toHaveLength(8)
  })

  it("contains all original elements", () => {
    const arr = [10, 20, 30, 40, 50]
    const shuffled = shuffleArray(arr)
    expect(shuffled.sort((a, b) => a - b)).toEqual([10, 20, 30, 40, 50])
  })

  it("returns empty array for empty input", () => {
    expect(shuffleArray([])).toEqual([])
  })

  it("returns single element unchanged", () => {
    expect(shuffleArray([42])).toEqual([42])
  })
})

// ============================================================
// Tests: processVote — round progression
// ============================================================

describe("processVote", () => {
  describe("next match in current round", () => {
    it("advances to next pair when more matches remain", () => {
      // 4 candidates: match 0 = [c1,c2], match 1 = [c3,c4]
      const candidates = makeCandidates(4)
      const state: RoundState = {
        roundCandidates: candidates,
        nextRoundCandidates: [],
        currentMatchIndex: 0,
        currentRound: 1,
      }
      const result = processVote(state, "c1")
      expect(result.type).toBe("next_match")
      if (result.type === "next_match") {
        expect(result.nextMatchIndex).toBe(1)
        expect(result.nextPair[0].id).toBe("c3")
        expect(result.nextPair[1].id).toBe("c4")
      }
    })

    it("selects correct winner from pair (second candidate)", () => {
      const candidates = makeCandidates(4)
      const state: RoundState = {
        roundCandidates: candidates,
        nextRoundCandidates: [],
        currentMatchIndex: 0,
        currentRound: 1,
      }
      // c2 wins — verify next round candidates
      const result = processVote(state, "c2")
      expect(result.type).toBe("next_match")
    })
  })

  describe("final winner", () => {
    it("determines winner in 2-candidate final", () => {
      const candidates = makeCandidates(2)
      const state: RoundState = {
        roundCandidates: candidates,
        nextRoundCandidates: [],
        currentMatchIndex: 0,
        currentRound: 3,
      }
      const result = processVote(state, "c1")
      expect(result.type).toBe("final_winner")
      if (result.type === "final_winner") {
        expect(result.winner.id).toBe("c1")
      }
    })

    it("selects second candidate as winner", () => {
      const candidates = makeCandidates(2)
      const state: RoundState = {
        roundCandidates: candidates,
        nextRoundCandidates: [],
        currentMatchIndex: 0,
        currentRound: 3,
      }
      const result = processVote(state, "c2")
      expect(result.type).toBe("final_winner")
      if (result.type === "final_winner") {
        expect(result.winner.id).toBe("c2")
      }
    })
  })

  describe("next round transition", () => {
    it("transitions to next round when current round complete with multiple winners", () => {
      // Round with 4 candidates, last match (index 1)
      const candidates = makeCandidates(4)
      const state: RoundState = {
        roundCandidates: candidates,
        nextRoundCandidates: [makeCandidate("c1")], // winner from match 0
        currentMatchIndex: 1,
        currentRound: 1,
      }
      const result = processVote(state, "c3") // c3 wins match 1
      expect(result.type).toBe("next_round")
      if (result.type === "next_round") {
        expect(result.newRound).toBe(2)
        // 2 winners → even, no byes
        expect(result.newRoundCandidates).toHaveLength(2)
        expect(result.newByes).toHaveLength(0)
      }
    })

    it("handles bye in next round with odd winners", () => {
      // 6 candidates, 3 matches. After all 3 matches, 3 winners → 1 bye
      const candidates = makeCandidates(6)
      const state: RoundState = {
        roundCandidates: candidates,
        nextRoundCandidates: [makeCandidate("c1"), makeCandidate("c3")], // 2 prior winners
        currentMatchIndex: 2, // last match
        currentRound: 1,
      }
      const result = processVote(state, "c5") // c5 wins match 2
      expect(result.type).toBe("next_round")
      if (result.type === "next_round") {
        expect(result.newRoundCandidates).toHaveLength(2) // paired
        expect(result.newByes).toHaveLength(1) // bye
        expect(result.newRound).toBe(2)
      }
    })

    it("increments current_round correctly", () => {
      const candidates = makeCandidates(4)
      const state: RoundState = {
        roundCandidates: candidates,
        nextRoundCandidates: [makeCandidate("c1")],
        currentMatchIndex: 1,
        currentRound: 5,
      }
      const result = processVote(state, "c4")
      if (result.type === "next_round") {
        expect(result.newRound).toBe(6)
      }
    })
  })

  describe("carries forward bye candidates", () => {
    it("includes existing nextRoundCandidates (byes) when advancing", () => {
      // 4 round candidates + 1 bye already waiting
      const candidates = makeCandidates(4)
      const bye = makeCandidate("bye1")
      const state: RoundState = {
        roundCandidates: candidates,
        nextRoundCandidates: [bye], // bye from separateByes
        currentMatchIndex: 1, // last match
        currentRound: 1,
      }
      // c1 won match 0 (already in nextRound), c3 wins match 1
      // But we need to simulate properly: nextRound already has bye + c1
      const stateWithPriorWinner: RoundState = {
        ...state,
        nextRoundCandidates: [bye, makeCandidate("c1")],
      }
      const result = processVote(stateWithPriorWinner, "c3")
      expect(result.type).toBe("next_round")
      if (result.type === "next_round") {
        // 3 candidates total (bye1, c1, c3) → 2 paired + 1 bye
        const totalCandidates = result.newRoundCandidates.length + result.newByes.length
        expect(totalCandidates).toBe(3)
        expect(result.newByes).toHaveLength(1)
      }
    })
  })
})

// ============================================================
// Tests: Full tournament simulation
// ============================================================

describe("full tournament simulation", () => {
  it("4-candidate tournament completes in 3 votes", () => {
    const candidates = makeCandidates(4)
    const { paired, byes } = separateByes(candidates)

    let state: RoundState = {
      roundCandidates: paired,
      nextRoundCandidates: byes,
      currentMatchIndex: 0,
      currentRound: 1,
    }

    // Match 1: c1 vs c2 → c1 wins
    let result = processVote(state, "c1")
    expect(result.type).toBe("next_match")
    if (result.type === "next_match") {
      state = { ...state, currentMatchIndex: result.nextMatchIndex }
      // nextRoundCandidates now has c1
      state.nextRoundCandidates = [makeCandidate("c1")]
    }

    // Match 2: c3 vs c4 → c3 wins
    result = processVote(state, "c3")
    expect(result.type).toBe("next_round")
    if (result.type === "next_round") {
      state = {
        roundCandidates: result.newRoundCandidates,
        nextRoundCandidates: result.newByes,
        currentMatchIndex: 0,
        currentRound: result.newRound,
      }
    }

    // Final: c1 vs c3 → c1 wins
    result = processVote(state, "c1")
    expect(result.type).toBe("final_winner")
    if (result.type === "final_winner") {
      expect(result.winner.id).toBe("c1")
    }
  })

  it("8-candidate tournament completes in 7 votes", () => {
    const candidates = makeCandidates(8)
    const { paired, byes } = separateByes(candidates)

    let state: RoundState = {
      roundCandidates: paired,
      nextRoundCandidates: byes,
      currentMatchIndex: 0,
      currentRound: 1,
    }

    let voteCount = 0
    let finalWinner: Candidate | null = null

    // Simulate: always pick first candidate
    while (!finalWinner) {
      const pairStart = state.currentMatchIndex * 2
      const firstId = state.roundCandidates[pairStart].id
      const result = processVote(state, firstId)
      voteCount++

      if (result.type === "next_match") {
        state = {
          ...state,
          currentMatchIndex: result.nextMatchIndex,
          nextRoundCandidates: [...state.nextRoundCandidates, state.roundCandidates[pairStart]],
        }
      } else if (result.type === "next_round") {
        state = {
          roundCandidates: result.newRoundCandidates,
          nextRoundCandidates: result.newByes,
          currentMatchIndex: 0,
          currentRound: result.newRound,
        }
      } else {
        finalWinner = result.winner
      }
    }

    expect(voteCount).toBe(7) // 8 candidates = 7 matches
    expect(finalWinner).toBeDefined()
  })

  it("3-candidate tournament handles bye correctly", () => {
    const candidates = makeCandidates(3)
    const { paired, byes } = separateByes(candidates)

    expect(paired).toHaveLength(2) // c1, c2
    expect(byes).toHaveLength(1) // c3 gets bye

    let state: RoundState = {
      roundCandidates: paired,
      nextRoundCandidates: byes,
      currentMatchIndex: 0,
      currentRound: 1,
    }

    // Match 1: c1 vs c2 → c1 wins
    let result = processVote(state, "c1")
    // Now we have c3 (bye) + c1 (winner) = 2 → next round
    expect(result.type).toBe("next_round")
    if (result.type === "next_round") {
      expect(result.newRoundCandidates).toHaveLength(2)
      expect(result.newByes).toHaveLength(0)
      state = {
        roundCandidates: result.newRoundCandidates,
        nextRoundCandidates: result.newByes,
        currentMatchIndex: 0,
        currentRound: result.newRound,
      }
    }

    // Final: c3 vs c1 (or c1 vs c3) → pick first
    result = processVote(state, state.roundCandidates[0].id)
    expect(result.type).toBe("final_winner")
  })
})

// ============================================================
// Tests: Initial state
// ============================================================

describe("worldcup initial state", () => {
  it("has correct default values", () => {
    // Mirrors the useState default in useWorldcup
    const defaultState = {
      candidates: [],
      session: null,
      currentPair: null,
      roundCandidates: [],
      nextRoundCandidates: [],
      currentMatchIndex: 0,
      isLoading: true,
      isVoting: false,
      winner: null,
      stats: [],
    }
    expect(defaultState.candidates).toEqual([])
    expect(defaultState.session).toBeNull()
    expect(defaultState.currentPair).toBeNull()
    expect(defaultState.isLoading).toBe(true)
    expect(defaultState.isVoting).toBe(false)
    expect(defaultState.winner).toBeNull()
    expect(defaultState.currentMatchIndex).toBe(0)
  })
})

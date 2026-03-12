import { useState, useCallback } from "react"
import type { WorldcupCandidate, WorldcupSession } from "@/components/battle/battle-types"

interface WorldcupState {
  candidates: WorldcupCandidate[]
  session: WorldcupSession | null
  currentPair: [WorldcupCandidate, WorldcupCandidate] | null
  roundCandidates: WorldcupCandidate[]
  nextRoundCandidates: WorldcupCandidate[]
  currentMatchIndex: number
  isLoading: boolean
  isVoting: boolean
  winner: WorldcupCandidate | null
  stats: { candidate_id: string; name: string; image_url: string | null; win_count: number }[]
}

export function useWorldcup(battleId: string | null) {
  const [state, setState] = useState<WorldcupState>({
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
  })

  // 월드컵 시작
  const startWorldcup = useCallback(
    async (bracketSize?: number) => {
      if (!battleId) return
      setState((prev) => ({ ...prev, isLoading: true }))
      try {
        const res = await fetch("/api/battles/worldcup/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ battle_id: battleId, bracket_size: bracketSize }),
        })
        const data = await res.json()
        if (data.session && data.candidates) {
          const shuffled = shuffleArray(data.candidates as WorldcupCandidate[])
          // 부전승 처리: 홀수면 마지막 후보 자동 진출
          const { paired, byes } = separateByes(shuffled)
          setState((prev) => ({
            ...prev,
            candidates: data.candidates,
            session: data.session,
            roundCandidates: paired,
            nextRoundCandidates: byes, // 부전승 후보들은 다음 라운드로 바로 이동
            currentMatchIndex: 0,
            currentPair: paired.length >= 2 ? [paired[0], paired[1]] : null,
            isLoading: false,
            winner: null,
          }))
        }
      } catch {
        setState((prev) => ({ ...prev, isLoading: false }))
      }
    },
    [battleId]
  )

  // 투표 (한 쌍에서 하나 선택)
  const vote = useCallback(
    async (winnerId: string) => {
      if (!state.session || !state.currentPair) return
      setState((prev) => ({ ...prev, isVoting: true }))

      const [a, b] = state.currentPair
      const winnerCandidate = winnerId === a.id ? a : b

      try {
        await fetch("/api/battles/worldcup/vote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: state.session.id,
            round: state.session.current_round,
            match_index: state.currentMatchIndex,
            candidate_a_id: a.id,
            candidate_b_id: b.id,
            winner_id: winnerId,
          }),
        })

        const newNextRound = [...state.nextRoundCandidates, winnerCandidate]
        const nextIndex = state.currentMatchIndex + 1
        const nextPairStart = nextIndex * 2

        // 현재 라운드에 더 매치가 있는가?
        if (nextPairStart + 1 < state.roundCandidates.length) {
          setState((prev) => ({
            ...prev,
            nextRoundCandidates: newNextRound,
            currentMatchIndex: nextIndex,
            currentPair: [
              prev.roundCandidates[nextPairStart],
              prev.roundCandidates[nextPairStart + 1],
            ],
            isVoting: false,
          }))
        } else if (newNextRound.length === 1) {
          // 최종 우승자!
          await fetch("/api/battles/worldcup/finish", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session_id: state.session.id,
              winner_id: newNextRound[0].id,
            }),
          })
          // 통계 로드
          const statsRes = await fetch(`/api/battles/worldcup/stats?battle_id=${battleId}`)
          const statsData = await statsRes.json()
          setState((prev) => ({
            ...prev,
            winner: newNextRound[0],
            isVoting: false,
            stats: statsData.stats ?? [],
          }))
        } else {
          // 다음 라운드로 (부전승 처리 포함)
          const shuffled = shuffleArray(newNextRound)
          const { paired, byes } = separateByes(shuffled)
          setState((prev) => ({
            ...prev,
            roundCandidates: paired,
            nextRoundCandidates: byes,
            currentMatchIndex: 0,
            currentPair: paired.length >= 2 ? [paired[0], paired[1]] : null,
            session: prev.session
              ? { ...prev.session, current_round: prev.session.current_round + 1 }
              : null,
            isVoting: false,
          }))
        }
      } catch {
        setState((prev) => ({ ...prev, isVoting: false }))
      }
    },
    [
      state.session,
      state.currentPair,
      state.currentMatchIndex,
      state.roundCandidates,
      state.nextRoundCandidates,
      battleId,
    ]
  )

  // 통계 로드
  const loadStats = useCallback(async () => {
    if (!battleId) return
    try {
      const res = await fetch(`/api/battles/worldcup/stats?battle_id=${battleId}`)
      const data = await res.json()
      setState((prev) => ({ ...prev, stats: data.stats ?? [] }))
    } catch {
      // ignore
    }
  }, [battleId])

  return {
    ...state,
    startWorldcup,
    vote,
    loadStats,
  }
}

// 부전승 처리: 홀수이면 마지막 후보를 부전승으로 다음 라운드에 넣음
function separateByes<T>(arr: T[]): { paired: T[]; byes: T[] } {
  if (arr.length % 2 === 0) return { paired: arr, byes: [] }
  // 마지막 후보가 부전승
  return { paired: arr.slice(0, -1), byes: [arr[arr.length - 1]] }
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

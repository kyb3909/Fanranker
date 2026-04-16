import { useState, useCallback } from "react"
import useSWR from "swr"
import type {
  BattleRoom,
  BattleSide,
  BattleComment,
  BattleParticipant,
} from "@/components/battle/battle-types"
import { fetcher } from "@/lib/swr"
import { CHEER_BATTLE_POLL_INTERVAL } from "@/lib/constants/intervals"

export function useCheerBattle(battleId: string | null) {
  const [isJoining, setIsJoining] = useState(false)
  const [isCommenting, setIsCommenting] = useState(false)

  const { data, isLoading, mutate } = useSWR(
    battleId ? `/api/battles/rooms/${battleId}` : null,
    fetcher,
    { refreshInterval: CHEER_BATTLE_POLL_INTERVAL, revalidateOnFocus: true }
  )

  const room: BattleRoom | null = data?.room ?? null
  const sides: BattleSide[] = data?.sides ?? []
  const comments: BattleComment[] = data?.comments ?? []
  const myParticipant: BattleParticipant | null = data?.myParticipant ?? null

  const joinSide = useCallback(
    async (sideId: string) => {
      if (!battleId) return
      setIsJoining(true)
      try {
        const res = await fetch("/api/battles/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ battle_id: battleId, side_id: sideId }),
        })
        const result = await res.json()
        if (result.participant) {
          mutate()
        }
      } catch {
        // silent
      } finally {
        setIsJoining(false)
      }
    },
    [battleId, mutate]
  )

  const addComment = useCallback(
    async (content: string) => {
      if (!battleId || !myParticipant) return
      setIsCommenting(true)
      try {
        const res = await fetch("/api/battles/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            battle_id: battleId,
            side_id: myParticipant.side_id,
            content,
          }),
        })
        const result = await res.json()
        if (result.comment) {
          // 옵티미스틱: 새 댓글 + 점수 반영 후 revalidate
          mutate(
            (prev: typeof data) =>
              prev
                ? {
                    ...prev,
                    comments: [result.comment, ...(prev.comments ?? [])],
                    sides: (prev.sides ?? []).map((s: BattleSide) =>
                      s.id === myParticipant.side_id ? { ...s, score: s.score + 1 } : s
                    ),
                  }
                : prev,
            { revalidate: true }
          )
        }
      } catch {
        // silent
      } finally {
        setIsCommenting(false)
      }
    },
    [battleId, myParticipant, mutate]
  )

  return {
    room,
    sides,
    comments,
    myParticipant,
    isLoading,
    isJoining,
    isCommenting,
    joinSide,
    addComment,
    refresh: () => mutate(),
  }
}

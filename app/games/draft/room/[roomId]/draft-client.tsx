'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useDraftRoom } from '@/hooks/use-draft-room'
import { useGuestId } from '@/hooks/use-guest-id'
import { getDraftMode } from '@/lib/draft/modes'
import { draftGet } from '@/lib/draft/api'
import { RoomLobby } from '@/components/draft/room-lobby'
import { DraftBoard } from '@/components/draft/draft-board'
import { GameResult } from '@/components/draft/game-result'
import Link from 'next/link'
import type { GameModeConfig, DraftRoom, DraftResult, RoomParticipant, DraftPlayer } from '@/lib/draft/types'

interface Props {
  roomId: number
}

export function DraftRoomClient({ roomId }: Props) {
  const guestId = useGuestId()

  // 게스트 ID (Clerk 불필요)
  const userId = guestId || null

  const { config } = useRoomConfig(roomId)
  const state = useDraftRoom(roomId, config, userId)
  const router = useRouter()

  if (!userId || state.isLoading || !state.room) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-2">
          <div className="h-8 w-8 mx-auto animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">방 로딩 중...</p>
        </div>
      </div>
    )
  }

  if (state.room.status === 'abandoned') {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <p className="text-lg font-semibold text-foreground">방이 폐기되었습니다</p>
          <Link href="/games/draft" className="text-sm text-primary hover:underline">
            돌아가기
          </Link>
        </div>
      </div>
    )
  }

  const handleLeave = async () => {
    await state.leaveRoom()
    router.push('/games/draft')
  }

  // Waiting - Lobby
  if (state.room.status === 'waiting') {
    return (
      <div className="px-4 py-8">
        <RoomLobby
          room={state.room}
          participants={state.participants}
          myUserId={userId}
          onReady={state.toggleReady}
          onStart={state.startGame}
          onLeave={handleLeave}
          onFillBots={state.fillBots}
        />
      </div>
    )
  }

  // Completed - Results
  if (state.room.status === 'completed' && config) {
    return (
      <div className="px-4 py-8">
        <GameResultWrapper
          roomId={roomId}
          participants={state.participants}
          allPlayers={config.getPlayers()}
          salaryUnit={config.salaryUnit}
          myUserId={userId}
        />
      </div>
    )
  }

  // Drafting
  if (state.room.status === 'drafting' && config) {
    return (
      <div className="px-4 py-4 h-[calc(100vh-120px)]">
        <DraftBoard
          room={state.room}
          participants={state.participants}
          picks={state.picks}
          availablePlayers={state.availablePlayers}
          allPlayers={config.getPlayers()}
          config={config}
          mySeatIndex={state.mySeatIndex}
          isMyTurn={state.isMyTurn}
          budgets={state.budgets}
          positionCounts={state.positionCounts}
          onPick={state.makePick}
          onAutoPick={state.triggerAutoPick}
        />
      </div>
    )
  }

  return null
}

// ============================
// Helper hooks
// ============================
function useRoomConfig(roomId: number) {
  const [config, setConfig] = useState<GameModeConfig | null>(null)

  useEffect(() => {
    draftGet(`/api/games/draft/rooms/${roomId}`)
      .then(res => res.json())
      .then(data => {
        if (data.room) {
          const mode = getDraftMode(data.room.game_mode_id)
          setConfig(mode || null)
        }
      })
      .catch(() => {})
  }, [roomId])

  return { config }
}

function GameResultWrapper({
  roomId,
  participants,
  allPlayers,
  salaryUnit,
  myUserId,
}: {
  roomId: number
  participants: RoomParticipant[]
  allPlayers: DraftPlayer[]
  salaryUnit: string
  myUserId: string | null
}) {
  const [results, setResults] = useState<DraftResult[]>([])

  useEffect(() => {
    draftGet(`/api/games/draft/rooms/${roomId}`)
      .then(res => res.json())
      .then(data => {
        if (data.results) setResults(data.results)
      })
      .catch(() => {})
  }, [roomId])

  if (results.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <GameResult
      results={results}
      participants={participants}
      allPlayers={allPlayers}
      salaryUnit={salaryUnit}
      myUserId={myUserId}
    />
  )
}

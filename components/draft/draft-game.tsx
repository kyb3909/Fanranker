"use client"

import { DraftBoard } from "./draft-board"
import { DraftSetup } from "./draft-setup"
import { DraftResult } from "./draft-result"
import { FormationField, pitchSlotsToPlacements } from "./formation-field"
import { mergeRosterIntoSlots } from "./pitch-viz"
import { useDraftGame } from "./use-draft-game"

export function DraftGame({ slug }: { slug: string }) {
  const game = useDraftGame(slug)

  if (game.phase === "setup") {
    return (
      <DraftSetup
        entry={game.entry}
        mode={game.mode}
        setMode={game.setMode}
        aiCount={game.aiCount}
        setAiCount={game.setAiCount}
        mySeat={game.mySeat}
        setMySeat={game.setMySeat}
        playerName={game.playerName}
        setPlayerName={game.setPlayerName}
        myFormation={game.myFormation}
        setMyFormation={game.setMyFormation}
        onStart={game.startGame}
      />
    )
  }

  if (game.phase === "placement" && game.state) {
    const myParticipant = game.state.participants.find((p) => p.seatIndex === game.mySeat)
    const myRoster = game.state.roster[game.mySeat] || []
    const formation = myParticipant?.formation || "4-3-3"

    return (
      <FormationField
        formation={formation}
        roster={myRoster}
        // 드래프트 중 도판에 놓은 자리를 그대로 이어받는다 (2026-08-25).
        // 여기서 빈손으로 시작하면 방금 11명을 배치한 유저가 "미배치 선수 (11)" 을 다시 만난다.
        initialPlacements={pitchSlotsToPlacements(
          mergeRosterIntoSlots(game.arrangement, myRoster, formation),
          formation
        )}
        onComplete={() => game.setPhase("completed")}
      />
    )
  }

  if (game.phase === "completed" && game.state) {
    return <DraftResult state={game.state} mySeat={game.mySeat} onRestart={game.handleRestart} />
  }

  if (!game.state) return null

  return (
    <DraftBoard
      state={game.state}
      mySeat={game.mySeat}
      onPick={game.handlePick}
      onTimeout={game.handleTimeout}
      timerReset={game.timerReset}
      arranged={game.arrangement}
      onArrange={game.setArrangement}
    />
  )
}

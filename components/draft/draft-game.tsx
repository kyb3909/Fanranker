"use client"

import { DraftBoard } from "./draft-board"
import { DraftSetup } from "./draft-setup"
import { DraftResult } from "./draft-result"
import { FormationField } from "./formation-field"
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

    return (
      <FormationField
        formation={myParticipant?.formation || "4-3-3"}
        roster={myRoster}
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
    />
  )
}

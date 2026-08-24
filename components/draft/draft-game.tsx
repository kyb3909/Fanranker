"use client"

import { DraftBoard } from "./draft-board"
import { DraftSetup } from "./draft-setup"
import { DraftResult } from "./draft-result"
import { FormationField, pitchSlotsToPlacements, placementsToPitchSlots } from "./formation-field"
import { mergeRosterIntoSlots } from "./pitch-viz"
import { useDraftGame } from "./use-draft-game"
import { usePickStats } from "./use-pick-stats"

export function DraftGame({ slug }: { slug: string }) {
  const game = useDraftGame(slug)
  // 우리 유저 픽 통계 — 풀 뱃지와 결과 표가 같은 데이터를 본다
  const pickStats = usePickStats(slug, game.playersLoaded)

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
        /* ⚠️ 종전엔 placements 를 받아 놓고 **버렸다** — 공들여 짠 스쿼드가 결과 화면에
           도달을 못 해 텍스트 목록만 나왔다 (2026-08-25). 도판 좌표계로 되돌려 넘긴다. */
        onComplete={(placements) => {
          game.setArrangement(placementsToPitchSlots(placements, formation))
          game.setPhase("completed")
        }}
      />
    )
  }

  if (game.phase === "completed" && game.state) {
    return (
      <DraftResult
        state={game.state}
        mySeat={game.mySeat}
        arrangement={game.arrangement}
        pickStats={pickStats}
        onRestart={game.handleRestart}
      />
    )
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
      pickStats={pickStats}
    />
  )
}

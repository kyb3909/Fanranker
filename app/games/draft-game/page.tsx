"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { DndContext, type DragEndEvent, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core"
import { ArrowLeft, Shuffle, Zap } from "lucide-react"
import { GAME_MODES, GAME_MODE_LIST, generateSnakeDraftOrder, TEAM_PRESETS } from "@/lib/draft/game-modes"
import { saveDraftResult } from "@/lib/draft/history"
import { PlayerPool } from "@/components/draft/player-pool"
import { TeamBoard } from "@/components/draft/team-board"
import { DraftOrder } from "@/components/draft/draft-order"
import { DraftResults } from "@/components/draft/draft-results"
import type { Player, Team, GameConfig } from "@/lib/draft/types"

type GamePhase = "select" | "drafting" | "results"

export default function DraftGamePage() {
  const [phase, setPhase] = useState<GamePhase>("select")
  const [selectedMode, setSelectedMode] = useState<GameConfig | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [draftOrder, setDraftOrder] = useState<number[]>([])
  const [currentPick, setCurrentPick] = useState(0)
  const [draftedIds, setDraftedIds] = useState<Set<string>>(new Set())
  const [timeLeft, setTimeLeft] = useState(30)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 5 } })
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  const sensors = useSensors(mouseSensor, touchSensor)

  const currentTeamIdx = draftOrder[currentPick] ?? 0
  const isGameOver = selectedMode ? currentPick >= selectedMode.totalPicks : false

  // Start a game mode
  const startGame = (mode: GameConfig) => {
    setSelectedMode(mode)

    const newTeams: Team[] = TEAM_PRESETS.map((preset) => ({
      ...preset,
      players: [],
      budget: mode.budget,
    }))

    setTeams(newTeams)
    setDraftOrder(generateSnakeDraftOrder(mode.totalPicks, 4))
    setCurrentPick(0)
    setDraftedIds(new Set())
    setTimeLeft(mode.timerSeconds)
    setPhase("drafting")
  }

  // Callbacks ordered by dependency chain: finishGame → advancePick → draftPlayer → autoPickRandom
  const finishGame = useCallback(() => {
    if (!selectedMode) return

    const allDrafted: { playerId: string; pickPosition: number }[] = []
    teams.forEach((team) => {
      team.players.forEach((player, idx) => {
        allDrafted.push({ playerId: player.id, pickPosition: idx })
      })
    })
    saveDraftResult(selectedMode.id, allDrafted)

    setPhase("results")
    if (timerRef.current) clearInterval(timerRef.current)
  }, [selectedMode, teams])

  const advancePick = useCallback(() => {
    if (!selectedMode) return

    const nextPick = currentPick + 1
    if (nextPick >= selectedMode.totalPicks) {
      finishGame()
    } else {
      setCurrentPick(nextPick)
      setTimeLeft(selectedMode.timerSeconds)
    }
  }, [currentPick, selectedMode, finishGame])

  const draftPlayer = useCallback((player: Player) => {
    if (!selectedMode || isGameOver) return

    const teamIdx = currentTeamIdx
    const team = teams[teamIdx]

    if (draftedIds.has(player.id)) return
    if (player.salary > team.budget) return
    if (team.players.length >= selectedMode.picksPerTeam) return

    setTeams((prev) =>
      prev.map((t, i) =>
        i === teamIdx
          ? { ...t, players: [...t.players, player], budget: t.budget - player.salary }
          : t
      )
    )
    setDraftedIds((prev) => new Set([...prev, player.id]))
    advancePick()
  }, [selectedMode, isGameOver, currentTeamIdx, teams, draftedIds, advancePick])

  const autoPickRandom = useCallback(() => {
    if (!selectedMode || isGameOver) return

    const team = teams[currentTeamIdx]
    const available = selectedMode.players.filter(
      (p) => !draftedIds.has(p.id) && p.salary <= team.budget
    )

    if (available.length === 0) {
      advancePick()
      return
    }

    const randomPlayer = available[Math.floor(Math.random() * available.length)]
    draftPlayer(randomPlayer)
  }, [selectedMode, teams, currentTeamIdx, draftedIds, isGameOver, advancePick, draftPlayer])

  // Timer
  useEffect(() => {
    if (phase !== "drafting" || isGameOver) return

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) return 0
        return prev - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [phase, currentPick, isGameOver])

  // Auto-pick on timeout
  useEffect(() => {
    if (timeLeft === 0 && phase === "drafting" && !isGameOver) {
      autoPickRandom()
    }
  }, [timeLeft, phase, isGameOver, autoPickRandom])

  // Check game over after each pick
  useEffect(() => {
    if (phase === "drafting" && selectedMode && currentPick >= selectedMode.totalPicks) {
      finishGame()
    }
  }, [currentPick, phase, selectedMode, finishGame])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || !selectedMode) return

    const teamIdx = teams.findIndex((t) => t.id === over.id)
    if (teamIdx === -1 || teamIdx !== currentTeamIdx) return

    const player = active.data.current as Player
    if (player) {
      draftPlayer(player)
    }
  }

  const handleRestart = () => {
    setPhase("select")
    setSelectedMode(null)
    setTeams([])
    setDraftOrder([])
    setCurrentPick(0)
    setDraftedIds(new Set())
    if (timerRef.current) clearInterval(timerRef.current)
  }

  // --- MODE SELECTION ---
  if (phase === "select") {
    const categories = [...new Set(GAME_MODE_LIST.map((m) => m.category))]

    return (
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">드래프트 게임</h1>
          <p className="text-sm text-muted-foreground mt-1">
            스네이크 드래프트로 최강의 팀을 만드세요
          </p>
        </div>

        {categories.map((cat) => (
          <div key={cat}>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">{cat}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {GAME_MODE_LIST.filter((m) => m.category === cat).map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => startGame(mode)}
                  className="group text-left rounded-xl border border-border bg-card p-4 hover:border-primary/50 hover:shadow-lg transition-all"
                >
                  <span className="text-3xl block mb-2">{mode.icon}</span>
                  <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                    {mode.name}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                    {mode.description}
                  </p>
                  <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                    <span>{mode.players.length}명</span>
                    <span>|</span>
                    <span>{mode.picksPerTeam}픽</span>
                    <span>|</span>
                    <span>${mode.budget}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // --- RESULTS ---
  if (phase === "results" && selectedMode) {
    return (
      <div>
        <button
          onClick={handleRestart}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          게임 선택으로
        </button>
        <DraftResults teams={teams} mode={selectedMode.id} onRestart={() => startGame(selectedMode)} />
      </div>
    )
  }

  // --- DRAFTING ---
  if (phase === "drafting" && selectedMode) {
    return (
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleRestart}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              나가기
            </button>
            <div className="flex items-center gap-2">
              <span className="text-lg">{selectedMode.icon}</span>
              <h1 className="text-base font-bold text-foreground">{selectedMode.name}</h1>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Shuffle className="h-3.5 w-3.5" />
              {currentPick + 1}/{selectedMode.totalPicks}
            </div>
          </div>

          {/* Draft Order + Timer */}
          <DraftOrder
            teams={teams}
            currentPick={currentPick}
            draftOrder={draftOrder}
            timeLeft={timeLeft}
            timerSeconds={selectedMode.timerSeconds}
          />

          {/* Current turn indicator */}
          <div className="text-center py-1">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
              <div className={`h-3 w-3 rounded-full bg-gradient-to-br ${teams[currentTeamIdx]?.color}`} />
              <span className="text-sm font-bold text-primary">
                {teams[currentTeamIdx]?.name}의 차례
              </span>
              <Zap className="h-3.5 w-3.5 text-primary" />
            </div>
          </div>

          {/* Main Layout: teams + pool */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* Left: Teams */}
            <div className="lg:col-span-2 grid grid-cols-2 gap-3">
              {teams.map((team, idx) => (
                <TeamBoard
                  key={team.id}
                  team={team}
                  isActive={idx === currentTeamIdx}
                  picksPerTeam={selectedMode.picksPerTeam}
                />
              ))}
            </div>

            {/* Right: Player Pool */}
            <div className="lg:col-span-1">
              <PlayerPool
                players={selectedMode.players}
                draftedIds={draftedIds}
                canDraft={true}
                positions={selectedMode.positions}
              />
            </div>
          </div>
        </div>
      </DndContext>
    )
  }

  return null
}

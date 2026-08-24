"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { loadPlayers } from "@/lib/draft/players"
import { getDraftGame, type DraftCatalogEntry } from "@/lib/draft/games-catalog"
import {
  createInitialState,
  getCurrentSeat,
  makePick,
  getAIPick,
  isValidPick,
  type DraftState,
  type Participant,
  type Formation,
} from "@/lib/draft/engine"

type GamePhase = "setup" | "drafting" | "placement" | "completed"
export type GameMode = "solo" | "multi"

import { personaForSeat } from "@/lib/draft/personas"

const AI_NAMES = ["알렉스", "모건", "테리", "수아레즈"]
const AI_FORMATIONS: Formation[] = ["4-3-3", "4-4-2", "3-5-2", "3-4-3", "5-3-2", "5-4-1"]

export function useDraftGame(slug: string) {
  const entry: DraftCatalogEntry | undefined = getDraftGame(slug)
  const [phase, setPhase] = useState<GamePhase>("setup")
  const [mode, setMode] = useState<GameMode>("solo")
  const [aiCount, setAiCount] = useState(3)
  const [mySeat, setMySeat] = useState(0)
  const [playerName, setPlayerName] = useState("나")
  const [myFormation, setMyFormation] = useState<Formation>("4-3-3")
  const [state, setState] = useState<DraftState | null>(null)
  const [timerReset, setTimerReset] = useState(0)
  const [playersLoaded, setPlayersLoaded] = useState(false)
  const aiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // 게임마다 선수 풀이 다르다 — 카탈로그의 dataFile 을 따른다 (EPL = FPL 2026/27)
    setPlayersLoaded(false)
    loadPlayers(entry?.dataFile).then(() => setPlayersLoaded(true))
  }, [entry?.dataFile])

  const processAITurn = useCallback(
    (currentState: DraftState) => {
      if (currentState.status !== "drafting") return

      const seat = getCurrentSeat(currentState)
      const participant = currentState.participants.find((p) => p.seatIndex === seat)
      if (!participant?.isAI) return

      const delay = 500 + Math.random() * 400
      aiTimeoutRef.current = setTimeout(() => {
        const pickId = getAIPick(currentState, seat, mySeat)
        const newState = makePick(currentState, pickId, false)
        setState(newState)

        if (newState.status === "completed") {
          setPhase("placement")
          return
        }

        const nextSeat = getCurrentSeat(newState)
        const nextParticipant = newState.participants.find((p) => p.seatIndex === nextSeat)
        if (nextParticipant?.isAI) {
          processAITurn(newState)
        } else {
          setTimerReset((prev) => prev + 1)
        }
      }, delay)
      // mySeat 이 빠지면 좌석을 바꿔도 AI 성격이 옛 좌석 기준으로 굳는다 (personaForSeat 인자)
    },
    [mySeat]
  )

  const startGame = useCallback(() => {
    const participants: Participant[] = []

    if (mode === "solo") {
      participants.push({
        seatIndex: mySeat,
        name: playerName || "나",
        isAI: false,
        formation: myFormation,
      })
      let aiIdx = 0
      for (let i = 0; i < aiCount + 1; i++) {
        if (i === mySeat) continue
        if (aiIdx >= aiCount) break
        const persona = personaForSeat(i, mySeat)
        const aiFormation = persona.formations[
          Math.floor(Math.random() * persona.formations.length)
        ] as Formation
        participants.push({
          seatIndex: i,
          name: `${AI_NAMES[aiIdx]} · ${persona.label}`,
          isAI: true,
          formation: aiFormation,
        })
        aiIdx++
      }
      participants.sort((a, b) => a.seatIndex - b.seatIndex)
    } else {
      participants.push({
        seatIndex: 0,
        name: playerName || "플레이어 1",
        isAI: false,
        formation: myFormation,
      })
      for (let i = 1; i < 4; i++) {
        const persona = personaForSeat(i, 0)
        const aiFormation = persona.formations[
          Math.floor(Math.random() * persona.formations.length)
        ] as Formation
        participants.push({
          seatIndex: i,
          name: `${AI_NAMES[i - 1]} · ${persona.label}`,
          isAI: true,
          formation: aiFormation,
        })
      }
    }

    const initialState = createInitialState(participants, entry?.budget)
    setState(initialState)
    setPhase("drafting")
    setTimerReset(0)

    const firstSeat = getCurrentSeat(initialState)
    const firstParticipant = initialState.participants.find((p) => p.seatIndex === firstSeat)
    if (firstParticipant?.isAI) {
      processAITurn(initialState)
    }
  }, [mode, aiCount, mySeat, playerName, myFormation, processAITurn, entry])

  const handlePick = useCallback(
    (playerId: string) => {
      if (!state || state.status !== "drafting") return

      const seat = getCurrentSeat(state)
      if (seat !== mySeat) return
      if (!isValidPick(state, seat, playerId)) return

      const newState = makePick(state, playerId)
      setState(newState)

      if (newState.status === "completed") {
        setPhase("placement")
        return
      }

      const nextSeat = getCurrentSeat(newState)
      const nextParticipant = newState.participants.find((p) => p.seatIndex === nextSeat)
      if (nextParticipant?.isAI) {
        processAITurn(newState)
      } else {
        setTimerReset((prev) => prev + 1)
      }
    },
    [state, mySeat, processAITurn]
  )

  const handleTimeout = useCallback(() => {
    if (!state || state.status !== "drafting") return

    const seat = getCurrentSeat(state)
    if (seat !== mySeat) return

    const autoPickId = getAIPick(state, seat, mySeat)
    const newState = makePick(state, autoPickId, true)
    setState(newState)

    if (newState.status === "completed") {
      setPhase("completed")
      return
    }

    const nextSeat = getCurrentSeat(newState)
    const nextParticipant = newState.participants.find((p) => p.seatIndex === nextSeat)
    if (nextParticipant?.isAI) {
      processAITurn(newState)
    } else {
      setTimerReset((prev) => prev + 1)
    }
  }, [state, mySeat, processAITurn])

  const handleRestart = useCallback(() => {
    if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current)
    setState(null)
    setPhase("setup")
  }, [])

  useEffect(() => {
    return () => {
      if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current)
    }
  }, [])

  return {
    entry,
    phase,
    setPhase,
    mode,
    setMode,
    aiCount,
    setAiCount,
    mySeat,
    setMySeat,
    playerName,
    setPlayerName,
    myFormation,
    setMyFormation,
    state,
    timerReset,
    playersLoaded,
    startGame,
    handlePick,
    handleTimeout,
    handleRestart,
  }
}

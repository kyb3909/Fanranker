"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { loadPlayers, type Player } from "@/lib/draft/players"
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
  /**
   * 드래프트 중 도판에 손으로 놓은 배치 (슬롯 코드 → 선수).
   *
   * ⚠️ 보드가 아니라 여기 둔다. 종전엔 DraftBoard 의 지역 상태라 드래프트가 끝나
   *    배치 화면으로 넘어가는 순간 통째로 사라졌고, 방금 11명을 자리에 놓은 유저가
   *    "미배치 선수 (11)" 를 다시 만났다 (2026-08-25 자동 플레이로 확인).
   */
  const [arrangement, setArrangement] = useState<Record<string, Player | null>>({})
  const aiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // 게임마다 선수 풀이 다르다 — 카탈로그의 dataFile 을 따른다 (EPL = FPL 2026/27)
    setPlayersLoaded(false)
    loadPlayers(entry?.dataFile).then(() => setPlayersLoaded(true))
  }, [entry?.dataFile])

  /**
   * 완주한 판의 픽 기록을 서버에 남긴다 (2026-08-25).
   * 운영자: "사람들이 뽑은 데이터 기반으로 순위를 시각화" — 그 데이터가 여기서 쌓인다.
   * ⚠️ fire-and-forget: 기록 실패가 게임 흐름(배치 화면 전환)을 막으면 안 된다.
   * ⚠️ StrictMode·재렌더로 두 번 불려도 서버가 draft_id 로 멱등 처리한다.
   */
  const submittedRef = useRef(false)
  const submitPicks = useCallback(
    (finished: DraftState) => {
      if (submittedRef.current || finished.picks.length === 0) return
      submittedRef.current = true
      // ⚠️ **사람 픽만** 보낸다 (2026-08-25 운영자: "사람이 뽑은 건 나 혼자, 11픽").
      //    AI 픽까지 저장하면 언젠가 필터를 빼먹은 쿼리가 통계를 오염시킨다 —
      //    애초에 안 넣는 게 제일 안전하다.
      const humanSeats = new Set(
        finished.participants.filter((p) => !p.isAI).map((p) => p.seatIndex)
      )
      const perSeatRound: Record<number, number> = {}
      const picks = finished.picks.flatMap((pk) => {
        perSeatRound[pk.seatIndex] = (perSeatRound[pk.seatIndex] ?? 0) + 1
        if (!humanSeats.has(pk.seatIndex)) return []
        return [
          {
            playerId: pk.playerId,
            round: perSeatRound[pk.seatIndex],
            // ⚠️ 엔진의 pickNumber 는 0부터다 — API 는 1부터 받는다 (실측 400 사고)
            pickNo: pk.pickNumber + 1,
            pickedBy: "human" as const,
          },
        ]
      })
      if (picks.length === 0) return
      fetch("/api/draft/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: crypto.randomUUID(), gameSlug: slug, picks }),
      }).catch(() => {})
    },
    [slug]
  )

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
          submitPicks(newState)
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
    [mySeat, submitPicks]
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
        submitPicks(newState)
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
    [state, mySeat, processAITurn, submitPicks]
  )

  const handleTimeout = useCallback(() => {
    if (!state || state.status !== "drafting") return

    const seat = getCurrentSeat(state)
    if (seat !== mySeat) return

    const autoPickId = getAIPick(state, seat, mySeat)
    const newState = makePick(state, autoPickId, true)
    setState(newState)

    if (newState.status === "completed") {
      submitPicks(newState)
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
  }, [state, mySeat, processAITurn, submitPicks])

  const handleRestart = useCallback(() => {
    if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current)
    setState(null)
    setArrangement({}) // 새 판에 지난 판 배치가 따라오면 안 된다
    submittedRef.current = false // 다음 판도 기록해야 한다
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
    arrangement,
    setArrangement,
    timerReset,
    playersLoaded,
    startGame,
    handlePick,
    handleTimeout,
    handleRestart,
  }
}

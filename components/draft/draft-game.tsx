"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { DraftBoard } from "./draft-board"
import { FormationField } from "./formation-field"
import { POSITION_COLORS, getAllPlayers, loadPlayers, type Player } from "@/lib/draft/players"
import {
  createInitialState,
  getCurrentSeat,
  makePick,
  getAIPick,
  isValidPick,
  getSeatLimits,
  FORMATIONS,
  type DraftState,
  type Participant,
  type Formation,
} from "@/lib/draft/engine"

type GamePhase = "setup" | "drafting" | "placement" | "completed"
type GameMode = "solo" | "multi"

const AI_NAMES = ["AI 알렉스", "AI 모건", "AI 테리", "AI 수아레즈"]
const AI_FORMATIONS: Formation[] = ["4-3-3", "4-4-2", "3-5-2", "3-4-3", "5-3-2", "5-4-1"]
const FORMATION_LIST: Formation[] = ["4-4-2", "4-3-3", "3-5-2", "3-4-3", "5-3-2", "5-4-1"]

export function DraftGame() {
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

  // 선수 데이터 lazy load
  useEffect(() => {
    loadPlayers().then(() => setPlayersLoaded(true))
  }, [])

  // AI 턴 자동 실행
  const processAITurn = useCallback((currentState: DraftState) => {
    if (currentState.status !== "drafting") return

    const seat = getCurrentSeat(currentState)
    const participant = currentState.participants.find((p) => p.seatIndex === seat)

    if (!participant?.isAI) return

    // AI는 5~7초 딜레이 후 픽
    const delay = 5000 + Math.random() * 2000
    aiTimeoutRef.current = setTimeout(() => {
      const pickId = getAIPick(currentState, seat)
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
  }, [])

  // 게임 시작
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
        const aiFormation = AI_FORMATIONS[Math.floor(Math.random() * AI_FORMATIONS.length)]
        participants.push({
          seatIndex: i,
          name: AI_NAMES[aiIdx],
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
        const aiFormation = AI_FORMATIONS[Math.floor(Math.random() * AI_FORMATIONS.length)]
        participants.push({
          seatIndex: i,
          name: AI_NAMES[i - 1],
          isAI: true,
          formation: aiFormation,
        })
      }
    }

    const initialState = createInitialState(participants)
    setState(initialState)
    setPhase("drafting")
    setTimerReset(0)

    const firstSeat = getCurrentSeat(initialState)
    const firstParticipant = initialState.participants.find((p) => p.seatIndex === firstSeat)
    if (firstParticipant?.isAI) {
      processAITurn(initialState)
    }
  }, [mode, aiCount, mySeat, playerName, myFormation, processAITurn])

  // 내 픽
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

  // 타임아웃 자동 픽
  const handleTimeout = useCallback(() => {
    if (!state || state.status !== "drafting") return

    const seat = getCurrentSeat(state)
    if (seat !== mySeat) return

    const autoPickId = getAIPick(state, seat)
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

  useEffect(() => {
    return () => {
      if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current)
    }
  }, [])

  const handleRestart = useCallback(() => {
    if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current)
    setState(null)
    setPhase("setup")
  }, [])

  // ──────── 셋업 화면 ────────
  if (phase === "setup") {
    const totalPlayers = mode === "solo" ? aiCount + 1 : 4
    const selectedLimits = FORMATIONS[myFormation]

    return (
      <div className="mx-auto max-w-lg py-8">
        <div className="border-border bg-card rounded-2xl border p-8 shadow-lg">
          <div className="mb-8 text-center">
            <div className="text-4xl">⚽</div>
            <h1 className="text-foreground mt-3 text-2xl font-black">스네이크 드래프트</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              EPL 선수를 드래프트해서 나만의 드림팀을 만드세요
            </p>
          </div>

          {/* 게임 모드 */}
          <div className="mb-6">
            <label className="text-foreground mb-2 block text-sm font-semibold">게임 모드</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMode("solo")}
                className={`rounded-lg border-2 px-4 py-3 text-sm font-semibold transition-all ${
                  mode === "solo"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-muted-foreground"
                }`}
              >
                <div className="text-lg">🤖</div>
                <div className="mt-1">솔로 (vs AI)</div>
              </button>
              <button
                onClick={() => setMode("multi")}
                className={`rounded-lg border-2 px-4 py-3 text-sm font-semibold transition-all ${
                  mode === "multi"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-muted-foreground"
                }`}
              >
                <div className="text-lg">👥</div>
                <div className="mt-1">멀티플레이어</div>
                <div className="text-muted-foreground text-[10px]">(준비 중)</div>
              </button>
            </div>
          </div>

          {/* 닉네임 */}
          <div className="mb-6">
            <label className="text-foreground mb-2 block text-sm font-semibold">닉네임</label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="닉네임 입력..."
              className="border-border bg-muted text-foreground placeholder:text-muted-foreground focus:ring-primary h-10 w-full rounded-lg border px-3 text-sm focus:ring-2 focus:outline-none"
              maxLength={12}
            />
          </div>

          {/* 포메이션 선택 */}
          <div className="mb-6">
            <label className="text-foreground mb-2 block text-sm font-semibold">포메이션</label>
            <div className="grid grid-cols-3 gap-2">
              {FORMATION_LIST.map((f) => {
                const limits = FORMATIONS[f]
                return (
                  <button
                    key={f}
                    onClick={() => setMyFormation(f)}
                    className={`rounded-lg border-2 px-3 py-2.5 text-center transition-all ${
                      myFormation === f
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-muted-foreground"
                    }`}
                  >
                    <div className="text-sm font-bold">{f}</div>
                    <div className="mt-0.5 text-[10px] opacity-70">
                      DF {limits.DF} · MF {limits.MF} · FW {limits.FW}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* AI 수 (솔로만) */}
          {mode === "solo" && (
            <div className="mb-6">
              <label className="text-foreground mb-2 block text-sm font-semibold">
                AI 상대 수: {aiCount}명 (총 {totalPlayers}명)
              </label>
              <div className="flex gap-2">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      setAiCount(n)
                      if (mySeat >= n + 1) setMySeat(0)
                    }}
                    className={`flex-1 rounded-lg border-2 py-2 text-sm font-semibold transition-all ${
                      aiCount === n
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-muted-foreground"
                    }`}
                  >
                    {n}명
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 드래프트 순서 */}
          {mode === "solo" && (
            <div className="mb-8">
              <label className="text-foreground mb-2 block text-sm font-semibold">
                내 드래프트 순서
              </label>
              <div className="flex gap-2">
                {Array.from({ length: totalPlayers }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setMySeat(i)}
                    className={`flex-1 rounded-lg border-2 py-2 text-sm font-semibold transition-all ${
                      mySeat === i
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-muted-foreground"
                    }`}
                  >
                    {i + 1}번째
                  </button>
                ))}
              </div>
              <p className="text-muted-foreground mt-1.5 text-[11px]">
                1번째는 첫 픽이 빠르고, 마지막은 연속 2픽 유리!
              </p>
            </div>
          )}

          {/* 규칙 요약 */}
          <div className="bg-muted/50 mb-6 rounded-lg p-4">
            <h3 className="text-foreground mb-2 text-xs font-bold">규칙</h3>
            <ul className="text-muted-foreground space-y-1 text-[11px]">
              <li>• 스네이크 순서: 1→2→...→N→N→...→1 반복</li>
              <li>• 11라운드, 예산 £80.0</li>
              <li>
                • 포메이션 {myFormation}: GK {selectedLimits.GK}, DF {selectedLimits.DF}, MF{" "}
                {selectedLimits.MF}, FW {selectedLimits.FW}
              </li>
              <li>• 픽 제한시간 30초 (초과 시 자동 선택)</li>
              <li>• 총 {getAllPlayers().length}명의 EPL 선수</li>
            </ul>
          </div>

          <button
            onClick={startGame}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-12 w-full rounded-xl text-base font-bold shadow-lg transition-all hover:shadow-xl active:scale-[0.98]"
          >
            드래프트 시작!
          </button>
        </div>
      </div>
    )
  }

  // ──────── 배치 화면 ────────
  if (phase === "placement" && state) {
    const myParticipant = state.participants.find((p) => p.seatIndex === mySeat)
    const myRoster = state.roster[mySeat] || []

    return (
      <FormationField
        formation={myParticipant?.formation || "4-3-3"}
        roster={myRoster}
        onComplete={() => setPhase("completed")}
      />
    )
  }

  // ──────── 완료 화면 ────────
  if (phase === "completed" && state) {
    return (
      <div className="mx-auto max-w-4xl py-8">
        <div className="border-border bg-card rounded-2xl border p-8 shadow-lg">
          <div className="mb-8 text-center">
            <div className="text-5xl">🏆</div>
            <h1 className="text-foreground mt-3 text-2xl font-black">드래프트 완료!</h1>
            <p className="text-muted-foreground mt-1 text-sm">모든 팀의 로스터가 완성되었습니다</p>
          </div>

          {/* 모든 팀 로스터 */}
          <div className="grid grid-cols-2 gap-4">
            {state.participants.map((p) => {
              const roster = state.roster[p.seatIndex] || []
              const totalValue = roster.reduce((sum, pl) => sum + pl.price, 0)
              const isMe = p.seatIndex === mySeat
              const limits = getSeatLimits(state, p.seatIndex)

              return (
                <div
                  key={p.seatIndex}
                  className={`rounded-xl border p-4 ${
                    isMe ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground text-base font-bold">{p.name}</span>
                      <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] font-bold">
                        {p.formation}
                      </span>
                      {isMe && (
                        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                          나
                        </span>
                      )}
                      {p.isAI && (
                        <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-bold text-violet-400">
                          AI
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-sm font-bold text-blue-500">
                        £{totalValue.toFixed(1)}
                      </span>
                      <span className="ml-2 font-mono text-xs text-emerald-500">
                        잔여 £{(state.budget[p.seatIndex] ?? 0).toFixed(1)}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {roster
                      .sort((a, b) => {
                        const posOrder = { GK: 0, DF: 1, MF: 2, FW: 3 }
                        return posOrder[a.position] - posOrder[b.position]
                      })
                      .map((player) => (
                        <div
                          key={player.id}
                          className="border-border/30 bg-muted/20 flex items-center gap-2 rounded border px-2 py-1"
                        >
                          <span
                            className={`rounded px-1 py-0.5 text-[9px] font-bold ${POSITION_COLORS[player.position]}`}
                          >
                            {player.position}
                          </span>
                          <span className="text-foreground flex-1 text-xs font-medium">
                            {player.nameKo}
                          </span>
                          <span className="text-muted-foreground text-[10px]">{player.teamKo}</span>
                          <span className="text-muted-foreground font-mono text-[10px] font-semibold">
                            £{player.price.toFixed(1)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-8 flex justify-center gap-3">
            <button
              onClick={handleRestart}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl px-8 py-3 text-sm font-bold shadow-lg transition-all"
            >
              다시 하기
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ──────── 드래프팅 화면 ────────
  if (!state) return null

  return (
    <DraftBoard
      state={state}
      mySeat={mySeat}
      onPick={handlePick}
      onTimeout={handleTimeout}
      timerReset={timerReset}
    />
  )
}

"use client"

import { useCallback, useEffect, useRef, useState } from "react"

// ── Types ──────────────────────────────────────────────
export type GamePhase =
  | "IDLE"
  | "AIMING"
  | "POWERING"
  | "SHOOTING"
  | "RESULT"
  | "GAME_OVER"

export type KickResult = "goal" | "saved" | "over" | "weak"

export interface KickDetail {
  kick_number: number
  aim_x: number // 0~1 normalized (0=left, 1=right)
  aim_y: number // 0~1 normalized (0=top, 1=bottom)
  power: number // 0~1
  is_goal: boolean
  result: KickResult
}

export interface GameState {
  phase: GamePhase
  currentKick: number // 1~5
  aimX: number
  aimY: number
  power: number
  kicks: KickDetail[]
  lastResult: KickResult | null
  totalGoals: number
  goldRewarded: number | null
  submitting: boolean
  error: string | null
}

const TOTAL_KICKS = 5

const REWARD_TABLE: Record<number, number> = {
  0: 0,
  1: 2,
  2: 5,
  3: 10,
  4: 20,
  5: 50,
}

// ── Kick Result Calculator ─────────────────────────────
function calculateKickResult(aimX: number, aimY: number, power: number): KickResult {
  // Power too weak (<0.2) → weak
  if (power < 0.2) return "weak"

  // Power too strong (>0.88) → over the bar
  if (power > 0.88) return "over"

  // Goalkeeper save probability based on aim position
  // Center = high save chance, corners = low save chance
  const centerDistX = Math.abs(aimX - 0.5) * 2 // 0=center, 1=edge
  const centerDistY = Math.abs(aimY - 0.5) * 2

  // Corner bonus: the more to the corner, the harder for keeper
  const cornerFactor = Math.sqrt(centerDistX * centerDistX + centerDistY * centerDistY) / Math.SQRT2

  // Save probability: center=50%, corners=5%
  const saveProbability = 0.5 - cornerFactor * 0.45

  // Power sweet spot bonus (30%~80% is best)
  const powerInSweet = power >= 0.3 && power <= 0.8
  const finalSaveProb = powerInSweet ? saveProbability : saveProbability + 0.1

  const roll = Math.random()
  if (roll < finalSaveProb) return "saved"

  return "goal"
}

// ── Hook ───────────────────────────────────────────────
export function usePenaltyKick() {
  const [state, setState] = useState<GameState>({
    phase: "IDLE",
    currentKick: 1,
    aimX: 0.5,
    aimY: 0.5,
    power: 0,
    kicks: [],
    lastResult: null,
    totalGoals: 0,
    goldRewarded: null,
    submitting: false,
    error: null,
  })

  const rafRef = useRef<number>(0)
  const timeRef = useRef<number>(0)

  // Animate crosshair during AIMING phase
  useEffect(() => {
    if (state.phase !== "AIMING") return

    timeRef.current = performance.now()
    const animate = (now: number) => {
      const elapsed = now - timeRef.current
      // Lissajous-like oscillation for natural movement
      const ax = 0.5 + 0.35 * Math.sin(elapsed * 0.003) * Math.cos(elapsed * 0.0017)
      const ay = 0.5 + 0.25 * Math.sin(elapsed * 0.0023) * Math.cos(elapsed * 0.0013)
      setState((s) => (s.phase === "AIMING" ? { ...s, aimX: ax, aimY: ay } : s))
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [state.phase])

  // Animate power gauge during POWERING phase
  useEffect(() => {
    if (state.phase !== "POWERING") return

    timeRef.current = performance.now()
    const animate = (now: number) => {
      const elapsed = now - timeRef.current
      // Ping-pong 0→1→0 with triangle wave
      const t = (elapsed * 0.0015) % 2
      const p = t <= 1 ? t : 2 - t
      setState((s) => (s.phase === "POWERING" ? { ...s, power: p } : s))
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [state.phase])

  // Start a new game
  const startGame = useCallback(() => {
    setState({
      phase: "AIMING",
      currentKick: 1,
      aimX: 0.5,
      aimY: 0.5,
      power: 0,
      kicks: [],
      lastResult: null,
      totalGoals: 0,
      goldRewarded: null,
      submitting: false,
      error: null,
    })
  }, [])

  // Handle click/tap — progresses through phases
  const handleAction = useCallback(() => {
    setState((s) => {
      if (s.phase === "AIMING") {
        // Lock aim → move to power phase
        return { ...s, phase: "POWERING" }
      }

      if (s.phase === "POWERING") {
        // Lock power → calculate result → show animation
        const result = calculateKickResult(s.aimX, s.aimY, s.power)
        const kick: KickDetail = {
          kick_number: s.currentKick,
          aim_x: Math.round(s.aimX * 1000) / 1000,
          aim_y: Math.round(s.aimY * 1000) / 1000,
          power: Math.round(s.power * 1000) / 1000,
          is_goal: result === "goal",
          result,
        }
        const newKicks = [...s.kicks, kick]
        const newGoals = s.totalGoals + (result === "goal" ? 1 : 0)

        return {
          ...s,
          phase: "SHOOTING",
          kicks: newKicks,
          lastResult: result,
          totalGoals: newGoals,
        }
      }

      if (s.phase === "RESULT") {
        // Move to next kick or game over
        if (s.currentKick >= TOTAL_KICKS) {
          return { ...s, phase: "GAME_OVER" }
        }
        return {
          ...s,
          phase: "AIMING",
          currentKick: s.currentKick + 1,
          aimX: 0.5,
          aimY: 0.5,
          power: 0,
          lastResult: null,
        }
      }

      return s
    })
  }, [])

  // Called after shooting animation ends (from canvas)
  const onShootAnimationEnd = useCallback(() => {
    setState((s) => (s.phase === "SHOOTING" ? { ...s, phase: "RESULT" } : s))
  }, [])

  // Submit results to server
  const submitResults = useCallback(async () => {
    setState((s) => ({ ...s, submitting: true, error: null }))

    try {
      const res = await fetch("/api/games/mini/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game_type: "penalty_kick",
          kick_details: state.kicks,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setState((s) => ({
          ...s,
          submitting: false,
          error: data.error || "제출에 실패했습니다.",
        }))
        return
      }

      setState((s) => ({
        ...s,
        submitting: false,
        goldRewarded: data.gold_rewarded,
      }))

      // 골드 잔액 갱신 이벤트
      if (data.gold_rewarded > 0) {
        window.dispatchEvent(new CustomEvent("goldBalanceUpdate"))
      }
    } catch {
      setState((s) => ({
        ...s,
        submitting: false,
        error: "네트워크 오류가 발생했습니다.",
      }))
    }
  }, [state.kicks])

  return {
    state,
    startGame,
    handleAction,
    onShootAnimationEnd,
    submitResults,
    rewardTable: REWARD_TABLE,
  }
}

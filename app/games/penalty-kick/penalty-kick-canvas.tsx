"use client"

import { useCallback, useEffect, useRef } from "react"
import type { GameState, KickResult } from "@/hooks/use-penalty-kick"

// ── Constants (logical 640×480 canvas) ─────────────────
const W = 640
const H = 480

// Goal frame (centered)
const GOAL_X = 170
const GOAL_Y = 80
const GOAL_W = 300
const GOAL_H = 180
const GOAL_BOTTOM = GOAL_Y + GOAL_H

// Ball
const BALL_START_X = W / 2
const BALL_START_Y = H - 60
const BALL_R = 12

// Power gauge (right side)
const GAUGE_X = W - 40
const GAUGE_Y = 100
const GAUGE_W = 20
const GAUGE_H = 260

// ── Drawing helpers ────────────────────────────────────
function drawField(ctx: CanvasRenderingContext2D) {
  // Sky gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.45)
  skyGrad.addColorStop(0, "#1a1a2e")
  skyGrad.addColorStop(1, "#16213e")
  ctx.fillStyle = skyGrad
  ctx.fillRect(0, 0, W, H * 0.45)

  // Grass gradient
  const grassGrad = ctx.createLinearGradient(0, H * 0.45, 0, H)
  grassGrad.addColorStop(0, "#2d6a2e")
  grassGrad.addColorStop(1, "#1e4d1f")
  ctx.fillStyle = grassGrad
  ctx.fillRect(0, H * 0.45, W, H * 0.55)

  // Grass stripes
  ctx.fillStyle = "rgba(255,255,255,0.03)"
  for (let i = 0; i < 8; i++) {
    if (i % 2 === 0) {
      const y = H * 0.45 + (H * 0.55 * i) / 8
      ctx.fillRect(0, y, W, (H * 0.55) / 8)
    }
  }

  // Penalty spot
  ctx.beginPath()
  ctx.arc(W / 2, H - 90, 3, 0, Math.PI * 2)
  ctx.fillStyle = "#fff"
  ctx.fill()
}

function drawGoal(ctx: CanvasRenderingContext2D) {
  // Net (grid lines)
  ctx.strokeStyle = "rgba(255,255,255,0.15)"
  ctx.lineWidth = 0.5
  for (let x = GOAL_X; x <= GOAL_X + GOAL_W; x += 15) {
    ctx.beginPath()
    ctx.moveTo(x, GOAL_Y)
    ctx.lineTo(x, GOAL_BOTTOM)
    ctx.stroke()
  }
  for (let y = GOAL_Y; y <= GOAL_BOTTOM; y += 15) {
    ctx.beginPath()
    ctx.moveTo(GOAL_X, y)
    ctx.lineTo(GOAL_X + GOAL_W, y)
    ctx.stroke()
  }

  // Goal frame (white posts & crossbar)
  ctx.strokeStyle = "#ffffff"
  ctx.lineWidth = 5
  ctx.lineCap = "round"
  ctx.beginPath()
  // Left post
  ctx.moveTo(GOAL_X, GOAL_BOTTOM)
  ctx.lineTo(GOAL_X, GOAL_Y)
  // Crossbar
  ctx.lineTo(GOAL_X + GOAL_W, GOAL_Y)
  // Right post
  ctx.lineTo(GOAL_X + GOAL_W, GOAL_BOTTOM)
  ctx.stroke()

  // Post shadows
  ctx.strokeStyle = "rgba(0,0,0,0.3)"
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(GOAL_X + 3, GOAL_BOTTOM)
  ctx.lineTo(GOAL_X + 3, GOAL_Y + 3)
  ctx.lineTo(GOAL_X + GOAL_W - 3, GOAL_Y + 3)
  ctx.lineTo(GOAL_X + GOAL_W - 3, GOAL_BOTTOM)
  ctx.stroke()
}

function drawKeeper(ctx: CanvasRenderingContext2D, offsetX: number) {
  const kx = W / 2 + offsetX
  const ky = GOAL_BOTTOM - 55

  // Body
  ctx.fillStyle = "#f59e0b"
  ctx.fillRect(kx - 12, ky, 24, 35)

  // Head
  ctx.beginPath()
  ctx.arc(kx, ky - 5, 10, 0, Math.PI * 2)
  ctx.fillStyle = "#fbbf24"
  ctx.fill()

  // Arms (spread)
  ctx.strokeStyle = "#f59e0b"
  ctx.lineWidth = 4
  ctx.lineCap = "round"
  // Left arm
  ctx.beginPath()
  ctx.moveTo(kx - 12, ky + 8)
  ctx.lineTo(kx - 30 + offsetX * 0.3, ky - 5)
  ctx.stroke()
  // Right arm
  ctx.beginPath()
  ctx.moveTo(kx + 12, ky + 8)
  ctx.lineTo(kx + 30 + offsetX * 0.3, ky - 5)
  ctx.stroke()

  // Gloves
  ctx.fillStyle = "#10b981"
  ctx.beginPath()
  ctx.arc(kx - 30 + offsetX * 0.3, ky - 5, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(kx + 30 + offsetX * 0.3, ky - 5, 6, 0, Math.PI * 2)
  ctx.fill()

  // Legs
  ctx.strokeStyle = "#1e293b"
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(kx - 6, ky + 35)
  ctx.lineTo(kx - 8, ky + 52)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(kx + 6, ky + 35)
  ctx.lineTo(kx + 8, ky + 52)
  ctx.stroke()
}

function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  // Shadow
  ctx.beginPath()
  ctx.ellipse(x, y + r + 2, r * 0.8, r * 0.3, 0, 0, Math.PI * 2)
  ctx.fillStyle = "rgba(0,0,0,0.3)"
  ctx.fill()

  // Ball
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = "#ffffff"
  ctx.fill()
  ctx.strokeStyle = "#999"
  ctx.lineWidth = 1
  ctx.stroke()

  // Pentagon pattern
  ctx.fillStyle = "#333"
  ctx.beginPath()
  ctx.arc(x, y, r * 0.35, 0, Math.PI * 2)
  ctx.fill()
}

function drawCrosshair(ctx: CanvasRenderingContext2D, aimX: number, aimY: number) {
  // Convert normalized aim (0-1) to goal coordinates
  const cx = GOAL_X + aimX * GOAL_W
  const cy = GOAL_Y + aimY * GOAL_H
  const size = 18

  ctx.strokeStyle = "#ef4444"
  ctx.lineWidth = 2.5
  ctx.setLineDash([])

  // Outer circle
  ctx.beginPath()
  ctx.arc(cx, cy, size, 0, Math.PI * 2)
  ctx.stroke()

  // Inner dot
  ctx.beginPath()
  ctx.arc(cx, cy, 3, 0, Math.PI * 2)
  ctx.fillStyle = "#ef4444"
  ctx.fill()

  // Cross lines
  ctx.beginPath()
  ctx.moveTo(cx - size - 5, cy)
  ctx.lineTo(cx - size + 8, cy)
  ctx.moveTo(cx + size - 8, cy)
  ctx.lineTo(cx + size + 5, cy)
  ctx.moveTo(cx, cy - size - 5)
  ctx.lineTo(cx, cy - size + 8)
  ctx.moveTo(cx, cy + size - 8)
  ctx.lineTo(cx, cy + size + 5)
  ctx.stroke()
}

function drawPowerGauge(ctx: CanvasRenderingContext2D, power: number, phase: string) {
  if (phase !== "AIMING" && phase !== "POWERING") return

  // Background
  ctx.fillStyle = "rgba(0,0,0,0.5)"
  ctx.strokeStyle = "rgba(255,255,255,0.3)"
  ctx.lineWidth = 1
  roundRect(ctx, GAUGE_X, GAUGE_Y, GAUGE_W, GAUGE_H, 4)

  if (phase === "AIMING") {
    // Show empty gauge with "NEXT" label
    ctx.fillStyle = "rgba(255,255,255,0.15)"
    ctx.fillRect(GAUGE_X + 2, GAUGE_Y + 2, GAUGE_W - 4, GAUGE_H - 4)
    return
  }

  // Fill from bottom
  const fillH = (GAUGE_H - 4) * power
  const fillY = GAUGE_Y + GAUGE_H - 2 - fillH

  // Color based on power zone
  let color: string
  if (power < 0.2) color = "#94a3b8" // too weak (gray)
  else if (power <= 0.8) color = "#22c55e" // sweet spot (green)
  else if (power <= 0.88) color = "#f59e0b" // risky (amber)
  else color = "#ef4444" // over (red)

  ctx.fillStyle = color
  ctx.fillRect(GAUGE_X + 2, fillY, GAUGE_W - 4, fillH)

  // Sweet spot markers
  ctx.setLineDash([3, 3])
  ctx.strokeStyle = "rgba(255,255,255,0.6)"
  ctx.lineWidth = 1
  const sweetTop = GAUGE_Y + GAUGE_H - 2 - (GAUGE_H - 4) * 0.8
  const sweetBottom = GAUGE_Y + GAUGE_H - 2 - (GAUGE_H - 4) * 0.3
  ctx.beginPath()
  ctx.moveTo(GAUGE_X, sweetTop)
  ctx.lineTo(GAUGE_X + GAUGE_W, sweetTop)
  ctx.moveTo(GAUGE_X, sweetBottom)
  ctx.lineTo(GAUGE_X + GAUGE_W, sweetBottom)
  ctx.stroke()
  ctx.setLineDash([])

  // Danger zone marker
  const dangerLine = GAUGE_Y + GAUGE_H - 2 - (GAUGE_H - 4) * 0.88
  ctx.strokeStyle = "rgba(239,68,68,0.8)"
  ctx.lineWidth = 1.5
  ctx.setLineDash([2, 2])
  ctx.beginPath()
  ctx.moveTo(GAUGE_X, dangerLine)
  ctx.lineTo(GAUGE_X + GAUGE_W, dangerLine)
  ctx.stroke()
  ctx.setLineDash([])
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
}

function drawResultText(ctx: CanvasRenderingContext2D, result: KickResult) {
  const labels: Record<KickResult, { text: string; color: string }> = {
    goal: { text: "골!!", color: "#22c55e" },
    saved: { text: "선방!", color: "#f59e0b" },
    over: { text: "크로스바 위로!", color: "#ef4444" },
    weak: { text: "너무 약해!", color: "#94a3b8" },
  }
  const { text, color } = labels[result]

  ctx.save()
  ctx.font = "bold 48px sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"

  // Outline
  ctx.strokeStyle = "#000"
  ctx.lineWidth = 6
  ctx.strokeText(text, W / 2, H / 2 - 20)

  // Fill
  ctx.fillStyle = color
  ctx.fillText(text, W / 2, H / 2 - 20)
  ctx.restore()
}

// ── Component ──────────────────────────────────────────
interface Props {
  state: GameState
  onAction: () => void
  onShootAnimationEnd: () => void
}

export function PenaltyKickCanvas({ state, onAction, onShootAnimationEnd }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const shootAnimRef = useRef<number>(0)
  const shootStartRef = useRef<number>(0)

  // Main draw function
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.clearRect(0, 0, W, H)
    drawField(ctx)
    drawGoal(ctx)

    // Keeper position (idle center, dive on shoot)
    let keeperOffset = 0
    if (state.phase === "SHOOTING" || state.phase === "RESULT") {
      const lastKick = state.kicks[state.kicks.length - 1]
      if (lastKick) {
        // Keeper dives toward aim direction
        keeperOffset = (lastKick.aim_x - 0.5) * GOAL_W * 0.7
      }
    }
    drawKeeper(ctx, keeperOffset)

    // Ball position
    if (state.phase === "IDLE" || state.phase === "AIMING" || state.phase === "POWERING") {
      drawBall(ctx, BALL_START_X, BALL_START_Y, BALL_R)
    }

    // Crosshair
    if (state.phase === "AIMING" || state.phase === "POWERING") {
      drawCrosshair(ctx, state.aimX, state.aimY)
    }

    // Power gauge
    drawPowerGauge(ctx, state.power, state.phase)

    // Result text
    if (state.phase === "RESULT" && state.lastResult) {
      drawResultText(ctx, state.lastResult)
    }
  }, [state])

  // Redraw on state change
  useEffect(() => {
    draw()
  }, [draw])

  // Shooting animation
  useEffect(() => {
    if (state.phase !== "SHOOTING") return

    const lastKick = state.kicks[state.kicks.length - 1]
    if (!lastKick) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const targetX = GOAL_X + lastKick.aim_x * GOAL_W
    let targetY: number

    if (lastKick.result === "over") {
      targetY = GOAL_Y - 40 // Above crossbar
    } else if (lastKick.result === "weak") {
      targetY = GOAL_BOTTOM - 10 // Near bottom, barely moves
    } else {
      targetY = GOAL_Y + lastKick.aim_y * GOAL_H
    }

    const duration = 600
    shootStartRef.current = performance.now()

    const animateShoot = (now: number) => {
      const elapsed = now - shootStartRef.current
      const t = Math.min(elapsed / duration, 1)
      // easeOutQuad
      const ease = 1 - (1 - t) * (1 - t)

      const bx = BALL_START_X + (targetX - BALL_START_X) * ease
      const by = BALL_START_Y + (targetY - BALL_START_Y) * ease
      const br = BALL_R - ease * 4 // Ball gets smaller as it goes further

      // Redraw scene
      ctx.clearRect(0, 0, W, H)
      drawField(ctx)
      drawGoal(ctx)

      const keeperOffset = (lastKick.aim_x - 0.5) * GOAL_W * 0.7 * ease
      drawKeeper(ctx, keeperOffset)
      drawBall(ctx, bx, by, Math.max(br, 5))

      if (t < 1) {
        shootAnimRef.current = requestAnimationFrame(animateShoot)
      } else {
        // Animation done — show result
        onShootAnimationEnd()
      }
    }

    shootAnimRef.current = requestAnimationFrame(animateShoot)
    return () => cancelAnimationFrame(shootAnimRef.current)
  }, [state.phase, state.kicks, onShootAnimationEnd])

  const handleClick = useCallback(() => {
    if (
      state.phase === "AIMING" ||
      state.phase === "POWERING" ||
      state.phase === "RESULT"
    ) {
      onAction()
    }
  }, [state.phase, onAction])

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      onClick={handleClick}
      className="w-full cursor-pointer rounded-lg border border-border"
      style={{ maxWidth: 640, aspectRatio: "640/480" }}
    />
  )
}

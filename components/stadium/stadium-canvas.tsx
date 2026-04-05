"use client"

import { useRef, useEffect, useCallback } from "react"
import type { Occupant } from "@/hooks/use-stadium-chat"

interface StadiumCanvasProps {
  level: number
  teamColor: string
  sport: string
  occupants: Occupant[]
  myUserId?: string
  onClickMove?: (x: number, y: number) => void
}

// 레벨별 배경 색상 (placeholder — 추후 에셋 교체)
const LEVEL_COLORS: Record<number, { sky: string; ground: string; field: string }> = {
  1: { sky: "#87CEEB", ground: "#8B7355", field: "#6B8E23" },
  2: { sky: "#87CEEB", ground: "#7B8D6A", field: "#558B2F" },
  3: { sky: "#78B4E0", ground: "#5D7A4A", field: "#4CAF50" },
  4: { sky: "#6AABDB", ground: "#5D6D3A", field: "#43A047" },
  5: { sky: "#5C9FD4", ground: "#4E5D32", field: "#388E3C" },
  6: { sky: "#4E93CC", ground: "#455A30", field: "#2E7D32" },
  7: { sky: "#3A7BBF", ground: "#3D5230", field: "#1B5E20" },
  8: { sky: "#2D6DB5", ground: "#354A28", field: "#1B5E20" },
  9: { sky: "#1E5FAB", ground: "#2D4220", field: "#0D4F1C" },
  10: { sky: "#1A237E", ground: "#263238", field: "#004D40" },
}

// 종목별 필드 라인
function drawField(ctx: CanvasRenderingContext2D, w: number, h: number, sport: string) {
  const fieldTop = h * 0.25
  const fieldBottom = h * 0.55
  const fieldH = fieldBottom - fieldTop

  ctx.strokeStyle = "rgba(255,255,255,0.3)"
  ctx.lineWidth = 2

  if (sport === "football") {
    // 축구장 라인
    ctx.strokeRect(w * 0.15, fieldTop + fieldH * 0.1, w * 0.7, fieldH * 0.8)
    ctx.beginPath()
    ctx.moveTo(w * 0.5, fieldTop + fieldH * 0.1)
    ctx.lineTo(w * 0.5, fieldTop + fieldH * 0.9)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(w * 0.5, fieldTop + fieldH * 0.5, fieldH * 0.2, 0, Math.PI * 2)
    ctx.stroke()
  } else if (sport === "baseball") {
    // 야구장 다이아몬드
    const cx = w * 0.5
    const cy = fieldTop + fieldH * 0.7
    const r = fieldH * 0.35
    ctx.beginPath()
    ctx.moveTo(cx, cy - r)
    ctx.lineTo(cx + r, cy)
    ctx.lineTo(cx, cy + r * 0.4)
    ctx.lineTo(cx - r, cy)
    ctx.closePath()
    ctx.stroke()
  } else if (sport === "basketball") {
    // 농구장
    ctx.strokeRect(w * 0.2, fieldTop + fieldH * 0.15, w * 0.6, fieldH * 0.7)
    ctx.beginPath()
    ctx.arc(w * 0.5, fieldTop + fieldH * 0.5, fieldH * 0.15, 0, Math.PI * 2)
    ctx.stroke()
  } else {
    // 배구장
    ctx.strokeRect(w * 0.25, fieldTop + fieldH * 0.15, w * 0.5, fieldH * 0.7)
    ctx.beginPath()
    ctx.moveTo(w * 0.5, fieldTop + fieldH * 0.15)
    ctx.lineTo(w * 0.5, fieldTop + fieldH * 0.85)
    ctx.stroke()
  }
}

// 경기장 건물 (레벨별 크기 변화)
function drawStadium(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  level: number,
  teamColor: string
) {
  const seats = Math.min(level, 10)
  const fieldTop = h * 0.25
  const seatHeight = h * 0.08 * Math.min(seats / 3, 1)

  // 관중석 (레벨이 올라갈수록 넓어짐)
  if (level >= 3) {
    const seatWidth = w * (0.5 + seats * 0.04)
    const seatX = (w - seatWidth) / 2
    ctx.fillStyle = teamColor + "40"
    ctx.fillRect(seatX, fieldTop - seatHeight, seatWidth, seatHeight)
    ctx.strokeStyle = teamColor + "80"
    ctx.lineWidth = 1
    ctx.strokeRect(seatX, fieldTop - seatHeight, seatWidth, seatHeight)
  }

  // 조명탑 (레벨 5+)
  if (level >= 5) {
    ctx.fillStyle = "#888"
    ctx.fillRect(w * 0.08, h * 0.05, 4, h * 0.2)
    ctx.fillRect(w * 0.92 - 4, h * 0.05, 4, h * 0.2)
    ctx.fillStyle = "#FFE082"
    ctx.beginPath()
    ctx.arc(w * 0.08 + 2, h * 0.05, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(w * 0.92 - 2, h * 0.05, 5, 0, Math.PI * 2)
    ctx.fill()
  }

  // 전광판 (레벨 6+)
  if (level >= 6) {
    ctx.fillStyle = "#1a1a2e"
    ctx.fillRect(w * 0.35, h * 0.02, w * 0.3, h * 0.06)
    ctx.fillStyle = "#00ff88"
    ctx.font = `${Math.round(h * 0.03)}px monospace`
    ctx.textAlign = "center"
    ctx.fillText(`Lv.${level}`, w * 0.5, h * 0.06)
  }
}

// 32x32 픽셀 아바타 (placeholder — Canvas 직접 드로잉)
function drawAvatar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  isMe: boolean,
  nickname: string
) {
  const s = size

  // 그림자
  ctx.fillStyle = "rgba(0,0,0,0.15)"
  ctx.beginPath()
  ctx.ellipse(x + s / 2, y + s, s / 2.5, s / 6, 0, 0, Math.PI * 2)
  ctx.fill()

  // 몸통
  ctx.fillStyle = isMe ? "#4CAF50" : "#64B5F6"
  ctx.fillRect(x + s * 0.25, y + s * 0.45, s * 0.5, s * 0.4)

  // 머리
  ctx.fillStyle = "#FFCC80"
  ctx.beginPath()
  ctx.arc(x + s / 2, y + s * 0.3, s * 0.22, 0, Math.PI * 2)
  ctx.fill()

  // 눈
  ctx.fillStyle = "#333"
  ctx.fillRect(x + s * 0.38, y + s * 0.26, 2, 2)
  ctx.fillRect(x + s * 0.55, y + s * 0.26, 2, 2)

  // 닉네임
  ctx.fillStyle = isMe ? "#fff" : "rgba(255,255,255,0.9)"
  ctx.font = "bold 9px sans-serif"
  ctx.textAlign = "center"
  const displayName = nickname.length > 6 ? nickname.slice(0, 5) + ".." : nickname

  // 닉네임 배경
  const textWidth = ctx.measureText(displayName).width
  ctx.fillStyle = isMe ? "rgba(76,175,80,0.8)" : "rgba(0,0,0,0.5)"
  ctx.fillRect(x + s / 2 - textWidth / 2 - 3, y - 4, textWidth + 6, 12)

  ctx.fillStyle = "#fff"
  ctx.fillText(displayName, x + s / 2, y + 5)
}

export function StadiumCanvas({
  level,
  teamColor,
  sport,
  occupants,
  myUserId,
  onClickMove,
}: StadiumCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // ctx.scale(2,2)가 적용되어 있으므로 논리적 크기(CSS 픽셀) 사용
    const dpr = window.devicePixelRatio || 2
    const w = canvas.width / dpr
    const h = canvas.height / dpr
    const colors = LEVEL_COLORS[level] || LEVEL_COLORS[1]

    // 배경: 하늘
    ctx.fillStyle = colors.sky
    ctx.fillRect(0, 0, w, h * 0.25)

    // 배경: 필드
    ctx.fillStyle = colors.field
    ctx.fillRect(0, h * 0.25, w, h * 0.35)

    // 배경: 관중석 영역
    ctx.fillStyle = colors.ground
    ctx.fillRect(0, h * 0.6, w, h * 0.4)

    // 관중석 줄무늬
    ctx.fillStyle = "rgba(0,0,0,0.05)"
    for (let row = 0; row < 5; row++) {
      ctx.fillRect(0, h * 0.6 + row * h * 0.08, w, h * 0.02)
    }

    // 경기장 건물 + 필드 라인
    drawStadium(ctx, w, h, level, teamColor)
    drawField(ctx, w, h, sport)

    // 아바타 (y좌표 순으로 정렬 — 아래쪽이 앞)
    const sortedOccupants = [...occupants].sort((a, b) => a.y - b.y)
    const avatarSize = 28

    for (const occ of sortedOccupants) {
      const ax = (occ.x / 100) * w - avatarSize / 2
      const ay = (occ.y / 100) * h - avatarSize / 2
      drawAvatar(ctx, ax, ay, avatarSize, occ.userId === myUserId, occ.nickname)
    }
  }, [level, teamColor, sport, occupants, myUserId])

  // 캔버스 리사이즈
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const observer = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 2
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      const ctx = canvas.getContext("2d")
      if (ctx) ctx.scale(dpr, dpr)
      render()
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [render])

  // 매 프레임 렌더
  useEffect(() => {
    let raf: number
    const loop = () => {
      render()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [render])

  // 클릭으로 이동
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onClickMove) return
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 100
      const y = ((e.clientY - rect.top) / rect.height) * 100
      onClickMove(x, y)
    },
    [onClickMove]
  )

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <canvas ref={canvasRef} onClick={handleClick} className="h-full w-full cursor-pointer" />
    </div>
  )
}

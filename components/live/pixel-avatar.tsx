"use client"

import { useEffect, useMemo, useState } from "react"

const HAIR_COLORS = ["#5d4b45", "#3b2d2a", "#7a5b2f", "#3f3a50", "#51403c"]
const SKIN_COLORS = ["#f4d3bd", "#e8bf9f", "#d6a57f", "#ba8d67", "#9d7356"]
const SHIRT_COLORS = ["#d65b4e", "#4c7ed9", "#5da85d", "#d7a140", "#7d65d8", "#279f9a"]
const PANTS_COLORS = ["#5a4f59", "#4a5567", "#3f4958", "#62505f"]

export type AvatarDirection = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW"

interface PixelAvatarProps {
  userId: string
  nickname: string
  size?: number
  direction?: AvatarDirection
  moving?: boolean
}

interface Palette {
  hair: string
  skin: string
  shirt: string
  shirtShade: string
  pants: string
  pantsShade: string
}

function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function shade(hex: string, amount: number) {
  const value = hex.replace("#", "")
  const num = Number.parseInt(value, 16)
  const clamp = (v: number) => Math.max(0, Math.min(255, v))
  const r = clamp((num >> 16) + amount)
  const g = clamp(((num >> 8) & 0xff) + amount)
  const b = clamp((num & 0xff) + amount)
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`
}

function Rect({
  x,
  y,
  width,
  height,
  fill,
}: {
  x: number
  y: number
  width: number
  height: number
  fill: string
}) {
  return <rect x={x} y={y} width={width} height={height} fill={fill} />
}

function createPalette(userId: string): Palette {
  const hash = hashCode(userId)
  const hair = HAIR_COLORS[hash % HAIR_COLORS.length]
  const skin = SKIN_COLORS[(hash >> 4) % SKIN_COLORS.length]
  const shirt = SHIRT_COLORS[(hash >> 8) % SHIRT_COLORS.length]
  const pants = PANTS_COLORS[(hash >> 12) % PANTS_COLORS.length]

  return {
    hair,
    skin,
    shirt,
    shirtShade: shade(shirt, -18),
    pants,
    pantsShade: shade(pants, -16),
  }
}

function renderHead(direction: AvatarDirection, palette: Palette) {
  const facingRight = direction === "E" || direction === "NE" || direction === "SE"
  const facingLeft = direction === "W" || direction === "NW" || direction === "SW"
  const back = direction === "N" || direction === "NE" || direction === "NW"
  const side = direction === "E" || direction === "W"
  const diagonal = !back && !side && direction !== "S"

  if (side) {
    const x = facingRight ? 7 : 5
    return (
      <>
        <Rect x={x} y={2} width={5} height={4} fill={palette.hair} />
        <Rect x={x + 1} y={4} width={4} height={5} fill={palette.skin} />
        <Rect x={facingRight ? x + 4 : x + 1} y={5} width={1} height={1} fill="#1c1c26" />
      </>
    )
  }

  if (back) {
    return (
      <>
        <Rect x={5} y={2} width={7} height={2} fill={palette.hair} />
        <Rect x={4} y={3} width={9} height={5} fill={palette.hair} />
        <Rect x={5} y={8} width={7} height={1} fill={shade(palette.hair, 14)} />
      </>
    )
  }

  if (diagonal) {
    const x = facingRight ? 6 : 5
    return (
      <>
        <Rect x={x - 1} y={2} width={8} height={3} fill={palette.hair} />
        <Rect x={x} y={4} width={6} height={5} fill={palette.skin} />
        <Rect x={facingRight ? x + 4 : x + 1} y={5} width={1} height={1} fill="#1c1c26" />
      </>
    )
  }

  return (
    <>
      <Rect x={4} y={2} width={8} height={3} fill={palette.hair} />
      <Rect x={5} y={4} width={6} height={5} fill={palette.skin} />
      <Rect x={6} y={5} width={1} height={1} fill="#1c1c26" />
      <Rect x={9} y={5} width={1} height={1} fill="#1c1c26" />
      <Rect x={7} y={7} width={2} height={1} fill="#d37f72" />
    </>
  )
}

function renderBody(direction: AvatarDirection, palette: Palette, frame: 0 | 1) {
  const facingRight = direction === "E" || direction === "NE" || direction === "SE"
  const facingLeft = direction === "W" || direction === "NW" || direction === "SW"
  const back = direction === "N" || direction === "NE" || direction === "NW"
  const side = direction === "E" || direction === "W"
  const diagonal =
    direction === "NE" || direction === "NW" || direction === "SE" || direction === "SW"

  if (side) {
    const x = facingRight ? 7 : 6
    const armY = frame === 0 ? 10 : 11
    const legFrontY = frame === 0 ? 15 : 14
    const legBackY = frame === 0 ? 14 : 15
    return (
      <>
        <Rect x={x} y={9} width={4} height={5} fill={back ? palette.shirtShade : palette.shirt} />
        <Rect x={facingRight ? x + 3 : x - 1} y={armY} width={2} height={4} fill={palette.skin} />
        <Rect x={x + 1} y={legBackY} width={2} height={4} fill={palette.pantsShade} />
        <Rect x={x + 3} y={legFrontY} width={2} height={4} fill={palette.pants} />
        <Rect x={x + 1} y={18} width={2} height={1} fill="#2f2435" />
        <Rect x={x + 3} y={18} width={2} height={1} fill="#2f2435" />
      </>
    )
  }

  if (diagonal) {
    const x = facingRight ? 7 : 6
    const armFrontX = facingRight ? x + 3 : x - 1
    const armBackX = facingRight ? x - 1 : x + 3
    return (
      <>
        <Rect x={x} y={9} width={4} height={5} fill={back ? palette.shirtShade : palette.shirt} />
        <Rect
          x={armBackX}
          y={10 + (frame === 0 ? 0 : 1)}
          width={2}
          height={4}
          fill={palette.shirtShade}
        />
        <Rect
          x={armFrontX}
          y={10 + (frame === 0 ? 1 : 0)}
          width={2}
          height={4}
          fill={palette.skin}
        />
        <Rect x={x} y={14 + (frame === 0 ? 0 : 1)} width={2} height={4} fill={palette.pantsShade} />
        <Rect x={x + 2} y={14 + (frame === 0 ? 1 : 0)} width={2} height={4} fill={palette.pants} />
        <Rect x={x} y={18} width={2} height={1} fill="#2f2435" />
        <Rect x={x + 2} y={18} width={2} height={1} fill="#2f2435" />
      </>
    )
  }

  return (
    <>
      <Rect x={6} y={9} width={5} height={5} fill={back ? palette.shirtShade : palette.shirt} />
      <Rect
        x={4}
        y={10 + (frame === 0 ? 0 : 1)}
        width={2}
        height={4}
        fill={back ? palette.shirtShade : palette.skin}
      />
      <Rect
        x={11}
        y={10 + (frame === 0 ? 1 : 0)}
        width={2}
        height={4}
        fill={back ? palette.shirtShade : palette.skin}
      />
      <Rect x={6} y={14 + (frame === 0 ? 0 : 1)} width={2} height={4} fill={palette.pantsShade} />
      <Rect x={9} y={14 + (frame === 0 ? 1 : 0)} width={2} height={4} fill={palette.pants} />
      <Rect x={6} y={18} width={2} height={1} fill="#2f2435" />
      <Rect x={9} y={18} width={2} height={1} fill="#2f2435" />
    </>
  )
}

export function PixelAvatar({
  userId,
  nickname,
  size = 52,
  direction = "S",
  moving = false,
}: PixelAvatarProps) {
  const [frame, setFrame] = useState<0 | 1>(0)
  const palette = useMemo(() => createPalette(userId), [userId])

  useEffect(() => {
    if (!moving) {
      setFrame(0)
      return
    }

    const interval = window.setInterval(() => {
      setFrame((prev) => (prev === 0 ? 1 : 0))
    }, 170)

    return () => window.clearInterval(interval)
  }, [moving])

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 20"
      aria-label={`${nickname} 아바타`}
      style={{
        imageRendering: "pixelated",
        filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.35))",
      }}
      shapeRendering="crispEdges"
    >
      <Rect x={5} y={18} width={8} height={1} fill="rgba(0,0,0,0.22)" />
      {renderHead(direction, palette)}
      {renderBody(direction, palette, frame)}
    </svg>
  )
}

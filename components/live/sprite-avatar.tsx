"use client"

import { useEffect, useMemo, useState } from "react"
import { PixelAvatar, type AvatarDirection } from "./pixel-avatar"

interface SpriteAvatarProps {
  userId: string
  nickname: string
  direction?: AvatarDirection
  moving?: boolean
  size?: number
}

const FRAME_COUNT = 12
const FRAME_MS = 90

const SPRITE_CONFIG: Record<
  AvatarDirection,
  {
    frames?: string[]
    frameWidth?: number
    frameHeight?: number
    mirrorX?: boolean
  }
> = {
  N: {
    frames: Array.from(
      { length: 12 },
      (_, i) => `/pixel-art/avatars/frames/north/${String(i).padStart(2, "0")}.png`
    ),
    frameWidth: 68,
    frameHeight: 121,
  },
  NE: {
    frames: Array.from(
      { length: 11 },
      (_, i) => `/pixel-art/avatars/frames/northeast/${String(i).padStart(2, "0")}.png`
    ),
    frameWidth: 79,
    frameHeight: 131,
  },
  E: {
    frames: Array.from(
      { length: 11 },
      (_, i) => `/pixel-art/avatars/frames/east/${String(i).padStart(2, "0")}.png`
    ),
    frameWidth: 77,
    frameHeight: 124,
  },
  SE: {
    frames: Array.from(
      { length: 9 },
      (_, i) => `/pixel-art/avatars/frames/southeast/${String(i).padStart(2, "0")}.png`
    ),
    frameWidth: 84,
    frameHeight: 134,
  },
  S: {
    frames: Array.from(
      { length: 11 },
      (_, i) => `/pixel-art/avatars/frames/south/${String(i).padStart(2, "0")}.png`
    ),
    frameWidth: 84,
    frameHeight: 136,
  },
  SW: {
    frames: Array.from(
      { length: 9 },
      (_, i) => `/pixel-art/avatars/frames/southeast/${String(i).padStart(2, "0")}.png`
    ),
    frameWidth: 84,
    frameHeight: 134,
    mirrorX: true,
  },
  W: {
    frames: Array.from(
      { length: 11 },
      (_, i) => `/pixel-art/avatars/frames/east/${String(i).padStart(2, "0")}.png`
    ),
    frameWidth: 77,
    frameHeight: 124,
    mirrorX: true,
  },
  NW: {
    frames: Array.from(
      { length: 11 },
      (_, i) => `/pixel-art/avatars/frames/northeast/${String(i).padStart(2, "0")}.png`
    ),
    frameWidth: 79,
    frameHeight: 131,
    mirrorX: true,
  },
}

export function SpriteAvatar({
  userId,
  nickname,
  direction = "S",
  moving = false,
  size = 60,
}: SpriteAvatarProps) {
  const [frame, setFrame] = useState(0)
  const sprite = SPRITE_CONFIG[direction]
  const frameCount = sprite.frames?.length ?? FRAME_COUNT

  useEffect(() => {
    if (!moving) {
      setFrame(0)
      return
    }

    const interval = window.setInterval(() => {
      setFrame((prev) => (prev + 1) % frameCount)
    }, FRAME_MS)

    return () => window.clearInterval(interval)
  }, [frameCount, moving])

  const frameStyle = useMemo(() => {
    if (!sprite.frames?.length || !sprite.frameWidth || !sprite.frameHeight) return null

    const renderWidth = Math.round((sprite.frameWidth / sprite.frameHeight) * size)

    return {
      viewport: {
        width: `${renderWidth}px`,
        height: `${size}px`,
        transform: sprite.mirrorX ? "scaleX(-1)" : "none",
        transformOrigin: "center",
        filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.35))",
      },
      image: {
        width: `${renderWidth}px`,
        height: `${size}px`,
        imageRendering: "pixelated" as const,
      },
      src: sprite.frames[frame % sprite.frames.length],
      alt: `${nickname} 아바타`,
    }
  }, [frame, size, sprite, nickname])

  if (!frameStyle) {
    return (
      <PixelAvatar
        userId={userId}
        nickname={nickname}
        direction={direction}
        moving={moving}
        size={size}
      />
    )
  }

  return (
    <div style={frameStyle.viewport} aria-label={`${nickname} 아바타`}>
      <img src={frameStyle.src} alt={frameStyle.alt} style={frameStyle.image} draggable={false} />
    </div>
  )
}

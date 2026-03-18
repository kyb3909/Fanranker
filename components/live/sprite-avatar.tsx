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
    src?: string
    sourceWidth?: number
    sourceHeight?: number
    mirrorX?: boolean
  }
> = {
  N: {
    src: "/pixel-art/avatars/base/avatar-north.png",
    sourceWidth: 995,
    sourceHeight: 121,
  },
  NE: {
    src: "/pixel-art/avatars/base/avatar-northeast.png",
    sourceWidth: 1007,
    sourceHeight: 131,
  },
  E: {
    src: "/pixel-art/avatars/base/avatar-east.png",
    sourceWidth: 1019,
    sourceHeight: 124,
  },
  SE: {
    src: "/pixel-art/avatars/base/avatar-southeast.png",
    sourceWidth: 924,
    sourceHeight: 134,
  },
  S: {
    src: "/pixel-art/avatars/base/avatar-south.png",
    sourceWidth: 974,
    sourceHeight: 136,
  },
  SW: {
    src: "/pixel-art/avatars/base/avatar-southeast.png",
    sourceWidth: 924,
    sourceHeight: 134,
    mirrorX: true,
  },
  W: {
    src: "/pixel-art/avatars/base/avatar-east.png",
    sourceWidth: 1019,
    sourceHeight: 124,
    mirrorX: true,
  },
  NW: {
    src: "/pixel-art/avatars/base/avatar-northeast.png",
    sourceWidth: 1007,
    sourceHeight: 131,
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

  useEffect(() => {
    if (!moving) {
      setFrame(0)
      return
    }

    const interval = window.setInterval(() => {
      setFrame((prev) => (prev + 1) % FRAME_COUNT)
    }, FRAME_MS)

    return () => window.clearInterval(interval)
  }, [moving])

  const frameStyle = useMemo(() => {
    if (!sprite.src || !sprite.sourceWidth || !sprite.sourceHeight) return null

    const sourceFrameWidth = sprite.sourceWidth / FRAME_COUNT
    const renderWidth = (sourceFrameWidth / sprite.sourceHeight) * size

    return {
      wrapper: {
        width: `${renderWidth}px`,
        height: `${size}px`,
      },
      sheet: {
        width: `${renderWidth}px`,
        height: `${size}px`,
        backgroundImage: `url(${sprite.src})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${renderWidth * FRAME_COUNT}px ${size}px`,
        backgroundPosition: `-${frame * renderWidth}px 0px`,
        imageRendering: "pixelated" as const,
        transform: sprite.mirrorX ? "scaleX(-1)" : "none",
        transformOrigin: "center",
        filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.35))",
      },
    }
  }, [frame, size, sprite])

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
    <div style={frameStyle.wrapper} aria-label={`${nickname} 아바타`}>
      <div style={frameStyle.sheet} />
    </div>
  )
}

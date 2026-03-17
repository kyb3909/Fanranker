"use client"

import { useEffect, useMemo, useState } from "react"

const HAIR_COLORS = ["#6c5c56", "#47352f", "#8c6d3d", "#4e4458", "#665248"]
const SKIN_COLORS = ["#f6d7c0", "#eac1a2", "#d7a67d", "#bf8a65", "#9f6e52"]
const SHIRT_COLORS = ["#db5d50", "#4f7de2", "#57ab67", "#d7a447", "#7962dc", "#2ca6a0"]
const PANTS_COLORS = ["#5a5768", "#465366", "#3f4558", "#695362"]
const OUTLINE = "#2b1f27"
const SHOE = "#332734"

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
  hairLight: string
  skin: string
  skinShade: string
  shirt: string
  shirtShade: string
  pants: string
  pantsShade: string
}

type Pattern = readonly string[]

const SOUTH_FRAMES: readonly Pattern[] = [
  [
    "................",
    ".....oooooo.....",
    "....ohhhhHho....",
    "...ohhhhhhhho...",
    "...ohssssssho...",
    "...ohssssssho...",
    "...ohsossssho...",
    "....ohssssho....",
    "....oossssoo....",
    "...oorrrrRroo...",
    "...orrrrrrrro...",
    "..oorrrrrrrroo..",
    "..orsrrrrrrsro..",
    "..orsrrrrrrsro..",
    "...oppppppppo...",
    "...opPppppPpo...",
    "..oopPp..pPpoo..",
    "..oopp...ppoo...",
    "...obbo..obbo...",
    "..oobbo..obboo..",
  ],
  [
    "................",
    ".....oooooo.....",
    "....ohhhhHho....",
    "...ohhhhhhhho...",
    "...ohssssssho...",
    "...ohssssssho...",
    "...ohsossssho...",
    "....ohssssho....",
    "....oossssoo....",
    "...oorrrrRroo...",
    "...orrrrrrrro...",
    "..oorrrrrrrroo..",
    "..orsrrrrrrsro..",
    "..orsrrrrrrsro..",
    "...oppppppppo...",
    "...opPppppPpo...",
    "..oopPp...pPoo..",
    "...oopp..ppoo...",
    "...obboo.obbo...",
    "..oobboo.obboo..",
  ],
]

const NORTH_FRAMES: readonly Pattern[] = [
  [
    "................",
    ".....oooooo.....",
    "....ohhhhHho....",
    "...ohhhhhhhho...",
    "...ohhhhhhhho...",
    "...ohhhhhhhho...",
    "...ohhhhhhhho...",
    "....ohhhhHho....",
    "....oohhhhoo....",
    "...oorrrrRroo...",
    "...orrrrrrrro...",
    "..oorrrrrrrroo..",
    "..orrRrrRrrrro..",
    "..orrRrrRrrrro..",
    "...oppppppppo...",
    "...opPppppPpo...",
    "..oopPp..pPpoo..",
    "..oopp...ppoo...",
    "...obbo..obbo...",
    "..oobbo..obboo..",
  ],
  [
    "................",
    ".....oooooo.....",
    "....ohhhhHho....",
    "...ohhhhhhhho...",
    "...ohhhhhhhho...",
    "...ohhhhhhhho...",
    "...ohhhhhhhho...",
    "....ohhhhHho....",
    "....oohhhhoo....",
    "...oorrrrRroo...",
    "...orrrrrrrro...",
    "..oorrrrrrrroo..",
    "..orrRrrRrrrro..",
    "..orrRrrRrrrro..",
    "...oppppppppo...",
    "...opPppppPpo...",
    "..oopPp...pPoo..",
    "...oopp..ppoo...",
    "...obboo.obbo...",
    "..oobboo.obboo..",
  ],
]

const EAST_FRAMES: readonly Pattern[] = [
  [
    "................",
    "......ooooo.....",
    ".....ohhhhho....",
    ".....ohhhhHoo...",
    ".....ohssssso...",
    ".....ohsssssso..",
    ".....ohssossoo..",
    "......ohsssso...",
    "......oosssso...",
    "......oorrrro...",
    ".....oorrrrroo..",
    ".....orrrrrrso..",
    ".....orrrrrrso..",
    "......opppppo...",
    "......opppppo...",
    ".....oopPpPoo...",
    ".....oopPppoo...",
    "......obbboo....",
    ".....oobbboo....",
    "....oo....oo....",
  ],
  [
    "................",
    "......ooooo.....",
    ".....ohhhhho....",
    ".....ohhhhHoo...",
    ".....ohssssso...",
    ".....ohsssssso..",
    ".....ohssossoo..",
    "......ohsssso...",
    "......oosssso...",
    "......oorrrro...",
    ".....oorrrrroo..",
    ".....orrrrrrso..",
    ".....orrrrrrso..",
    "......opppppo...",
    "......opppppo...",
    ".....oopPppoo...",
    "......oopPpPoo..",
    "......obbbbo....",
    ".....oobbbboo...",
    ".....oo...oo....",
  ],
]

const SOUTH_EAST_FRAMES: readonly Pattern[] = [
  [
    "................",
    ".....oooooo.....",
    "....ohhhhHho....",
    "....ohhhhhhhoo..",
    "...ohsssssssso..",
    "...ohssssssssoo.",
    "...ohssosssssoo.",
    "....ohssssssoo..",
    "....oosssssoo...",
    "...oorrrrrRoo...",
    "...orrrrrrrsoo..",
    "..oorrrrrrrrso..",
    "..orrsrrrrrrso..",
    "...orsrrrrrro...",
    "...ooppppppo...",
    "...oopPpppPoo...",
    "..ooopPp..pPoo..",
    "...oopp..ppoo...",
    "...oobbo.obbo...",
    "..oo.bb..obboo..",
  ],
  [
    "................",
    ".....oooooo.....",
    "....ohhhhHho....",
    "....ohhhhhhhoo..",
    "...ohsssssssso..",
    "...ohssssssssoo.",
    "...ohssosssssoo.",
    "....ohssssssoo..",
    "....oosssssoo...",
    "...oorrrrrRoo...",
    "...orrrrrrrsoo..",
    "..oorrrrrrrrso..",
    "..orrsrrrrrrso..",
    "...orsrrrrrro...",
    "...ooppppppo...",
    "...oopPpppPoo...",
    "...ooopPp..pPoo.",
    "..ooopp..ppoo...",
    "...oobboo.obbo..",
    "..oo.bb..oobboo.",
  ],
]

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

function createPalette(userId: string): Palette {
  const hash = hashCode(userId)
  const hair = HAIR_COLORS[hash % HAIR_COLORS.length]
  const skin = SKIN_COLORS[(hash >> 4) % SKIN_COLORS.length]
  const shirt = SHIRT_COLORS[(hash >> 8) % SHIRT_COLORS.length]
  const pants = PANTS_COLORS[(hash >> 12) % PANTS_COLORS.length]

  return {
    hair,
    hairLight: shade(hair, 16),
    skin,
    skinShade: shade(skin, -14),
    shirt,
    shirtShade: shade(shirt, -18),
    pants,
    pantsShade: shade(pants, -18),
  }
}

function getPatterns(direction: AvatarDirection) {
  switch (direction) {
    case "N":
      return { patterns: NORTH_FRAMES, mirror: false }
    case "NE":
      return { patterns: SOUTH_EAST_FRAMES, mirror: false, swapVertical: true }
    case "E":
      return { patterns: EAST_FRAMES, mirror: false }
    case "SE":
      return { patterns: SOUTH_EAST_FRAMES, mirror: false }
    case "S":
      return { patterns: SOUTH_FRAMES, mirror: false }
    case "SW":
      return { patterns: SOUTH_EAST_FRAMES, mirror: true }
    case "W":
      return { patterns: EAST_FRAMES, mirror: true }
    case "NW":
      return { patterns: SOUTH_EAST_FRAMES, mirror: true, swapVertical: true }
  }
}

function mapCharToFill(char: string, palette: Palette) {
  switch (char) {
    case "o":
      return OUTLINE
    case "h":
      return palette.hair
    case "H":
      return palette.hairLight
    case "s":
      return palette.skin
    case "S":
      return palette.skinShade
    case "r":
      return palette.shirt
    case "R":
      return palette.shirtShade
    case "p":
      return palette.pants
    case "P":
      return palette.pantsShade
    case "b":
      return SHOE
    default:
      return null
  }
}

function renderPattern(
  pattern: Pattern,
  palette: Palette,
  options: { mirror?: boolean; swapVertical?: boolean }
) {
  const height = pattern.length
  const width = pattern[0]?.length ?? 0
  const pixels: React.ReactNode[] = []

  for (let y = 0; y < height; y++) {
    const row = pattern[y]
    for (let x = 0; x < width; x++) {
      const sourceX = options.mirror ? width - 1 - x : x
      const sourceY = options.swapVertical ? height - 1 - y : y
      const fill = mapCharToFill(pattern[sourceY][sourceX], palette)
      if (!fill) continue

      pixels.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />)
    }
  }

  return pixels
}

export function PixelAvatar({
  userId,
  nickname,
  size = 64,
  direction = "S",
  moving = false,
}: PixelAvatarProps) {
  const [frame, setFrame] = useState<0 | 1>(0)
  const palette = useMemo(() => createPalette(userId), [userId])
  const { patterns, mirror, swapVertical } = getPatterns(direction)
  const pattern = patterns[frame]

  useEffect(() => {
    if (!moving) {
      setFrame(0)
      return
    }

    const interval = window.setInterval(() => {
      setFrame((prev) => (prev === 0 ? 1 : 0))
    }, 180)

    return () => window.clearInterval(interval)
  }, [moving])

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 20"
      aria-label={`${nickname} 아바타`}
      style={{
        imageRendering: "pixelated",
        filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.38))",
      }}
      shapeRendering="crispEdges"
    >
      <ellipse cx="8" cy="19" rx="4.5" ry="1.15" fill="rgba(0,0,0,0.18)" />
      {renderPattern(pattern, palette, { mirror, swapVertical })}
    </svg>
  )
}

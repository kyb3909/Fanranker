"use client"

/**
 * CSS 기반 픽셀 아바타
 * 8-bit 스타일 캐릭터를 순수 CSS로 렌더링
 */

const HAIR_COLORS = ["#4a3728", "#2c1810", "#8b6914", "#c44020", "#1a1a2e", "#6b4c8a"]
const SKIN_COLORS = ["#ffd5b8", "#f5c49c", "#d4a574", "#c49a6c", "#a0785a"]
const SHIRT_COLORS = [
  "#e74c3c",
  "#3498db",
  "#2ecc71",
  "#f39c12",
  "#9b59b6",
  "#1abc9c",
  "#e67e22",
  "#2980b9",
]

function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

interface PixelAvatarProps {
  userId: string
  nickname: string
  size?: number
}

export function PixelAvatar({ userId, nickname, size = 48 }: PixelAvatarProps) {
  const hash = hashCode(userId)
  const hairColor = HAIR_COLORS[hash % HAIR_COLORS.length]
  const skinColor = SKIN_COLORS[(hash >> 4) % SKIN_COLORS.length]
  const shirtColor = SHIRT_COLORS[(hash >> 8) % SHIRT_COLORS.length]

  const px = size / 12 // 12x12 grid

  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg
        width={size}
        height={size}
        viewBox="0 0 12 12"
        style={{ imageRendering: "pixelated" }}
        aria-label={`${nickname} 아바타`}
      >
        {/* Hair */}
        <rect x="3" y="1" width="6" height="2" fill={hairColor} />
        <rect x="2" y="2" width="1" height="1" fill={hairColor} />
        <rect x="9" y="2" width="1" height="1" fill={hairColor} />
        {/* Face */}
        <rect x="3" y="3" width="6" height="3" fill={skinColor} />
        {/* Eyes */}
        <rect x="4" y="4" width="1" height="1" fill="#1a1a2e" />
        <rect x="7" y="4" width="1" height="1" fill="#1a1a2e" />
        {/* Mouth */}
        <rect x="5" y="5" width="2" height="0.5" fill="#c0392b" />
        {/* Body / Shirt */}
        <rect x="2" y="6" width="8" height="3" fill={shirtColor} />
        {/* Shirt collar */}
        <rect x="5" y="6" width="2" height="1" fill={skinColor} />
        {/* Arms */}
        <rect x="1" y="6" width="1" height="3" fill={shirtColor} />
        <rect x="10" y="6" width="1" height="3" fill={shirtColor} />
        {/* Hands */}
        <rect x="1" y="9" width="1" height="1" fill={skinColor} />
        <rect x="10" y="9" width="1" height="1" fill={skinColor} />
        {/* Legs */}
        <rect x="3" y="9" width="2" height="2" fill="#34495e" />
        <rect x="7" y="9" width="2" height="2" fill="#34495e" />
        {/* Shoes */}
        <rect x="3" y="11" width="2" height="1" fill="#2c3e50" />
        <rect x="7" y="11" width="2" height="1" fill="#2c3e50" />
      </svg>
      <span
        className="max-w-[60px] truncate text-center text-[10px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
        style={{ lineHeight: 1.2 }}
      >
        {nickname}
      </span>
    </div>
  )
}

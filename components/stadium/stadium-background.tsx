"use client"

import { STADIUM_LEVELS, getStadiumLevel } from "@/lib/constants/stadium-levels"

interface StadiumBackgroundProps {
  level: number
  teamColor?: string
}

/** 레벨별 그라데이션 배경 (추후 픽셀아트 에셋으로 교체 가능) */
const LEVEL_GRADIENTS: Record<number, string> = {
  1: "from-green-900/30 to-green-800/20",
  2: "from-green-800/40 to-emerald-700/30",
  3: "from-emerald-700/40 to-teal-600/30",
  4: "from-teal-600/50 to-cyan-600/30",
  5: "from-cyan-600/50 to-blue-600/30",
  6: "from-blue-600/50 to-indigo-600/30",
  7: "from-indigo-600/50 to-violet-600/30",
  8: "from-violet-600/50 to-purple-600/30",
  9: "from-purple-600/50 to-fuchsia-500/30",
  10: "from-amber-500/50 to-yellow-400/30",
}

export function StadiumBackground({ level, teamColor }: StadiumBackgroundProps) {
  const levelInfo = getStadiumLevel(level)
  const gradient = LEVEL_GRADIENTS[level] || LEVEL_GRADIENTS[1]

  return (
    <div
      className={`bg-gradient-to-br ${gradient} relative flex h-40 items-center justify-center overflow-hidden rounded-xl border`}
      style={{ borderColor: teamColor ? teamColor + "40" : undefined }}
    >
      {/* 레벨 이모지 */}
      <span className="text-6xl opacity-80 select-none">{levelInfo.emoji}</span>

      {/* 레벨 뱃지 */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-white backdrop-blur-sm">
        <span className="text-xs font-bold">Lv.{level}</span>
        <span className="text-[10px] opacity-80">{levelInfo.nameKo}</span>
      </div>

      {/* 건설 진행 표시 */}
      {level < STADIUM_LEVELS.length && (
        <div className="absolute right-3 bottom-3 rounded-full bg-black/40 px-2.5 py-1 text-[10px] text-white backdrop-blur-sm">
          건설 중...
        </div>
      )}
    </div>
  )
}

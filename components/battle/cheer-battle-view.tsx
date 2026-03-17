"use client"

import type { BattleRoom } from "./battle-types"

interface CheerBattleViewProps {
  room: BattleRoom
  onBack: () => void
}

// 준비 중인 기능입니다.
export function CheerBattleView({ room, onBack }: CheerBattleViewProps) {
  return (
    <div className="p-8 text-center">
      <h2 className="text-lg font-bold">{room.title}</h2>
      <p className="text-muted-foreground mt-2 text-sm">응원 배틀 기능은 준비 중입니다.</p>
      <button onClick={onBack} className="text-primary mt-4 text-sm hover:underline">
        뒤로가기
      </button>
    </div>
  )
}

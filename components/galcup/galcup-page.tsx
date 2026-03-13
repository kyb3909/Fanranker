"use client"

import { useState, useEffect, useCallback } from "react"
import { Flame, Users, Clock } from "lucide-react"
import { CheerBattleView } from "@/components/battle/cheer-battle-view"
import type { BattleRoom } from "@/components/battle/battle-types"
import {
  BATTLE_CATEGORIES,
  BATTLE_STATUS_LABELS,
  formatBattleTime,
  getBattleProgress,
} from "@/components/battle/battle-types"

export default function GalcupPage() {
  const [rooms, setRooms] = useState<BattleRoom[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [selectedRoom, setSelectedRoom] = useState<BattleRoom | null>(null)

  const loadRooms = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ mode: "cheer" })
      if (categoryFilter !== "all") params.set("category", categoryFilter)
      const res = await fetch(`/api/battles/rooms?${params}`)
      const data = await res.json()
      if (data.rooms) setRooms(data.rooms)
    } catch {
      // ignore
    } finally {
      setIsLoading(false)
    }
  }, [categoryFilter])

  useEffect(() => {
    loadRooms()
  }, [loadRooms])

  // 갈드컵 상세 뷰
  if (selectedRoom) {
    return <CheerBattleView room={selectedRoom} onBack={() => setSelectedRoom(null)} />
  }

  const activeBattles = rooms.filter((r) => r.status === "active")
  const heroRoom = activeBattles[0]

  return (
    <div className="space-y-4">
      {/* ====== 헤더 ====== */}
      <div className="bg-card border-border rounded-xl border px-5 py-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 flex h-9 w-9 items-center justify-center rounded-lg">
            <Flame className="text-primary h-4.5 w-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-foreground text-lg font-bold tracking-tight">갈드컵</h1>
              {activeBattles.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  {activeBattles.length}개 진행 중
                </span>
              )}
            </div>
            <p className="text-muted-foreground text-[12px]">
              진영을 선택하고 댓글로 투표하라! 댓글 하나 = 1표
            </p>
          </div>
        </div>
      </div>

      {/* ====== 카테고리 필터 ====== */}
      <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
        {BATTLE_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategoryFilter(cat.id)}
            className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-medium transition-all ${
              categoryFilter === cat.id
                ? "bg-primary/10 text-primary font-semibold"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="text-sm">{cat.icon}</span>
            {cat.label}
          </button>
        ))}
      </div>

      {/* ====== 갈드컵 리스트 ====== */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-muted h-40 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="bg-card border-border rounded-xl border p-10 text-center">
          <Flame className="text-muted-foreground/30 mx-auto h-10 w-10" />
          <p className="text-muted-foreground mt-3 text-sm font-medium">아직 갈드컵이 없습니다</p>
          <p className="text-muted-foreground/60 mt-1 text-xs">
            관리자가 새로운 갈드컵을 열면 여기에 표시됩니다
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rooms.map((room) => (
            <GalcupCard key={room.id} room={room} onSelect={() => setSelectedRoom(room)} />
          ))}
        </div>
      )}
    </div>
  )
}

function GalcupCard({ room, onSelect }: { room: BattleRoom; onSelect: () => void }) {
  const sides = room.sides ?? []
  const sideA = sides[0]
  const sideB = sides[1]
  const progress = sideA && sideB ? getBattleProgress(sideA.score, sideB.score) : 50
  const isActive = room.status === "active"

  return (
    <button
      onClick={onSelect}
      className="bg-card border-border group w-full overflow-hidden rounded-xl border text-left shadow-[0_2px_12px_rgba(0,0,0,0.07)] transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.1)]"
    >
      {/* 상단 */}
      <div className="flex items-center justify-between px-5 pt-4">
        <div className="flex items-center gap-2">
          <Flame className="text-primary h-4 w-4" />
          <h3 className="text-foreground text-sm font-bold">{room.title}</h3>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            isActive
              ? "bg-emerald-500/10 text-emerald-600"
              : room.status === "ended"
                ? "bg-muted text-muted-foreground"
                : "bg-blue-500/10 text-blue-600"
          }`}
        >
          {isActive && "● "}
          {BATTLE_STATUS_LABELS[room.status]}
        </span>
      </div>

      {/* 대결 */}
      {sideA && sideB && (
        <div className="px-5 py-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 text-right">
              {sideA.image_url ? (
                <img
                  src={sideA.image_url}
                  alt={sideA.name}
                  className="ml-auto h-12 w-12 rounded-full border-2 object-cover"
                  style={{ borderColor: sideA.color }}
                />
              ) : (
                <div
                  className="ml-auto flex h-12 w-12 items-center justify-center rounded-full text-lg font-black text-white"
                  style={{ backgroundColor: sideA.color + "80" }}
                >
                  {sideA.name.charAt(0)}
                </div>
              )}
              <p className="text-foreground mt-1.5 text-sm font-bold">{sideA.name}</p>
              <p className="text-lg font-black tabular-nums" style={{ color: sideA.color }}>
                {sideA.score}
              </p>
            </div>
            <div className="bg-muted text-muted-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-black">
              VS
            </div>
            <div className="flex-1 text-left">
              {sideB.image_url ? (
                <img
                  src={sideB.image_url}
                  alt={sideB.name}
                  className="h-12 w-12 rounded-full border-2 object-cover"
                  style={{ borderColor: sideB.color }}
                />
              ) : (
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-black text-white"
                  style={{ backgroundColor: sideB.color + "80" }}
                >
                  {sideB.name.charAt(0)}
                </div>
              )}
              <p className="text-foreground mt-1.5 text-sm font-bold">{sideB.name}</p>
              <p className="text-lg font-black tabular-nums" style={{ color: sideB.color }}>
                {sideB.score}
              </p>
            </div>
          </div>

          {/* 게이지 */}
          <div className="bg-muted mt-3 flex h-2.5 w-full overflow-hidden rounded-full">
            <div
              className="transition-all duration-700 ease-out"
              style={{ width: `${progress}%`, backgroundColor: sideA.color }}
            />
            <div
              className="transition-all duration-700 ease-out"
              style={{ width: `${100 - progress}%`, backgroundColor: sideB.color }}
            />
          </div>
        </div>
      )}

      {/* 하단 */}
      <div className="border-border text-muted-foreground flex items-center gap-3 border-t px-5 py-2.5 text-[11px]">
        {room.category && <span>{room.category}</span>}
        {room.total_participants > 0 && (
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {room.total_participants}명
          </span>
        )}
        {room.ends_at && (
          <span className="ml-auto flex items-center gap-1">
            <Clock className="h-3 w-3" />~{formatBattleTime(room.ends_at)}
          </span>
        )}
      </div>
    </button>
  )
}

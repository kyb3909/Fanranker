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
      {/* ====== 히어로 배너 ====== */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a0a00] via-[#2d1400] to-[#1a0a00] shadow-xl">
        <div className="pointer-events-none absolute inset-0 opacity-10">
          <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-orange-500 blur-3xl" />
          <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-red-500 blur-3xl" />
        </div>

        <div className="relative p-6 sm:p-8">
          <div className="text-center">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/70">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400" />
              {activeBattles.length > 0
                ? `${activeBattles.length}개 갈드컵 진행 중`
                : "새로운 갈드컵을 기다리는 중"}
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">🔥 갈드컵</h1>
            <p className="mt-1 text-sm text-white/50">
              진영을 선택하고 댓글로 투표하라! 댓글 하나 = 1표
            </p>
          </div>

          {/* 히어로: 활성 갈드컵 미리보기 */}
          {heroRoom && heroRoom.sides && heroRoom.sides.length === 2 && (
            <button
              onClick={() => setSelectedRoom(heroRoom)}
              className="group mt-5 w-full rounded-xl bg-white/5 p-4 text-left transition-all hover:bg-white/10"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-bold text-white">{heroRoom.title}</span>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                  LIVE
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex-1 text-right text-sm font-semibold text-white">
                  {heroRoom.sides[0].name}
                </span>
                <div className="flex h-10 w-full max-w-[200px] overflow-hidden rounded-full">
                  <div
                    className="flex items-center justify-center text-[11px] font-bold text-white transition-all duration-700"
                    style={{
                      width: `${Math.max(getBattleProgress(heroRoom.sides[0].score, heroRoom.sides[1].score), 15)}%`,
                      backgroundColor: heroRoom.sides[0].color,
                    }}
                  >
                    {heroRoom.sides[0].score}
                  </div>
                  <div
                    className="flex items-center justify-center text-[11px] font-bold text-white transition-all duration-700"
                    style={{
                      width: `${Math.max(100 - getBattleProgress(heroRoom.sides[0].score, heroRoom.sides[1].score), 15)}%`,
                      backgroundColor: heroRoom.sides[1].color,
                    }}
                  >
                    {heroRoom.sides[1].score}
                  </div>
                </div>
                <span className="flex-1 text-sm font-semibold text-white">
                  {heroRoom.sides[1].name}
                </span>
              </div>
              <p className="mt-2 text-center text-xs text-white/40 group-hover:text-white/60">
                참여하기 →
              </p>
            </button>
          )}
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
                ? "bg-foreground text-background shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
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
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-[#1a2332]" />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="rounded-2xl bg-[#1a2332] p-10 text-center shadow-lg">
          <div className="text-5xl">🔥</div>
          <p className="mt-3 text-sm font-medium text-white/50">아직 갈드컵이 없습니다</p>
          <p className="mt-1 text-xs text-white/30">
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
      className="group w-full overflow-hidden rounded-2xl bg-gradient-to-br from-[#0f172a] to-[#1e293b] text-left shadow-lg transition-all hover:shadow-xl hover:ring-1 hover:ring-white/10"
    >
      {/* 상단 */}
      <div className="flex items-center justify-between px-5 pt-4">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-400" />
          <h3 className="text-sm font-bold text-white">{room.title}</h3>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            isActive
              ? "bg-emerald-500/20 text-emerald-400"
              : room.status === "ended"
                ? "bg-white/10 text-white/40"
                : "bg-blue-500/20 text-blue-400"
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
                  style={{ backgroundColor: sideA.color + "40" }}
                >
                  {sideA.name.charAt(0)}
                </div>
              )}
              <p className="mt-1.5 text-sm font-bold text-white">{sideA.name}</p>
              <p className="text-lg font-black tabular-nums" style={{ color: sideA.color }}>
                {sideA.score}
              </p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/5 text-xs font-black text-white/50">
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
                  style={{ backgroundColor: sideB.color + "40" }}
                >
                  {sideB.name.charAt(0)}
                </div>
              )}
              <p className="mt-1.5 text-sm font-bold text-white">{sideB.name}</p>
              <p className="text-lg font-black tabular-nums" style={{ color: sideB.color }}>
                {sideB.score}
              </p>
            </div>
          </div>

          {/* 게이지 */}
          <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full">
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
      <div className="flex items-center gap-3 border-t border-white/5 px-5 py-2.5 text-[11px] text-white/40">
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

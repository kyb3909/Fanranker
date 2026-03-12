"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, Trophy, Users, Clock } from "lucide-react"
import { WorldcupView } from "@/components/battle/worldcup-view"
import { CreateWorldcupDialog } from "@/components/battle/create-worldcup-dialog"
import type { BattleRoom } from "@/components/battle/battle-types"
import {
  BATTLE_CATEGORIES,
  BATTLE_STATUS_LABELS,
  formatBattleTime,
} from "@/components/battle/battle-types"

export default function WorldcupPage() {
  const [rooms, setRooms] = useState<BattleRoom[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [selectedRoom, setSelectedRoom] = useState<BattleRoom | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const loadRooms = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ mode: "worldcup" })
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

  // 월드컵 상세 뷰
  if (selectedRoom) {
    return <WorldcupView room={selectedRoom} onBack={() => setSelectedRoom(null)} />
  }

  return (
    <div className="space-y-4">
      {/* ====== 히어로 배너 ====== */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a1033] via-[#2d1b69] to-[#1a1033] shadow-xl">
        <div className="pointer-events-none absolute inset-0 opacity-10">
          <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-violet-500 blur-3xl" />
          <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-amber-500 blur-3xl" />
        </div>

        <div className="relative p-6 sm:p-8">
          <div className="text-center">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/70">
              {rooms.filter((r) => r.status === "active").length > 0
                ? `${rooms.filter((r) => r.status === "active").length}개 월드컵 진행 중`
                : "새로운 월드컵을 만들어보세요"}
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
              🏆 이상형 월드컵
            </h1>
            <p className="mt-1 text-sm text-white/50">
              토너먼트로 최강자를 가려라! 누구나 만들 수 있습니다
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
                ? "bg-foreground text-background shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            }`}
          >
            <span className="text-sm">{cat.icon}</span>
            {cat.label}
          </button>
        ))}
      </div>

      {/* ====== 월드컵 만들기 CTA ====== */}
      <button
        onClick={() => setShowCreate(true)}
        className="group flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-violet-300 bg-violet-50 py-3.5 text-sm font-semibold text-violet-600 transition-all hover:border-violet-400 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-400 dark:hover:border-violet-700 dark:hover:bg-violet-950/50"
      >
        <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" />
        이상형 월드컵 만들기
      </button>

      {/* ====== 월드컵 리스트 ====== */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-[#1a1033]" />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="rounded-2xl bg-[#1a1033] p-10 text-center shadow-lg">
          <div className="text-5xl">🏆</div>
          <p className="mt-3 text-sm font-medium text-white/50">아직 월드컵이 없습니다</p>
          <p className="mt-1 text-xs text-white/30">
            위 버튼을 눌러 첫 이상형 월드컵을 만들어보세요!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rooms.map((room) => (
            <WorldcupCard key={room.id} room={room} onSelect={() => setSelectedRoom(room)} />
          ))}
        </div>
      )}

      {/* 월드컵 생성 다이얼로그 */}
      {showCreate && (
        <CreateWorldcupDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            loadRooms()
          }}
        />
      )}
    </div>
  )
}

function WorldcupCard({ room, onSelect }: { room: BattleRoom; onSelect: () => void }) {
  const isActive = room.status === "active"

  return (
    <button
      onClick={onSelect}
      className="group w-full overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a1033] to-[#2d1b69] text-left shadow-lg transition-all hover:shadow-xl hover:ring-1 hover:ring-violet-500/20"
    >
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-400" />
              <h3 className="truncate text-sm font-bold text-white">{room.title}</h3>
            </div>
            {room.description && (
              <p className="mt-1 line-clamp-1 text-xs text-white/40">{room.description}</p>
            )}
          </div>
          <span
            className={`ml-3 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              isActive
                ? "bg-emerald-500/20 text-emerald-400"
                : room.status === "pending"
                  ? "bg-yellow-500/20 text-yellow-400"
                  : room.status === "ended"
                    ? "bg-white/10 text-white/40"
                    : "bg-blue-500/20 text-blue-400"
            }`}
          >
            {BATTLE_STATUS_LABELS[room.status]}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-4">
          <div className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
            <div className="text-center">
              <p className="text-lg font-black text-amber-400">{room.bracket_size ?? "?"}</p>
              <p className="text-[10px] text-white/40">강</p>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div className="text-center">
              <p className="text-lg font-black text-white">{room.total_participants}</p>
              <p className="text-[10px] text-white/40">참여</p>
            </div>
          </div>
          {isActive && (
            <span className="ml-auto rounded-full bg-violet-500/20 px-3 py-1.5 text-xs font-semibold text-violet-300 transition-colors group-hover:bg-violet-500/30">
              참여하기 →
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-white/5 px-5 py-2.5 text-[11px] text-white/30">
        {room.category && <span>{room.category}</span>}
        {room.ends_at && (
          <span className="ml-auto flex items-center gap-1">
            <Clock className="h-3 w-3" />~{formatBattleTime(room.ends_at)}
          </span>
        )}
      </div>
    </button>
  )
}

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

  const activeBattles = rooms.filter((r) => r.status === "active")

  return (
    <div className="space-y-4">
      {/* ====== 헤더 ====== */}
      <div className="bg-card border-border rounded-xl border px-5 py-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 flex h-9 w-9 items-center justify-center rounded-lg">
            <Trophy className="text-primary h-4.5 w-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-foreground text-lg font-bold tracking-tight">이상형 월드컵</h1>
              {activeBattles.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  {activeBattles.length}개 진행 중
                </span>
              )}
            </div>
            <p className="text-muted-foreground text-[12px]">
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
                ? "bg-primary/10 text-primary font-semibold"
                : "bg-muted text-muted-foreground hover:text-foreground"
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
        className="border-border text-primary hover:bg-primary/5 group flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed py-3.5 text-sm font-semibold transition-all"
      >
        <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" />
        이상형 월드컵 만들기
      </button>

      {/* ====== 월드컵 리스트 ====== */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-muted h-32 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="bg-card border-border rounded-xl border p-10 text-center">
          <Trophy className="text-muted-foreground/30 mx-auto h-10 w-10" />
          <p className="text-muted-foreground mt-3 text-sm font-medium">아직 월드컵이 없습니다</p>
          <p className="text-muted-foreground/60 mt-1 text-xs">
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
      className="bg-card border-border group w-full overflow-hidden rounded-xl border text-left shadow-[0_2px_12px_rgba(0,0,0,0.07)] transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.1)]"
    >
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Trophy className="text-primary h-4 w-4" />
              <h3 className="text-foreground truncate text-sm font-bold">{room.title}</h3>
            </div>
            {room.description && (
              <p className="text-muted-foreground mt-1 line-clamp-1 text-xs">{room.description}</p>
            )}
          </div>
          <span
            className={`ml-3 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              isActive
                ? "bg-emerald-500/10 text-emerald-600"
                : room.status === "pending"
                  ? "bg-yellow-500/10 text-yellow-600"
                  : room.status === "ended"
                    ? "bg-muted text-muted-foreground"
                    : "bg-blue-500/10 text-blue-600"
            }`}
          >
            {BATTLE_STATUS_LABELS[room.status]}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-4">
          <div className="bg-muted/60 flex items-center gap-3 rounded-lg px-3 py-2">
            <div className="text-center">
              <p className="text-primary text-lg font-black">{room.bracket_size ?? "?"}</p>
              <p className="text-muted-foreground text-[10px]">강</p>
            </div>
            <div className="bg-border h-8 w-px" />
            <div className="text-center">
              <p className="text-foreground text-lg font-black">{room.total_participants}</p>
              <p className="text-muted-foreground text-[10px]">참여</p>
            </div>
          </div>
          {isActive && (
            <span className="text-primary bg-primary/10 group-hover:bg-primary/15 ml-auto rounded-full px-3 py-1.5 text-xs font-semibold transition-colors">
              참여하기 →
            </span>
          )}
        </div>
      </div>

      <div className="border-border text-muted-foreground flex items-center gap-3 border-t px-5 py-2.5 text-[11px]">
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

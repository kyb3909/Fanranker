"use client"

import { useState, useCallback } from "react"
import { POSITION_COLORS, type Player, type Position } from "@/lib/draft/players"
import type { Formation } from "@/lib/draft/engine"

interface FieldSlot {
  id: string
  label: string
  x: number // percentage
  y: number // percentage
}

/** 포메이션별 필드 슬롯 좌표 (x: 좌→우, y: 상단=상대골대, 하단=우리골대) */
const FORMATION_SLOTS: Record<Formation, FieldSlot[]> = {
  "4-4-2": [
    { id: "gk", label: "GK", x: 50, y: 90 },
    { id: "lb", label: "LB", x: 15, y: 72 },
    { id: "lcb", label: "CB", x: 37, y: 75 },
    { id: "rcb", label: "CB", x: 63, y: 75 },
    { id: "rb", label: "RB", x: 85, y: 72 },
    { id: "lm", label: "LM", x: 15, y: 48 },
    { id: "lcm", label: "CM", x: 38, y: 50 },
    { id: "rcm", label: "CM", x: 62, y: 50 },
    { id: "rm", label: "RM", x: 85, y: 48 },
    { id: "ls", label: "ST", x: 35, y: 22 },
    { id: "rs", label: "ST", x: 65, y: 22 },
  ],
  "4-3-3": [
    { id: "gk", label: "GK", x: 50, y: 90 },
    { id: "lb", label: "LB", x: 15, y: 72 },
    { id: "lcb", label: "CB", x: 37, y: 75 },
    { id: "rcb", label: "CB", x: 63, y: 75 },
    { id: "rb", label: "RB", x: 85, y: 72 },
    { id: "lcm", label: "CM", x: 30, y: 50 },
    { id: "cm", label: "CM", x: 50, y: 52 },
    { id: "rcm", label: "CM", x: 70, y: 50 },
    { id: "lw", label: "LW", x: 18, y: 25 },
    { id: "st", label: "ST", x: 50, y: 20 },
    { id: "rw", label: "RW", x: 82, y: 25 },
  ],
  "3-5-2": [
    { id: "gk", label: "GK", x: 50, y: 90 },
    { id: "lcb", label: "CB", x: 30, y: 75 },
    { id: "cb", label: "CB", x: 50, y: 77 },
    { id: "rcb", label: "CB", x: 70, y: 75 },
    { id: "lwb", label: "LWB", x: 10, y: 55 },
    { id: "lcm", label: "CM", x: 32, y: 50 },
    { id: "cm", label: "CM", x: 50, y: 48 },
    { id: "rcm", label: "CM", x: 68, y: 50 },
    { id: "rwb", label: "RWB", x: 90, y: 55 },
    { id: "ls", label: "ST", x: 35, y: 22 },
    { id: "rs", label: "ST", x: 65, y: 22 },
  ],
  "3-4-3": [
    { id: "gk", label: "GK", x: 50, y: 90 },
    { id: "lcb", label: "CB", x: 30, y: 75 },
    { id: "cb", label: "CB", x: 50, y: 77 },
    { id: "rcb", label: "CB", x: 70, y: 75 },
    { id: "lm", label: "LM", x: 18, y: 50 },
    { id: "lcm", label: "CM", x: 40, y: 52 },
    { id: "rcm", label: "CM", x: 60, y: 52 },
    { id: "rm", label: "RM", x: 82, y: 50 },
    { id: "lw", label: "LW", x: 18, y: 25 },
    { id: "st", label: "ST", x: 50, y: 20 },
    { id: "rw", label: "RW", x: 82, y: 25 },
  ],
  "5-3-2": [
    { id: "gk", label: "GK", x: 50, y: 90 },
    { id: "lwb", label: "LWB", x: 10, y: 68 },
    { id: "lcb", label: "CB", x: 30, y: 75 },
    { id: "cb", label: "CB", x: 50, y: 77 },
    { id: "rcb", label: "CB", x: 70, y: 75 },
    { id: "rwb", label: "RWB", x: 90, y: 68 },
    { id: "lcm", label: "CM", x: 30, y: 50 },
    { id: "cm", label: "CM", x: 50, y: 48 },
    { id: "rcm", label: "CM", x: 70, y: 50 },
    { id: "ls", label: "ST", x: 35, y: 22 },
    { id: "rs", label: "ST", x: 65, y: 22 },
  ],
  "5-4-1": [
    { id: "gk", label: "GK", x: 50, y: 90 },
    { id: "lwb", label: "LWB", x: 10, y: 68 },
    { id: "lcb", label: "CB", x: 30, y: 75 },
    { id: "cb", label: "CB", x: 50, y: 77 },
    { id: "rcb", label: "CB", x: 70, y: 75 },
    { id: "rwb", label: "RWB", x: 90, y: 68 },
    { id: "lm", label: "LM", x: 18, y: 48 },
    { id: "lcm", label: "CM", x: 40, y: 50 },
    { id: "rcm", label: "CM", x: 60, y: 50 },
    { id: "rm", label: "RM", x: 82, y: 48 },
    { id: "st", label: "ST", x: 50, y: 20 },
  ],
}

interface FormationFieldProps {
  formation: Formation
  roster: Player[]
  onComplete: (placements: Record<string, Player>) => void
}

export function FormationField({ formation, roster, onComplete }: FormationFieldProps) {
  const slots = FORMATION_SLOTS[formation]
  // slotId → player
  const [placements, setPlacements] = useState<Record<string, Player>>({})
  // 드래그 중인 선수
  const [dragging, setDragging] = useState<Player | null>(null)
  // 드래그 중인 슬롯 (슬롯에서 드래그할 때)
  const [draggingFromSlot, setDraggingFromSlot] = useState<string | null>(null)

  const placedPlayerIds = new Set(Object.values(placements).map((p) => p.id))
  const unplacedPlayers = roster.filter((p) => !placedPlayerIds.has(p.id))
  const allPlaced = Object.keys(placements).length === 11

  const handleDragStart = useCallback((player: Player, fromSlot?: string) => {
    setDragging(player)
    setDraggingFromSlot(fromSlot || null)
  }, [])

  const handleDrop = useCallback(
    (slotId: string) => {
      if (!dragging) return

      setPlacements((prev) => {
        const next = { ...prev }
        // 기존 슬롯에서 드래그한 경우 이전 슬롯 비우기
        if (draggingFromSlot) {
          delete next[draggingFromSlot]
        }
        // 이 슬롯에 이미 선수가 있으면 교체 (이전 슬롯으로 보내거나 미배치로)
        if (next[slotId] && draggingFromSlot) {
          next[draggingFromSlot] = next[slotId]
        }
        next[slotId] = dragging
        return next
      })
      setDragging(null)
      setDraggingFromSlot(null)
    },
    [dragging, draggingFromSlot]
  )

  const handleRemoveFromSlot = useCallback((slotId: string) => {
    setPlacements((prev) => {
      const next = { ...prev }
      delete next[slotId]
      return next
    })
  }, [])

  return (
    <div className="mx-auto max-w-4xl py-6">
      <div className="mb-6 text-center">
        <h1 className="text-foreground text-2xl font-black">선수 배치</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          선수를 드래그해서 원하는 포지션에 배치하세요 · 포메이션: {formation}
        </p>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        {/* 미배치 선수 목록 */}
        <div className="w-full shrink-0 lg:w-[220px]">
          <div className="border-border bg-card rounded-xl border shadow-sm">
            <div className="border-border border-b px-3 py-2.5">
              <h3 className="text-foreground text-sm font-bold">
                미배치 선수 ({unplacedPlayers.length})
              </h3>
            </div>
            <div className="max-h-[520px] space-y-1 overflow-y-auto p-2">
              {unplacedPlayers.map((player) => (
                <div
                  key={player.id}
                  draggable
                  onDragStart={() => handleDragStart(player)}
                  onDragEnd={() => {
                    setDragging(null)
                    setDraggingFromSlot(null)
                  }}
                  className="border-border/50 bg-muted/30 hover:bg-muted/60 flex cursor-grab items-center gap-2 rounded-lg border px-2.5 py-2 transition-all active:cursor-grabbing"
                >
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${POSITION_COLORS[player.position]}`}
                  >
                    {player.position}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-foreground truncate text-sm font-medium">
                      {player.nameKo}
                    </div>
                    <div className="text-muted-foreground text-[10px]">{player.teamKo}</div>
                  </div>
                  <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
                    £{player.price.toFixed(1)}
                  </span>
                </div>
              ))}
              {unplacedPlayers.length === 0 && (
                <p className="text-muted-foreground py-4 text-center text-xs">
                  모든 선수가 배치되었습니다
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 축구장 */}
        <div className="flex-1">
          <div
            className="relative overflow-hidden rounded-2xl border-2 border-emerald-700/50 shadow-lg"
            style={{
              aspectRatio: "68/105",
              background:
                "linear-gradient(to bottom, #1a6b30 0%, #1e7a37 25%, #1a6b30 50%, #1e7a37 75%, #1a6b30 100%)",
            }}
          >
            {/* 필드 라인 */}
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 68 105" fill="none">
              {/* 외곽선 */}
              <rect
                x="1"
                y="1"
                width="66"
                height="103"
                stroke="white"
                strokeOpacity="0.3"
                strokeWidth="0.5"
              />
              {/* 센터라인 */}
              <line
                x1="1"
                y1="52.5"
                x2="67"
                y2="52.5"
                stroke="white"
                strokeOpacity="0.3"
                strokeWidth="0.5"
              />
              {/* 센터서클 */}
              <circle
                cx="34"
                cy="52.5"
                r="9.15"
                stroke="white"
                strokeOpacity="0.3"
                strokeWidth="0.5"
              />
              {/* 상단 페널티 박스 */}
              <rect
                x="13.84"
                y="1"
                width="40.32"
                height="16.5"
                stroke="white"
                strokeOpacity="0.3"
                strokeWidth="0.5"
              />
              <rect
                x="24.84"
                y="1"
                width="18.32"
                height="5.5"
                stroke="white"
                strokeOpacity="0.3"
                strokeWidth="0.5"
              />
              <path
                d="M 25.5 16.5 A 9.15 9.15 0 0 0 42.5 16.5"
                stroke="white"
                strokeOpacity="0.2"
                strokeWidth="0.5"
              />
              {/* 하단 페널티 박스 */}
              <rect
                x="13.84"
                y="87.5"
                width="40.32"
                height="16.5"
                stroke="white"
                strokeOpacity="0.3"
                strokeWidth="0.5"
              />
              <rect
                x="24.84"
                y="98.5"
                width="18.32"
                height="5.5"
                stroke="white"
                strokeOpacity="0.3"
                strokeWidth="0.5"
              />
              <path
                d="M 25.5 87.5 A 9.15 9.15 0 0 1 42.5 87.5"
                stroke="white"
                strokeOpacity="0.2"
                strokeWidth="0.5"
              />
            </svg>

            {/* 포지션 슬롯 */}
            {slots.map((slot) => {
              const player = placements[slot.id]
              return (
                <div
                  key={slot.id}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = "move"
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    handleDrop(slot.id)
                  }}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                >
                  {player ? (
                    <div
                      draggable
                      onDragStart={() => handleDragStart(player, slot.id)}
                      onDragEnd={() => {
                        setDragging(null)
                        setDraggingFromSlot(null)
                      }}
                      onDoubleClick={() => handleRemoveFromSlot(slot.id)}
                      className="group relative flex cursor-grab flex-col items-center active:cursor-grabbing"
                      title="더블클릭으로 해제"
                    >
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/80 text-[10px] font-bold text-white shadow-lg ${
                          player.position === "GK"
                            ? "bg-amber-500"
                            : player.position === "DF"
                              ? "bg-blue-500"
                              : player.position === "MF"
                                ? "bg-green-500"
                                : "bg-red-500"
                        }`}
                      >
                        <span className="text-[9px]">{player.position}</span>
                      </div>
                      <div className="mt-0.5 max-w-[80px] rounded bg-black/70 px-1.5 py-0.5 text-center">
                        <div className="truncate text-[10px] leading-tight font-bold text-white">
                          {player.nameKo}
                        </div>
                        <div className="text-[8px] text-white/60">{player.teamKo}</div>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`flex h-12 w-12 flex-col items-center justify-center rounded-full border-2 border-dashed transition-all ${
                        dragging
                          ? "scale-110 border-white/60 bg-white/20"
                          : "border-white/30 bg-white/10"
                      }`}
                    >
                      <span className="text-[10px] font-bold text-white/70">{slot.label}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* 완료 버튼 */}
          <div className="mt-4 flex justify-center">
            <button
              onClick={() => onComplete(placements)}
              disabled={!allPlaced}
              className={`rounded-xl px-10 py-3 text-sm font-bold shadow-lg transition-all ${
                allPlaced
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            >
              {allPlaced
                ? "배치 완료!"
                : `선수를 모두 배치하세요 (${Object.keys(placements).length}/11)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

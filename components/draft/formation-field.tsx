"use client"

import { useState, useCallback } from "react"
import type { Player, Position } from "@/lib/draft/players"
import { POSITION_HEX } from "@/lib/draft/visual-helpers"
import type { Formation } from "@/lib/draft/engine"
import { slotCodes } from "./pitch-viz"

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

/**
 * 드래프트 도판의 배치를 이 화면의 자리로 옮긴다.
 *
 * 두 화면은 자리 이름이 다르다 — 도판은 `GK1·DF1·MF1·FW1…`, 여기는 `gk·lb·lcb·lcm·lw…`.
 * 다만 **둘 다 GK → 수비 → 미드 → 공격 순서이고 각 줄은 왼쪽부터**라서 같은 순번끼리
 * 정확히 맞물린다 (`__tests__/lib/draft-slot-carry.test.ts` 가 이 전제를 지킨다).
 */
export function pitchSlotsToPlacements(
  slots: Record<string, Player | null>,
  formation: Formation
): Record<string, Player> {
  const codes = slotCodes(formation)
  const field = FORMATION_SLOTS[formation]
  const out: Record<string, Player> = {}
  codes.forEach((code, i) => {
    const player = slots[code]
    const target = field[i]
    if (player && target) out[target.id] = player
  })
  return out
}

/**
 * 위의 역방향 — 배치 화면의 자리를 도판 좌표계로 되돌린다.
 *
 * 결과 화면이 도판(PitchViz)을 그대로 재사용하려면 좌표계가 하나여야 한다.
 * 게임 전체가 도판 코드(GK1·DF1…)를 정본으로 쓰고, 배치 화면만 자기 이름(gk·lb…)을
 * 쓰므로 나갈 때 되돌려 준다.
 */
export function placementsToPitchSlots(
  placements: Record<string, Player>,
  formation: Formation
): Record<string, Player | null> {
  const codes = slotCodes(formation)
  const field = FORMATION_SLOTS[formation]
  const out: Record<string, Player | null> = {}
  field.forEach((slot, i) => {
    const code = codes[i]
    if (code) out[code] = placements[slot.id] ?? null
  })
  return out
}

interface FormationFieldProps {
  formation: Formation
  roster: Player[]
  onComplete: (placements: Record<string, Player>) => void
  /** 드래프트 중 도판에 놓아둔 배치 — 여기서 처음부터 다시 놓게 하지 않는다. */
  initialPlacements?: Record<string, Player>
}

export function FormationField({
  formation,
  roster,
  onComplete,
  initialPlacements,
}: FormationFieldProps) {
  const slots = FORMATION_SLOTS[formation]
  // slotId → player. 드래프트에서 이어받은 배치가 있으면 그걸로 시작한다.
  const [placements, setPlacements] = useState<Record<string, Player>>(initialPlacements ?? {})
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
    /* ⚠️ draft-scope 필수 (2026-08-25 정렬). 종전엔 이 화면만 스코프 밖이라 shadcn
       기본 팔레트(bg-muted / bg-primary / bg-blue-500 배지)로 렌더돼, 드래프트 보드에서
       넘어오는 순간 다른 사이트로 이동한 것처럼 보였다. 게임 3화면 중 2개가 그랬다. */
    <div className="draft-scope" style={{ background: "var(--draft-paper)" }}>
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-6 text-center">
          {/* 드래프트에서 배치를 이어받은 뒤로는 "처음부터 놓는 곳" 이 아니라
            "확인하고 손보는 곳" 이다 (2026-08-25). 문구가 그대로면 이미 다 놓인 화면을
            보고도 뭘 더 해야 하나 싶어진다. */}
          <h1 className="draft-title text-2xl" style={{ color: "var(--draft-ink)" }}>
            {unplacedPlayers.length === 0 ? "라인업 확인" : "선수 배치"}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--draft-ink-soft)" }}>
            {unplacedPlayers.length === 0
              ? `바꾸고 싶으면 선수끼리 끌어서 자리를 맞바꾸세요 · 포메이션: ${formation}`
              : `선수를 드래그해서 원하는 포지션에 배치하세요 · 포메이션: ${formation}`}
          </p>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
          {/* 미배치 선수 목록 */}
          <div className="w-full shrink-0 lg:w-[220px]">
            <div className="draft-card">
              <div className="px-3 py-2.5" style={{ borderBottom: "1px solid var(--draft-line)" }}>
                <h3 className="draft-title text-sm" style={{ color: "var(--draft-ink)" }}>
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
                    className="flex cursor-grab items-center gap-2 rounded-lg border px-2.5 py-2 transition-all active:cursor-grabbing"
                    style={{ borderColor: "var(--draft-line)", background: "var(--draft-neutral)" }}
                  >
                    <span
                      /* ⚠️ 종전 POSITION_COLORS 는 Tailwind 원색(bg-blue-500 = #3b82f6 등)이라
                       버건디 웜 팔레트와 정면충돌했다. 보드가 쓰는 팔레트로 통일한다. */
                      className="draft-title rounded px-1.5 py-0.5 text-[10px]"
                      style={{ background: POSITION_HEX[player.position], color: "#fff" }}
                    >
                      {player.position}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div
                        className="truncate text-sm font-medium"
                        style={{ color: "var(--draft-ink)" }}
                      >
                        {player.nameKo}
                      </div>
                      <div className="text-[10px]" style={{ color: "var(--draft-mute)" }}>
                        {player.teamKo}
                      </div>
                    </div>
                    <span
                      className="draft-num shrink-0 text-[10px]"
                      style={{ color: "var(--draft-ink-soft)" }}
                    >
                      £{player.price.toFixed(1)}
                    </span>
                  </div>
                ))}
                {unplacedPlayers.length === 0 && (
                  <p className="py-4 text-center text-xs" style={{ color: "var(--draft-mute)" }}>
                    드래프트에서 배치한 그대로예요
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* 축구장 */}
          <div className="flex-1">
            <div
              className="relative overflow-hidden rounded-2xl shadow-lg"
              style={{
                aspectRatio: "68/105",
                /* ⚠️ 보드(pitch-viz)와 **같은 잔디**를 쓴다. 종전엔 여기만 밝은 초록
                 (#1a6b30/#1e7a37)이라, 드래프트하던 잔디와 배치하는 잔디가 달라 보였다. */
                background:
                  "repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0 12.5%, rgba(0,0,0,0.06) 12.5% 25%), linear-gradient(180deg, #1f5a32 0%, #2a6a3d 50%, #1f5a32 100%)",
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
                          className="draft-title flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/80 text-[10px] text-white shadow-lg"
                          style={{ background: POSITION_HEX[player.position] }}
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
                className="draft-title rounded-xl px-10 py-3 text-sm transition-all"
                style={
                  allPlaced
                    ? {
                        background: "var(--draft-burgundy)",
                        color: "#fff",
                        boxShadow: "var(--draft-shadow-2)",
                      }
                    : {
                        background: "var(--draft-neutral)",
                        color: "var(--draft-mute)",
                        cursor: "not-allowed",
                      }
                }
              >
                {allPlaced
                  ? "배치 완료!"
                  : `선수를 모두 배치하세요 (${Object.keys(placements).length}/11)`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

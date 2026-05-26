"use client"

import { useMemo } from "react"
import type { Player, Position } from "@/lib/draft/players"
import type { Formation } from "@/lib/draft/engine"

interface SlotDef {
  code: string // "FW1", "MF2", ...
  posCode: Position
  x: number // percent
  y: number // percent
}

interface PitchVizProps {
  formation: Formation
  filled: Record<string, Player | null>
  onClickSlot?: (slotCode: string, posCode: Position) => void
  compact?: boolean
}

/**
 * 잔디 위 포메이션 시각화. 슬롯 좌표는 percent 기반.
 * 디자인 shared.jsx의 PitchViz 그대로 포팅 — 행 단위(y 고정)로 가로 분산 배치.
 */
export function PitchViz({ formation, filled, onClickSlot, compact = false }: PitchVizProps) {
  const layout = useMemo<SlotDef[]>(() => {
    const [d, m, f] = formation.split("-").map(Number)
    const rows: { code: Position; n: number; y: number }[] = [
      { code: "FW", n: f, y: 22 },
      { code: "MF", n: m, y: 48 },
      { code: "DF", n: d, y: 74 },
      { code: "GK", n: 1, y: 92 },
    ]
    const slots: SlotDef[] = []
    rows.forEach((row) => {
      for (let i = 0; i < row.n; i++) {
        const xs =
          row.n === 1 ? [50] : Array.from({ length: row.n }, (_, k) => 15 + (70 * k) / (row.n - 1))
        slots.push({
          code: `${row.code}${i + 1}`,
          posCode: row.code,
          x: xs[i],
          y: row.y,
        })
      }
    })
    return slots
  }, [formation])

  return (
    <div
      style={{
        width: "100%",
        aspectRatio: compact ? "5/4" : "4/5",
        borderRadius: 10,
        position: "relative",
        overflow: "hidden",
        background:
          "repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0 12.5%, rgba(0,0,0,0.06) 12.5% 25%), linear-gradient(180deg, #1f5a32 0%, #2a6a3d 50%, #1f5a32 100%)",
      }}
    >
      {/* outer touchline */}
      <div
        style={{
          position: "absolute",
          inset: 8,
          border: "1.5px solid rgba(255,255,255,0.7)",
          borderRadius: 2,
          pointerEvents: "none",
        }}
      />
      {/* halfway line */}
      <div
        style={{
          position: "absolute",
          left: 8,
          right: 8,
          top: "50%",
          height: 0,
          borderTop: "1.5px solid rgba(255,255,255,0.7)",
          pointerEvents: "none",
        }}
      />
      {/* center circle */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "22%",
          aspectRatio: "1",
          borderRadius: "50%",
          border: "1.5px solid rgba(255,255,255,0.7)",
          pointerEvents: "none",
        }}
      />
      {/* penalty boxes */}
      <div
        style={{
          position: "absolute",
          left: "20%",
          right: "20%",
          top: 8,
          height: "14%",
          border: "1.5px solid rgba(255,255,255,0.7)",
          borderTop: "none",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "20%",
          right: "20%",
          bottom: 8,
          height: "14%",
          border: "1.5px solid rgba(255,255,255,0.7)",
          borderBottom: "none",
          pointerEvents: "none",
        }}
      />

      {layout.map((s) => {
        const player = filled[s.code]
        const filledSize = compact ? 56 : 80
        const emptySize = compact ? 32 : 46
        return (
          <button
            key={s.code}
            type="button"
            onClick={() => onClickSlot?.(s.code, s.posCode)}
            style={{
              position: "absolute",
              left: `${s.x}%`,
              top: `${s.y}%`,
              transform: "translate(-50%, -50%)",
              width: filledSize,
              padding: 0,
              background: "transparent",
              border: "none",
              cursor: onClickSlot ? "pointer" : "default",
              textAlign: "center",
              color: "white",
              fontFamily: "var(--draft-font-title)",
            }}
            aria-label={player ? `${s.posCode} 슬롯: ${player.nameKo}` : `빈 ${s.posCode} 슬롯`}
          >
            {player ? (
              <div
                style={{
                  background: "rgba(255,255,255,0.96)",
                  borderRadius: 8,
                  padding: compact ? "4px 2px" : "6px 4px",
                  boxShadow: "0 4px 10px rgba(0,0,0,0.25)",
                  border: "2px solid var(--draft-burgundy)",
                  animation: "draft-slotbounce .35s cubic-bezier(.3,1.3,.4,1)",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--draft-font-title)",
                    fontWeight: 900,
                    fontSize: compact ? 10 : 12,
                    color: "var(--draft-ink)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {player.nameKo}
                </div>
                {!compact && (
                  <div
                    className="draft-num"
                    style={{
                      fontFamily: "var(--draft-font-title)",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--draft-burgundy)",
                      marginTop: 1,
                    }}
                  >
                    £{player.price.toFixed(1)}
                  </div>
                )}
              </div>
            ) : (
              <div
                style={{
                  width: emptySize,
                  height: emptySize,
                  margin: "0 auto",
                  borderRadius: "50%",
                  border: "2px dashed rgba(255,255,255,0.7)",
                  background: "rgba(255,255,255,0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--draft-font-title)",
                  fontWeight: 800,
                  fontSize: compact ? 10 : 12,
                  color: "rgba(255,255,255,0.9)",
                  letterSpacing: "-0.01em",
                }}
              >
                {s.posCode}
              </div>
            )}
          </button>
        )
      })}

      <style jsx>{`
        @keyframes draft-slotbounce {
          0% {
            transform: scale(0.7);
          }
          60% {
            transform: scale(1.08);
          }
          100% {
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  )
}

/**
 * 라인업 배열을 슬롯 코드별 매핑으로 변환.
 * 같은 포지션 안에서는 가격이 높은 순서대로 슬롯 1, 2, 3 ... 배치.
 */
export function rosterToSlots(
  roster: Player[],
  formation: Formation
): Record<string, Player | null> {
  const result: Record<string, Player | null> = {}
  const [d, m, f] = formation.split("-").map(Number)
  const counts: Record<Position, number> = { GK: 1, DF: d, MF: m, FW: f }

  for (const pos of ["GK", "DF", "MF", "FW"] as Position[]) {
    const players = roster.filter((p) => p.position === pos).sort((a, b) => b.price - a.price)
    for (let i = 0; i < counts[pos]; i++) {
      result[`${pos}${i + 1}`] = players[i] ?? null
    }
  }
  return result
}

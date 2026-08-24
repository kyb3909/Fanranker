"use client"

import { useMemo, useState } from "react"
import type { Player, Position } from "@/lib/draft/players"
import type { Formation } from "@/lib/draft/engine"
import { canPlay, isOutOfPosition, slotPosition } from "@/lib/draft/positions"

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
  /**
   * 도판 위에서 직접 자리를 옮기고 서로 바꾸게 한다 (2026-08-25 운영자 요청).
   * 넘기면 슬롯이 **탭으로 고르고 → 탭으로 놓는** 방식이 된다.
   *
   * ⚠️ 드래그앤드롭을 쓰지 않는다. HTML5 DnD 는 터치에서 아예 안 먹고, 포인터 드래그는
   *    페이지 스크롤과 싸운다 (같은 문제를 다른 미니게임에서 실측했다 — 모바일 감사).
   *    탭 2회는 마우스와 터치가 완전히 같은 코드로 동작하고 스크롤을 건드리지 않는다.
   */
  onArrange?: (next: Record<string, Player | null>) => void
}

/**
 * 잔디 위 포메이션 시각화. 슬롯 좌표는 percent 기반.
 * 디자인 shared.jsx의 PitchViz 그대로 포팅 — 행 단위(y 고정)로 가로 분산 배치.
 */
export function PitchViz({
  formation,
  filled,
  onClickSlot,
  compact = false,
  onArrange,
}: PitchVizProps) {
  /**
   * 고른 선수의 **id**. 슬롯 코드로 잡으면 안 된다 — 드래프트 중에는 픽이 들어올 때마다
   * 슬롯 배정이 다시 계산되므로, 내가 고른 뒤 AI 가 한 명 뽑으면 그 코드가 다른 선수를
   * 가리키게 된다 (2026-08-25 실측: 빈 자리 이동은 되는데 맞바꾸기만 실패했다).
   * 선수 id 로 잡으면 배정이 바뀌어도 선택이 따라간다.
   */
  const [pickedId, setPickedId] = useState<string | null>(null)
  const picked = pickedId
    ? (Object.keys(filled).find((c) => filled[c]?.id === pickedId) ?? null)
    : null

  /**
   * 탭 한 번 = 고르기, 두 번째 탭 = 이동 또는 맞바꾸기.
   * 자격(canPlay)을 어기는 조합은 아무 일도 일어나지 않는다 — 그런 자리는 애초에
   * 놓을 수 있는 자리로 표시되지 않는다.
   */
  const tapSlot = (code: string) => {
    if (!onArrange) return
    if (picked === null) {
      const p = filled[code]
      if (p) setPickedId(p.id) // 빈 자리부터 고를 이유는 없다
      return
    }
    if (picked === code) {
      setPickedId(null)
      return
    }
    const from = filled[picked]
    const to = filled[code]
    const fromSlotPos = slotPosition(code)
    const toSlotPos = slotPosition(picked)
    // 옮겨 갈 자리에 설 수 있어야 하고, 맞바꾸는 경우 상대도 내 자리에 설 수 있어야 한다
    if (from && !canPlay(from.position, fromSlotPos)) return
    if (to && !canPlay(to.position, toSlotPos)) return
    onArrange({ ...filled, [code]: from ?? null, [picked]: to ?? null })
    setPickedId(null)
  }
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
        borderRadius: 12,
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
        const isPicked = picked === s.code
        // 고른 선수가 이 자리에 설 수 있는가 (맞바꾸는 경우 상대도 내 자리에 설 수 있어야)
        const pickedPlayer = picked ? filled[picked] : null
        const droppable =
          !!onArrange &&
          !!pickedPlayer &&
          !isPicked &&
          canPlay(pickedPlayer.position, s.posCode) &&
          (!player || canPlay(player.position, slotPosition(picked as string)))
        const offPos = !!player && isOutOfPosition(player.position, s.posCode)
        return (
          <button
            key={s.code}
            type="button"
            onClick={() => (onArrange ? tapSlot(s.code) : onClickSlot?.(s.code, s.posCode))}
            style={{
              position: "absolute",
              left: `${s.x}%`,
              top: `${s.y}%`,
              transform: `translate(-50%, -50%)${isPicked ? " scale(1.12)" : ""}`,
              width: filledSize,
              // 터치 목표를 44px 이상으로 (모바일 감사 권고) — 빈 자리도 손가락에 잡히게
              minHeight: 44,
              padding: 0,
              background: "transparent",
              border: "none",
              cursor: onArrange || onClickSlot ? "pointer" : "default",
              textAlign: "center",
              color: "white",
              fontFamily: "var(--draft-font-title)",
              // 터치에서 길게 눌러도 선택·확대 메뉴가 안 뜨게
              WebkitTapHighlightColor: "transparent",
              touchAction: "manipulation",
              transition: "transform .15s ease",
              zIndex: isPicked ? 3 : droppable ? 2 : 1,
            }}
            aria-label={
              player
                ? `${s.posCode} 자리: ${player.nameKo}${isPicked ? " (선택됨)" : ""}${
                    droppable ? " — 여기와 맞바꿀 수 있음" : ""
                  }`
                : `빈 ${s.posCode} 자리${droppable ? " — 여기로 옮길 수 있음" : ""}`
            }
            aria-pressed={onArrange ? isPicked : undefined}
          >
            {/* 놓을 수 있는 자리 표시 — 고른 뒤에만 뜬다 */}
            {droppable && (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  transform: "translate(-50%,-50%)",
                  width: filledSize + 10,
                  height: filledSize + 10,
                  borderRadius: 12,
                  border: "2px solid #ffd54a",
                  background: "rgba(255,213,74,0.16)",
                  pointerEvents: "none",
                }}
              />
            )}
            {player ? (
              <div
                style={{
                  position: "relative",
                  background: "rgba(255,255,255,0.96)",
                  borderRadius: 8,
                  padding: compact ? "4px 2px" : "6px 4px",
                  boxShadow: isPicked
                    ? "0 0 0 3px #ffd54a, 0 6px 16px rgba(0,0,0,0.35)"
                    : "0 4px 10px rgba(0,0,0,0.25)",
                  border: `2px solid ${offPos ? "#c98a12" : "var(--draft-burgundy)"}`,
                  animation: "draft-slotbounce .35s cubic-bezier(.3,1.3,.4,1)",
                }}
              >
                {/* 제 포지션이 아닌 자리에 선 선수 — 등록 포지션을 작게 알려 준다 */}
                {offPos && (
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      top: -7,
                      right: -5,
                      background: "#c98a12",
                      color: "#fff",
                      fontSize: 8,
                      fontWeight: 900,
                      lineHeight: 1,
                      padding: "2px 4px",
                      borderRadius: 4,
                    }}
                  >
                    {player.position}
                  </span>
                )}
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
/** 포메이션의 슬롯 코드 목록 (도판 레이아웃과 같은 순서) */
export function slotCodes(formation: Formation): string[] {
  const [d, m, f] = formation.split("-").map(Number)
  const counts: [Position, number][] = [
    ["GK", 1],
    ["DF", d],
    ["MF", m],
    ["FW", f],
  ]
  return counts.flatMap(([pos, n]) => Array.from({ length: n }, (_, i) => `${pos}${i + 1}`))
}

/**
 * 손으로 옮긴 배치를 유지한 채, 새로 뽑힌 선수를 빈 자리에 넣는다.
 *
 * 드래프트는 픽이 하나씩 늘어나므로 매번 `rosterToSlots` 로 다시 계산하면 유저가 옮겨
 * 놓은 자리가 픽 한 번에 전부 날아간다. 그래서 이미 놓인 선수는 그대로 두고,
 * 아직 자리 없는 선수만 **설 수 있는 빈 자리**에 채운다 (자격은 canPlay 가 정한다).
 */
export function mergeRosterIntoSlots(
  arranged: Record<string, Player | null>,
  roster: Player[],
  formation: Formation
): Record<string, Player | null> {
  const codes = slotCodes(formation)
  const inRoster = new Set(roster.map((p) => p.id))
  const next: Record<string, Player | null> = {}
  const placed = new Set<string>()

  for (const code of codes) {
    const p = arranged[code]
    // 포메이션이 바뀌어 사라진 자리, 이미 팀에 없는 선수, 중복은 버린다
    if (p && inRoster.has(p.id) && !placed.has(p.id)) {
      next[code] = p
      placed.add(p.id)
    } else {
      next[code] = null
    }
  }

  const unplaced = roster.filter((p) => !placed.has(p.id))
  for (const p of unplaced) {
    let target = codes.find((c) => next[c] === null && canPlay(p.position, slotPosition(c)))
    // 설 수 있는 자리가 없으면 아무 빈 자리에라도 (도판에서 손으로 고치게)
    if (!target) target = codes.find((c) => next[c] === null)
    if (target) {
      next[target] = p
      placed.add(p.id)
    }
  }
  return next
}

/**
 * 로스터를 자리에 앉힌다 (배치 이력 없이 처음부터).
 *
 * ⚠️ 종전엔 `p.position === pos` 정확 매칭이었다. 자격이 유연해진 뒤로는 그러면
 * 4-4-2 에 수비수 5명을 뽑은 팀에서 한 명이 배치되지 않고 MF 자리가 빈 채로 남는다.
 * 자격 기준(mergeRosterIntoSlots)으로 통일해 결과 화면도 같은 규칙으로 그린다.
 * 비싼 선수부터 좋은 자리를 잡도록 정렬해서 넘긴다.
 */
export function rosterToSlots(
  roster: Player[],
  formation: Formation
): Record<string, Player | null> {
  const byPrice = [...roster].sort((a, b) => b.price - a.price)
  return mergeRosterIntoSlots({}, byPrice, formation)
}

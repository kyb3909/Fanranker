"use client"

import dynamic from "next/dynamic"
import { useEffect, useMemo, useRef, useState } from "react"
import { trackEvent } from "@/lib/analytics/events"
import { cellHeight, computeTransform, project } from "@/lib/stadium/map-projection"
import { findMapTeam, MAP_TEAM_BOUNDS, type StadiumMapRow } from "@/lib/stadium/map-teams"
import { PIN_HEIGHT } from "@/lib/stadium/voxel-draw"
import { layoutLabels, leaderPoint, type LabelSeed, type Rect } from "@/lib/stadium/label-layout"
import { StadiumTeamModal } from "./stadium-team-modal"

const VoxelMapCanvas = dynamic(() => import("./voxel-map-canvas").then((m) => m.VoxelMapCanvas), {
  ssr: false,
})

interface Props {
  rows: StadiumMapRow[]
  /** 로그인 유저의 응원 팀 (플레어 기준) — 격차 배지를 누구 기준으로 띄울지 정한다 */
  myTeamId: string | null
  /** 내가 지금 살 수 있는 벽돌 수 */
  myBrickBudget: number | null
}

type GapTone = "behind" | "ahead" | "lead" | "done"

interface GapInfo {
  text: string
  tone: GapTone
}

/** 한글 조사 — 받침이 있으면 "과", 없으면 "와" */
function gwa(name: string): string {
  const last = name.charCodeAt(name.length - 1)
  if (last < 0xac00 || last > 0xd7a3) return `${name}와`
  return (last - 0xac00) % 28 === 0 ? `${name}와` : `${name}과`
}

/** 격차 카피 — 데이터 4상태 분기 (앞섬/뒤짐/1위/완공) */
function gapInfo(row: StadiumMapRow, rows: StadiumMapRow[]): GapInfo | null {
  if (row.level >= 10) return { text: "완공 — 입장 가능", tone: "done" }
  const team = findMapTeam(row.teamId)
  if (!team) return null

  let other: StadiumMapRow | undefined
  if (team.derby) other = rows.find((r) => r.teamId === team.derby)
  if (!other) {
    // 더비 상대가 없으면 순위가 붙어 있는 팀과 견준다
    const sorted = [...rows].sort((a, b) => b.bricks - a.bricks)
    const i = sorted.findIndex((r) => r.teamId === row.teamId)
    other = i > 0 ? sorted[i - 1] : sorted[1]
  }
  if (!other || other.teamId === row.teamId) return { text: "건설 1위", tone: "lead" }

  const otherName = findMapTeam(other.teamId)?.name ?? "상대"
  const gap = Math.abs(row.bricks - other.bricks)
  const todayDelta = row.todayBricks - other.todayBricks

  if (row.bricks > other.bricks) {
    const tail = todayDelta < 0 ? ` — 오늘 ${Math.abs(todayDelta)}장 쫓김` : ""
    return { text: `${otherName}보다 ${gap.toLocaleString()}장 앞${tail}`, tone: "ahead" }
  }
  if (gap === 0) return { text: `${gwa(otherName)} 동률`, tone: "behind" }
  const tail =
    todayDelta > 0
      ? ` · 오늘 ${todayDelta}장 따라잡음`
      : todayDelta < 0
        ? ` — 오늘 ${Math.abs(todayDelta)}장 뒤짐`
        : ""
  return { text: `${gwa(otherName)} ${gap.toLocaleString()}장 차${tail}`, tone: "behind" }
}

export function StadiumMap({ rows, myTeamId, myBrickBudget }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect
      setSize({ w: Math.round(r.width), h: Math.round(r.height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    trackEvent({ name: "stadium_map_view", params: { team_count: rows.length } })
  }, [rows.length])

  const narrow = size.w > 0 && size.w < 640

  const transform = useMemo(
    () =>
      computeTransform(size.w || 1, size.h || 1, {
        padX: narrow ? 10 : 44,
        padTop: narrow ? 78 : 92,
        padBottom: narrow ? 64 : 64,
        // 좁은 화면은 섬 전체 대신 구장 쪽으로 당긴다 — 안 그러면 구장이 점이 된다
        focus: narrow
          ? {
              minX: MAP_TEAM_BOUNDS.minX - 12,
              maxX: MAP_TEAM_BOUNDS.maxX + 12,
              minY: MAP_TEAM_BOUNDS.minY - 16,
              maxY: MAP_TEAM_BOUNDS.maxY + 16,
            }
          : undefined,
      }),
    [size.w, size.h, narrow]
  )

  /** 격차 배지를 붙일 팀 — 내 팀, 없으면 가장 접전인 더비 */
  const focusId = useMemo(() => {
    if (myTeamId && rows.some((r) => r.teamId === myTeamId)) return myTeamId
    let best: { id: string; gap: number } | null = null
    for (const r of rows) {
      const derby = findMapTeam(r.teamId)?.derby
      if (!derby) continue
      const other = rows.find((x) => x.teamId === derby)
      if (!other) continue
      const gap = Math.abs(r.bricks - other.bricks)
      if (r.bricks < other.bricks && (!best || gap < best.gap)) best = { id: r.teamId, gap }
    }
    return best?.id ?? rows[0]?.teamId ?? null
  }, [rows, myTeamId])

  const teamStates = useMemo(
    () =>
      rows
        .map((r) => {
          const team = findMapTeam(r.teamId)
          return team ? { team, level: r.level, pct: r.pct } : null
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    [rows]
  )

  const chipW = narrow ? 104 : 152

  const layout = useMemo(() => {
    if (!size.w || !size.h) {
      return { rects: new Map<string, Rect>(), seeds: [] as LabelSeed[] }
    }
    const seeds: LabelSeed[] = []
    const obstacles: Rect[] = []

    // 구장 위치를 먼저 잡고, 그 무리의 무게중심에서 **바깥으로** 라벨을 뻗는다.
    // 고정 오프셋을 쓰면 서북/동남 두 무리가 가운데서 만나 구장을 통째로 덮는다.
    const anchored = rows
      .map((r) => {
        const team = findMapTeam(r.teamId)
        if (!team) return null
        const ground = cellHeight(team.gx, team.gy)
        const base = project(transform, team.gx, team.gy, ground)
        // 앵커는 핀 꼭대기 — 리더선이 핀 머리에 닿는다
        return { r, team, base, anchor: { x: base.x, y: base.y - PIN_HEIGHT } }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    const cx = anchored.reduce((s, a) => s + a.anchor.x, 0) / Math.max(1, anchored.length)
    const cy = anchored.reduce((s, a) => s + a.anchor.y, 0) / Math.max(1, anchored.length)
    const reach = Math.max(120, Math.min(230, size.w * 0.16))

    for (const a of anchored) {
      // 핀이 가려지지 않도록 핀 상자를 장애물로 둔다
      obstacles.push({
        x: a.base.x - 16,
        y: a.anchor.y - 6,
        w: 32,
        h: PIN_HEIGHT + 12,
      })

      let dx = a.anchor.x - cx
      let dy = a.anchor.y - cy
      const len = Math.hypot(dx, dy)
      if (len < 1) {
        dx = a.team.labelDx
        dy = a.team.labelDy
      } else {
        dx /= len
        dy /= len
      }
      // 라벨은 살짝 위쪽을 선호한다 — 구장 실루엣을 덜 가린다
      const ny = dy - 0.45
      const nlen = Math.hypot(dx, ny) || 1

      const hasGap = !narrow && a.r.teamId === focusId
      const h =
        (narrow ? 32 : 50) + (a.r.todayBricks > 0 ? (narrow ? 22 : 26) : 0) + (hasGap ? 30 : 0)
      seeds.push({
        id: a.r.teamId,
        anchor: a.anchor,
        x: a.anchor.x + (dx / nlen) * reach - chipW / 2,
        y: a.anchor.y + (ny / nlen) * reach - h / 2,
        w: chipW,
        h,
      })
    }

    const rects = layoutLabels(seeds, {
      width: size.w,
      height: size.h,
      pad: narrow ? 8 : 14,
      gap: 16,
      obstacles,
    })
    return { rects, seeds }
  }, [rows, transform, size.w, size.h, narrow, chipW, focusId])

  const focusRow = focusId ? (rows.find((r) => r.teamId === focusId) ?? null) : null
  const focusGap = focusRow ? gapInfo(focusRow, rows) : null

  const openTeam = (teamId: string) => {
    setSelected(teamId)
    trackEvent({ name: "marker_open", params: { team_id: teamId } })
  }

  const selectedRow = selected ? (rows.find((r) => r.teamId === selected) ?? null) : null

  return (
    <div
      ref={wrapRef}
      className="stadium-map-scope relative w-full overflow-hidden"
      style={{
        background: "var(--st-void)",
        height: "calc(100svh - 8.5rem)",
        minHeight: 380,
      }}
    >
      {size.w > 0 && (
        <VoxelMapCanvas
          teams={teamStates}
          transform={transform}
          width={size.w}
          height={size.h}
          selectedId={selected}
          onSelect={openTeam}
        />
      )}

      {/* 리더 라인 — 칩이 구장에서 떨어져 앉을 때 어느 구장 것인지 잇는다 */}
      <svg
        className="pointer-events-none absolute inset-0"
        width={size.w}
        height={size.h}
        aria-hidden="true"
      >
        {layout.seeds.map((seed) => {
          const rect = layout.rects.get(seed.id)
          if (!rect) return null
          const p = leaderPoint(rect, seed.anchor)
          return (
            <line
              key={seed.id}
              x1={p.x}
              y1={p.y}
              x2={seed.anchor.x}
              y2={seed.anchor.y}
              stroke="var(--st-lead)"
              strokeWidth={1.5}
            />
          )
        })}
      </svg>

      <div className="stadium-legend">
        <p className="stadium-legend__title">활동 100p = 벽돌 1장 — 벽돌로 우리 팀 구장을 올린다</p>
        <p className="stadium-legend__keys">
          <span>
            <i className="stadium-legend__dot" style={{ background: "var(--st-today)" }} />
            +N = 오늘 쌓인 벽돌
          </span>
          <span>
            <i className="stadium-legend__dot" style={{ background: "var(--st-gold)" }} />
            금테 = 완공
          </span>
          {myBrickBudget !== null && (
            <span style={{ color: "var(--st-ink)" }}>
              내가 지금 쌓을 수 있는 벽돌 {myBrickBudget.toLocaleString()}장
            </span>
          )}
        </p>
      </div>

      {rows.map((r) => {
        const team = findMapTeam(r.teamId)
        const rect = layout.rects.get(r.teamId)
        if (!team || !rect) return null
        // 좁은 화면에서는 하단 고정 바가 격차를 맡는다 — 칩 안에 또 넣지 않는다
        const gap = !narrow && r.teamId === focusId ? gapInfo(r, rows) : null
        const ink = team.darkInk ? "var(--st-ink-dark)" : "var(--st-ink)"
        return (
          <button
            key={r.teamId}
            type="button"
            className="stadium-label"
            data-selected={selected === r.teamId}
            style={{ left: rect.x, top: rect.y, width: rect.w }}
            onClick={() => openTeam(r.teamId)}
          >
            {r.todayBricks > 0 && (
              <span className="stadium-label__today">+{r.todayBricks.toLocaleString()} 오늘</span>
            )}
            <span
              className="stadium-label__chip"
              data-dark={team.darkInk}
              style={{ background: team.color, color: ink }}
            >
              <span className="stadium-label__row">
                <span className="stadium-label__name">{team.name}</span>
                <span className="stadium-label__lv">
                  {r.level >= 10
                    ? "완공"
                    : narrow
                      ? `${Math.round(r.pct * 100)}%`
                      : `LV.${r.level}`}
                </span>
              </span>
              {narrow ? null : r.level >= 10 ? (
                <span className="stadium-label__done">완공 — 입장 가능</span>
              ) : (
                <span className="stadium-label__bar">
                  <span className="stadium-label__track">
                    <span
                      className="stadium-label__fill"
                      style={{ width: `${Math.max(3, Math.round(r.pct * 100))}%` }}
                    />
                  </span>
                  <span className="stadium-label__pct">{Math.round(r.pct * 100)}%</span>
                </span>
              )}
            </span>
            {gap && gap.tone !== "done" && (
              <span className="stadium-label__gap" data-tone={gap.tone}>
                {gap.text}
              </span>
            )}
          </button>
        )
      })}

      {narrow && focusRow && focusGap && focusGap.tone !== "done" && (
        <button
          type="button"
          className="absolute inset-x-3 bottom-3 z-10 rounded-xl px-4 py-3 text-left"
          style={{
            background: "var(--st-panel)",
            border: `2px solid var(--st-${focusGap.tone === "ahead" ? "ahead" : focusGap.tone === "lead" ? "gold" : "behind"})`,
            color: "var(--st-ink)",
          }}
          onClick={() => openTeam(focusRow.teamId)}
        >
          <span className="block text-[13px] font-extrabold">{focusGap.text}</span>
          <span className="block text-[12px]" style={{ color: "var(--st-ink-mute)" }}>
            {findMapTeam(focusRow.teamId)?.name} · 눌러서 벽돌 쌓기
          </span>
        </button>
      )}

      <StadiumTeamModal
        row={selectedRow}
        gap={selectedRow ? gapInfo(selectedRow, rows) : null}
        myBrickBudget={myBrickBudget}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}

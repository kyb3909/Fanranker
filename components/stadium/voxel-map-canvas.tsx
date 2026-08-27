"use client"

import { useCallback, useEffect, useRef } from "react"
import type { MapTeam } from "@/lib/stadium/map-teams"
import { cellHeight, project, type MapTransform } from "@/lib/stadium/map-projection"
import {
  drawDerbyLine,
  drawFocusRing,
  drawProgressRing,
  drawStadium,
  drawTerrain,
  stadiumScale,
} from "@/lib/stadium/voxel-draw"

export interface MapTeamState {
  team: MapTeam
  level: number
  /** 다음 레벨까지 0~1 */
  pct: number
}

interface Props {
  teams: MapTeamState[]
  transform: MapTransform
  width: number
  height: number
  selectedId: string | null
  onSelect: (teamId: string) => void
}

/** 마커 히트 반경 — 손가락 기준 하한을 지킨다 */
const MIN_HIT_PX = 26

/**
 * 지도 캔버스.
 *
 * 지형은 변환이 바뀔 때만 오프스크린에 다시 굽고, 그 위에 구장만 얹는다.
 * requestAnimationFrame 루프가 없다 — 화면이 바뀌는 건 선택·리사이즈 때뿐이다.
 */
export function VoxelMapCanvas({ teams, transform, width, height, selectedId, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const terrainRef = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null)

  const groundOf = useCallback((t: MapTeam) => cellHeight(t.gx, t.gy), [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width <= 0 || height <= 0) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // ── 지형 (변환이 같으면 다시 굽지 않는다) ──
    const key = `${transform.s.toFixed(3)}|${transform.ox.toFixed(1)}|${transform.oy.toFixed(1)}|${width}x${height}|${dpr}`
    if (terrainRef.current?.key !== key) {
      const off = document.createElement("canvas")
      off.width = canvas.width
      off.height = canvas.height
      const octx = off.getContext("2d")
      if (octx) {
        octx.setTransform(dpr, 0, 0, dpr, 0, 0)
        drawTerrain(octx, transform)
        terrainRef.current = { key, canvas: off }
      }
    }
    const cached = terrainRef.current
    if (cached) {
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.drawImage(cached.canvas, 0, 0)
      ctx.restore()
    }

    // ── 더비 점선 (구장보다 아래) ──
    const byId = new Map(teams.map((t) => [t.team.teamId, t]))
    const drawn = new Set<string>()
    for (const s of teams) {
      const derbyId = s.team.derby
      if (!derbyId) continue
      const other = byId.get(derbyId)
      if (!other) continue
      const pairKey = [s.team.teamId, derbyId].sort().join("|")
      if (drawn.has(pairKey)) continue
      drawn.add(pairKey)
      drawDerbyLine(
        ctx,
        transform,
        { gx: s.team.gx, gy: s.team.gy, ground: groundOf(s.team) },
        { gx: other.team.gx, gy: other.team.gy, ground: groundOf(other.team) }
      )
    }

    // ── 구장 (뒤에서 앞으로) ──
    const ordered = [...teams].sort((a, b) => a.team.gy - b.team.gy)
    for (const s of ordered) {
      const ground = groundOf(s.team)
      drawProgressRing(ctx, transform, s.team.gx, s.team.gy, ground, s.level, s.pct, s.team.color)
      if (selectedId === s.team.teamId) {
        drawFocusRing(ctx, transform, s.team.gx, s.team.gy, ground, s.level)
      }
      drawStadium(ctx, transform, s.team.gx, s.team.gy, ground, s.level, s.team.color)
    }
  }, [teams, transform, width, height, selectedId, groundOf])

  const hitTest = useCallback(
    (clientX: number, clientY: number): string | null => {
      const canvas = canvasRef.current
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      const px = clientX - rect.left
      const py = clientY - rect.top
      let best: { id: string; d: number } | null = null
      for (const s of teams) {
        const ground = groundOf(s.team)
        const c = project(transform, s.team.gx, s.team.gy, ground + 0.6)
        const dx = px - c.x
        const dy = py - c.y
        const d = Math.hypot(dx, dy)
        const radius = Math.max(MIN_HIT_PX, stadiumScale(s.level) * 3 * transform.s)
        if (d <= radius && (!best || d < best.d)) best = { id: s.team.teamId, d }
      }
      return best?.id ?? null
    },
    [teams, transform, groundOf]
  )

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, display: "block", touchAction: "manipulation" }}
      aria-hidden="true"
      onPointerMove={(e) => {
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.style.cursor = hitTest(e.clientX, e.clientY) ? "pointer" : "default"
      }}
      onClick={(e) => {
        const id = hitTest(e.clientX, e.clientY)
        if (id) onSelect(id)
      }}
    />
  )
}

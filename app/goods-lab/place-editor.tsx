"use client"

import { useRef, useState } from "react"
import { Mockup } from "./shared"
import { type DemoItem, type GalleryPiece, type Placement } from "./fixtures"

/**
 * 제품 캔버스 — 마플 · 레드버블 에디터의 왼쪽 절반에 해당한다.
 *
 * ⚠️ 실측(2026-09-05, 뷰포트 1440):
 *      마플   `.canvas_zoom_wrapper` **740 × 740**, `#maker_frame` 1345 (뷰포트의 93%)
 *      레드버블 프리뷰 **685 × 911**, 우측 패널 ~575
 *    둘 다 캔버스가 뷰포트의 절반쯤이다. 우리가 처음에 이걸 다이얼로그(672px) 안에 넣었더니
 *    캔버스가 370px 로 쭈그러들었다 — 그래서 전용 라우트(`/goods-lab/design/[pieceId]`)로 뺐다.
 *
 * 이 파일은 **캔버스와 손잡이만** 책임진다. 품목 스트립 · 옵션 패널은 그 라우트가 조립한다.
 */
export const CANVAS_MAX = 620

/* ─────────────────── 무대 (직접 조작) ─────────────────── */

type Mode = "move" | "scale" | "rotate"

/**
 * 포인터 하나로 이동 · 확대 · 회전을 모두 받는다.
 *
 * 이동량은 **인쇄 영역 폭 대비 %** 로 환산한다 — 목업 크기가 화면마다 달라도(스트립 56px,
 * 무대 가변, 승인 카드 168px) 같은 값이 같은 배치를 뜻해야 하기 때문이다.
 * 확대 · 회전은 인쇄 영역 중심 기준의 거리 · 각도로 계산한다.
 */
export function Stage({
  piece,
  item,
  placement,
  onSet,
}: {
  piece: GalleryPiece
  item: DemoItem
  placement: Placement
  onSet: (p: Partial<Placement>) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{
    mode: Mode
    px: number
    py: number
    x: number
    y: number
    scale: number
    rot: number
    dist: number
    ang: number
  } | null>(null)
  const [mode, setMode] = useState<Mode | null>(null)
  const [snapX, setSnapX] = useState(false)
  const [snapY, setSnapY] = useState(false)

  const area = item.print
  const areaW = area?.w ?? 100

  /** 인쇄 영역 중심의 화면 좌표 */
  const centre = () => {
    const box = boxRef.current
    if (!box || !area) return null
    const r = box.getBoundingClientRect()
    return {
      cx: r.left + (r.width * (area.x + area.w / 2)) / 100,
      cy: r.top + (r.height * (area.y + area.h / 2)) / 100,
      areaPx: (r.width * areaW) / 100,
    }
  }

  const start = (m: Mode) => (e: React.PointerEvent) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const c = centre()
    drag.current = {
      mode: m,
      px: e.clientX,
      py: e.clientY,
      x: placement.x,
      y: placement.y,
      scale: placement.scale,
      rot: placement.rot,
      dist: c ? Math.hypot(e.clientX - c.cx, e.clientY - c.cy) : 1,
      ang: c ? (Math.atan2(e.clientY - c.cy, e.clientX - c.cx) * 180) / Math.PI : 0,
    }
    setMode(m)
  }

  const move = (e: React.PointerEvent) => {
    const d = drag.current
    const c = centre()
    if (!d || !c) return

    if (d.mode === "move") {
      if (c.areaPx <= 0) return
      let nx = d.x + ((e.clientX - d.px) / c.areaPx) * 100
      let ny = d.y + ((e.clientY - d.py) / c.areaPx) * 100
      // 스냅 — 가운데 ±2% 안이면 붙는다. 마플·피그마가 다 이렇게 한다
      const sx = Math.abs(nx) < 2
      const sy = Math.abs(ny) < 2
      if (sx) nx = 0
      if (sy) ny = 0
      setSnapX(sx)
      setSnapY(sy)
      const clamp = (v: number) => Math.max(-60, Math.min(60, v))
      onSet({ x: Math.round(clamp(nx)), y: Math.round(clamp(ny)) })
      return
    }

    if (d.mode === "scale") {
      const now = Math.hypot(e.clientX - c.cx, e.clientY - c.cy)
      const next = (d.scale * now) / Math.max(1, d.dist)
      onSet({ scale: round2(Math.max(0.4, Math.min(2, next))) })
      return
    }

    const now = (Math.atan2(e.clientY - c.cy, e.clientX - c.cx) * 180) / Math.PI
    let rot = d.rot + (now - d.ang)
    if (Math.abs(rot) < 3) rot = 0 // 각도도 0° 에 붙여준다
    onSet({ rot: Math.round(Math.max(-45, Math.min(45, rot))) })
  }

  const end = () => {
    drag.current = null
    setMode(null)
    setSnapX(false)
    setSnapY(false)
  }

  return (
    <div
      ref={boxRef}
      onPointerDown={start("move")}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      className="relative touch-none select-none"
      style={{ cursor: mode === "move" ? "grabbing" : "grab" }}
      role="application"
      aria-label={`${item.name} 배치 조정`}
    >
      <Mockup piece={piece} item={item} placement={placement} showArea caption={false} />

      {area && (
        <>
          {/* 스냅 가이드 */}
          {snapX && <Guide vertical area={area} />}
          {snapY && <Guide area={area} />}

          {/* 그림에 붙는 손잡이 — 마플 에디터의 그 손잡이 */}
          <Handle
            area={area}
            at="rotate"
            onPointerDown={start("rotate")}
            label="회전"
            active={mode === "rotate"}
          />
          <Handle
            area={area}
            at="scale"
            onPointerDown={start("scale")}
            label="크기"
            active={mode === "scale"}
          />
        </>
      )}
    </div>
  )
}

function Guide({ vertical, area }: { vertical?: boolean; area: NonNullable<DemoItem["print"]> }) {
  const cx = area.x + area.w / 2
  const cy = area.y + area.h / 2
  return (
    <span
      className="pointer-events-none absolute"
      style={
        vertical
          ? {
              left: `${cx}%`,
              top: `${area.y}%`,
              height: `${area.h}%`,
              borderLeft: "1px solid var(--wc-go)",
            }
          : {
              top: `${cy}%`,
              left: `${area.x}%`,
              width: `${area.w}%`,
              borderTop: "1px solid var(--wc-go)",
            }
      }
      aria-hidden
    />
  )
}

function Handle({
  area,
  at,
  onPointerDown,
  label,
  active,
}: {
  area: NonNullable<DemoItem["print"]>
  at: "rotate" | "scale"
  onPointerDown: (e: React.PointerEvent) => void
  label: string
  active: boolean
}) {
  const pos =
    at === "rotate"
      ? { left: `${area.x + area.w / 2}%`, top: `${area.y}%` }
      : { left: `${area.x + area.w}%`, top: `${area.y + area.h}%` }

  return (
    <button
      onPointerDown={onPointerDown}
      aria-label={label}
      className="absolute grid h-6 w-6 place-items-center rounded-full text-xs font-bold"
      style={{
        ...pos,
        transform: "translate(-50%, -50%)",
        background: active ? "var(--wc-burgundy)" : "var(--wc-paper)",
        color: active ? "var(--wc-paper)" : "var(--wc-burgundy)",
        border: "1px solid var(--wc-burgundy)",
        boxShadow: "var(--wc-shadow-1)",
        cursor: at === "rotate" ? "grab" : "nwse-resize",
        touchAction: "none",
      }}
    >
      {at === "rotate" ? "↻" : "⤡"}
    </button>
  )
}

/* ─────────────────── 조각 ─────────────────── */

export function round2(v: number): number {
  return Math.round(v * 100) / 100
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <label className="mb-2 block">
      <span className="flex items-baseline justify-between text-xs">
        <span className="font-semibold">{label}</span>
        <span style={{ color: "var(--wc-mute)" }}>{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full"
        style={{ accentColor: "var(--wc-burgundy)" }}
      />
    </label>
  )
}

export function MiniBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded px-2 py-1 text-xs font-semibold"
      style={{
        background: "var(--wc-paper)",
        color: "var(--wc-ink-2)",
        border: "1px solid var(--wc-line)",
      }}
    >
      {children}
    </button>
  )
}

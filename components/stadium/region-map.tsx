"use client"

import { useRef, useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { StadiumInfoCard } from "./stadium-info-card"
import type { MapPin } from "@/types/stadium"
import { easeOutCubic, clamp, hexToRgba } from "@/lib/stadium/map-utils"

// ─── Types ───────────────────────────────────────────────
interface RegionMapProps {
  regionName: string
  league: string
  mapImage: string
  pins: MapPin[]
  onBack?: () => void
  onInvest?: (pin: MapPin) => void
}

// ─── Constants ───────────────────────────────────────────
const PIN_RADIUS = 7
const PIN_BORDER = 2.5
const AURA_DURATION = 2000
const FLOAT_AMPLITUDE = 3
const FLOAT_PERIOD = 2000
const PIN_ENTER_START = 800
const PIN_ENTER_DELAY = 120
const PIN_ENTER_DURATION = 350
const MIN_DRAG_DISTANCE = 5
const ZOOM_SENSITIVITY = 0.001
const MIN_ZOOM_FACTOR = 1.0
const MAX_ZOOM_FACTOR = 3.0

// ─── Canvas Helpers ──────────────────────────────────────
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

// ─── Cloud Generator ─────────────────────────────────────
function createCloudTexture(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  const ctx = c.getContext("2d")!

  // Seed random blobs as soft clouds
  const blobs = Array.from({ length: 18 }, () => ({
    x: Math.random() * w,
    y: Math.random() * h * 0.7,
    rx: 40 + Math.random() * 80,
    ry: 20 + Math.random() * 35,
    alpha: 0.03 + Math.random() * 0.06,
  }))

  for (const b of blobs) {
    const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.rx)
    grad.addColorStop(0, `rgba(255,255,255,${b.alpha})`)
    grad.addColorStop(0.6, `rgba(255,255,255,${b.alpha * 0.4})`)
    grad.addColorStop(1, "rgba(255,255,255,0)")
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.ellipse(b.x, b.y, b.rx, b.ry, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  return c
}

// ─── Component ───────────────────────────────────────────
export function RegionMap({
  regionName,
  league,
  mapImage,
  pins,
  onBack,
  onInvest,
}: RegionMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const cloudRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef(0)

  // Camera (refs for perf — no re-renders)
  const camRef = useRef({ x: 0, y: 0, zoom: 1 })
  const baseZoomRef = useRef(1)
  const sizeRef = useRef({ w: 0, h: 0 })

  // Pointer
  const ptrRef = useRef({
    down: false,
    sx: 0,
    sy: 0,
    lx: 0,
    ly: 0,
    dist: 0,
  })

  // Pinch zoom
  const pinchRef = useRef({ active: false, startDist: 0, startZoom: 1 })

  // Animation
  const startTimeRef = useRef(0)
  const hoveredRef = useRef<string | null>(null)
  const hoverProgressRef = useRef<Record<string, number>>({})
  const pinImagesRef = useRef<Record<string, HTMLImageElement>>({})

  // React state
  const [selected, setSelected] = useState<MapPin | null>(null)
  const [cardPos, setCardPos] = useState({ x: 0, y: 0 })
  const [titlePhase, setTitlePhase] = useState<"in" | "out" | "gone">("in")
  const [loaded, setLoaded] = useState(false)

  const router = useRouter()

  // ─── Camera Init ─────────────────────────────
  const initCamera = useCallback(() => {
    const img = imgRef.current
    const { w, h } = sizeRef.current
    if (!img || !w || !h) return

    // Contain: fit entire image in viewport
    const baseZoom = Math.min(w / img.naturalWidth, h / img.naturalHeight)
    baseZoomRef.current = baseZoom

    const cam = camRef.current
    cam.zoom = baseZoom
    cam.x = (w - img.naturalWidth * baseZoom) / 2
    cam.y = (h - img.naturalHeight * baseZoom) / 2
  }, [])

  // ─── Clamp Camera ────────────────────────────
  const clampCamera = useCallback(() => {
    const img = imgRef.current
    const { w, h } = sizeRef.current
    const cam = camRef.current
    if (!img) return

    const iw = img.naturalWidth * cam.zoom
    const ih = img.naturalHeight * cam.zoom

    // If image is smaller than viewport, center it
    if (iw <= w) {
      cam.x = (w - iw) / 2
    } else {
      cam.x = clamp(cam.x, w - iw, 0)
    }
    if (ih <= h) {
      cam.y = (h - ih) / 2
    } else {
      cam.y = clamp(cam.y, h - ih, 0)
    }
  }, [])

  // ─── World ↔ Screen ─────────────────────────
  const worldToScreen = useCallback((pxPct: number, pyPct: number) => {
    const img = imgRef.current
    if (!img) return { x: 0, y: 0 }
    const cam = camRef.current
    return {
      x: (pxPct / 100) * img.naturalWidth * cam.zoom + cam.x,
      y: (pyPct / 100) * img.naturalHeight * cam.zoom + cam.y,
    }
  }, [])

  // ─── Load Image ──────────────────────────────
  useEffect(() => {
    const img = new Image()
    img.src = mapImage
    img.onload = () => {
      imgRef.current = img
      cloudRef.current = createCloudTexture(img.naturalWidth, img.naturalHeight)
      initCamera()
      startTimeRef.current = performance.now()
      setLoaded(true)
    }
  }, [mapImage, initCamera])

  // ─── Preload pin images ──────────────────────
  useEffect(() => {
    pins.forEach((pin) => {
      if (pin.pinImage && !pinImagesRef.current[pin.team_id]) {
        const img = new Image()
        img.src = pin.pinImage
        pinImagesRef.current[pin.team_id] = img
      }
    })
  }, [pins])

  // ─── Resize Observer ─────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        sizeRef.current = { w: width, h: height }
        const canvas = canvasRef.current
        if (canvas) {
          const dpr = window.devicePixelRatio || 1
          canvas.width = width * dpr
          canvas.height = height * dpr
        }
        if (imgRef.current) {
          initCamera()
        }
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [initCamera])

  // ─── Title Animation ─────────────────────────
  useEffect(() => {
    if (!loaded) return
    const t1 = setTimeout(() => setTitlePhase("out"), 1200)
    const t2 = setTimeout(() => setTitlePhase("gone"), 1800)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [loaded])

  // ─── Render Loop ─────────────────────────────
  useEffect(() => {
    if (!loaded) return

    const render = (time: number) => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext("2d")
      const img = imgRef.current
      if (!canvas || !ctx || !img) {
        rafRef.current = requestAnimationFrame(render)
        return
      }

      const dpr = window.devicePixelRatio || 1
      const { w, h } = sizeRef.current
      const cam = camRef.current
      const elapsed = time - startTimeRef.current

      // Reset transform and clear
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      // ── Background image ──
      ctx.save()
      ctx.translate(cam.x, cam.y)
      ctx.scale(cam.zoom, cam.zoom)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"
      ctx.drawImage(img, 0, 0)

      // ── Clouds (scrolling overlay) ──
      const cloud = cloudRef.current
      if (cloud) {
        const cw = cloud.width
        const speed1 = 0.008 // px per ms — slow drift
        const speed2 = 0.005
        const ox1 = (time * speed1) % cw
        const ox2 = (time * speed2) % cw

        // Two passes for seamless tiling
        ctx.globalAlpha = 0.6
        ctx.drawImage(cloud, -ox1, 0)
        ctx.drawImage(cloud, cw - ox1, 0)

        ctx.globalAlpha = 0.4
        ctx.drawImage(cloud, -ox2 - cw * 0.3, -20)
        ctx.drawImage(cloud, cw - ox2 - cw * 0.3, -20)

        ctx.globalAlpha = 1
      }

      ctx.restore()

      // ── Pins ──
      const hovered = hoveredRef.current

      pins.forEach((pin, i) => {
        // Entry animation
        const enterTime = PIN_ENTER_START + i * PIN_ENTER_DELAY
        const enterProgress = clamp((elapsed - enterTime) / PIN_ENTER_DURATION, 0, 1)
        if (enterProgress <= 0) return

        const eased = easeOutCubic(enterProgress)
        const isHovered = hovered === pin.team_id

        // Screen position (no float when idle)
        const screen = worldToScreen(pin.pin_x, pin.pin_y)

        // Floating + scale only when hovered (smooth transition via lerp)
        const hoverKey = pin.team_id
        if (!hoverProgressRef.current[hoverKey]) hoverProgressRef.current[hoverKey] = 0
        const hTarget = isHovered ? 1 : 0
        hoverProgressRef.current[hoverKey] += (hTarget - hoverProgressRef.current[hoverKey]) * 0.08
        const hp = hoverProgressRef.current[hoverKey]

        const floatPhase = (time / FLOAT_PERIOD + i * 0.15) * Math.PI * 2
        const floatY = Math.sin(floatPhase) * FLOAT_AMPLITUDE * hp // float only when hovered

        const sx = screen.x
        const sy = screen.y + floatY

        const hoverScale = 1 + hp * 0.35 // 1.0 → 1.35x on hover
        const entryScale = (0.5 + 0.5 * eased) * hoverScale
        const entryAlpha = eased

        ctx.save()
        ctx.translate(sx, sy)
        ctx.scale(entryScale, entryScale)
        ctx.globalAlpha = entryAlpha

        // ── Aura rings (only when hovered) ──
        if (hp > 0.01) {
          ctx.globalAlpha = entryAlpha * hp
          for (let ring = 0; ring < 2; ring++) {
            const phase = (time / AURA_DURATION + ring * 0.35) % 1
            const auraScale = 1 + phase * 1.5
            const auraAlpha = 0.5 * (1 - phase)

            ctx.beginPath()
            ctx.arc(0, 0, PIN_RADIUS * auraScale, 0, Math.PI * 2)
            ctx.fillStyle = hexToRgba(pin.color, auraAlpha)
            ctx.fill()
          }
          ctx.globalAlpha = entryAlpha
        }

        // ── Pin visual ──
        const pinImg = pinImagesRef.current[pin.team_id]
        if (pinImg?.complete && pinImg.naturalWidth > 0) {
          // Custom image pin
          const pw = pinImg.naturalWidth
          const ph = pinImg.naturalHeight
          const drawH = PIN_RADIUS * 14
          const drawW = (pw / ph) * drawH
          // Drop shadow only
          ctx.shadowColor = "rgba(0,0,0,0.4)"
          ctx.shadowBlur = 4
          ctx.shadowOffsetY = 2
          ctx.drawImage(pinImg, -drawW / 2, -drawH / 2, drawW, drawH)
          ctx.shadowColor = "transparent"
        } else {
          // Default circle pin
          ctx.beginPath()
          ctx.arc(0, 0, PIN_RADIUS + PIN_BORDER, 0, Math.PI * 2)
          ctx.fillStyle = isHovered ? pin.color : "#FFFFFF"
          ctx.fill()

          ctx.beginPath()
          ctx.arc(0, 0, PIN_RADIUS, 0, Math.PI * 2)
          ctx.fillStyle = isHovered ? "#FFFFFF" : pin.color
          ctx.fill()
        }

        ctx.restore()

        // ── Hover label ──
        if (isHovered && enterProgress >= 1) {
          const labelText = pin.name
          ctx.save()
          ctx.font = "bold 11px system-ui, -apple-system, sans-serif"
          const metrics = ctx.measureText(labelText)
          const padX = 8
          const padY = 4
          const lw = metrics.width + padX * 2
          const lh = 14 + padY * 2
          const lx = sx - lw / 2
          const ly = sy - PIN_RADIUS - PIN_BORDER - 8 - lh

          // White card-style label
          ctx.shadowColor = "rgba(0,0,0,0.1)"
          ctx.shadowBlur = 8
          ctx.shadowOffsetY = 2
          ctx.fillStyle = "#ffffff"
          roundRect(ctx, lx, ly, lw, lh, 5)
          ctx.fill()
          ctx.shadowColor = "transparent"
          ctx.strokeStyle = "#e8e5e0"
          ctx.lineWidth = 1
          ctx.stroke()

          ctx.fillStyle = "#111111"
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.fillText(labelText, sx, ly + lh / 2)
          ctx.restore()
        }
      })

      rafRef.current = requestAnimationFrame(render)
    }

    rafRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(rafRef.current)
  }, [loaded, pins, worldToScreen])

  // ─── Hit Detection ───────────────────────────
  const hitTestPin = useCallback(
    (screenX: number, screenY: number): MapPin | null => {
      const elapsed = performance.now() - startTimeRef.current
      const cam = camRef.current

      for (let i = pins.length - 1; i >= 0; i--) {
        const pin = pins[i]
        const enterTime = PIN_ENTER_START + i * PIN_ENTER_DELAY
        if (elapsed < enterTime + PIN_ENTER_DURATION * 0.5) continue

        const screen = worldToScreen(pin.pin_x, pin.pin_y)
        const hitRadius = PIN_RADIUS + PIN_BORDER + 4 // extra touch target
        const dx = screenX - screen.x
        const dy = screenY - screen.y
        if (dx * dx + dy * dy <= hitRadius * hitRadius) {
          return pin
        }
      }
      return null
    },
    [pins, worldToScreen]
  )

  // ─── Pointer Handlers ────────────────────────
  const getPointerPos = (e: React.PointerEvent | React.TouchEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    if ("clientX" in e) {
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    return { x: 0, y: 0 }
  }

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const pos = getPointerPos(e)
    ptrRef.current = { down: true, sx: pos.x, sy: pos.y, lx: pos.x, ly: pos.y, dist: 0 }
  }, [])

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const pos = getPointerPos(e)
      const ptr = ptrRef.current

      // Hover detection (always)
      const hit = hitTestPin(pos.x, pos.y)
      const newHovered = hit?.team_id ?? null
      if (hoveredRef.current !== newHovered) {
        hoveredRef.current = newHovered
        const canvas = canvasRef.current
        if (canvas) canvas.style.cursor = newHovered ? "pointer" : "grab"
      }

      if (!ptr.down) return

      const dx = pos.x - ptr.lx
      const dy = pos.y - ptr.ly
      ptr.dist += Math.abs(dx) + Math.abs(dy)
      ptr.lx = pos.x
      ptr.ly = pos.y

      // Drag camera
      const cam = camRef.current
      cam.x += dx
      cam.y += dy
      clampCamera()

      // Update info card position if selected
      if (selected) {
        const screen = worldToScreen(selected.pin_x, selected.pin_y)
        setCardPos({ x: screen.x, y: screen.y })
      }

      const canvas = canvasRef.current
      if (canvas) canvas.style.cursor = "grabbing"
    },
    [hitTestPin, clampCamera, selected, worldToScreen]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const ptr = ptrRef.current
      const pos = getPointerPos(e)
      ptr.down = false

      const canvas = canvasRef.current
      if (canvas) canvas.style.cursor = hoveredRef.current ? "pointer" : "grab"

      // Click (not drag)
      if (ptr.dist < MIN_DRAG_DISTANCE) {
        const hit = hitTestPin(pos.x, pos.y)
        if (hit) {
          const screen = worldToScreen(hit.pin_x, hit.pin_y)
          setSelected(hit)
          setCardPos({ x: screen.x, y: screen.y })
        } else {
          setSelected(null)
        }
      }
    },
    [hitTestPin, worldToScreen]
  )

  // ─── Wheel Zoom ──────────────────────────────
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const img = imgRef.current
      if (!img) return

      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const cam = camRef.current
      const base = baseZoomRef.current
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      const oldZoom = cam.zoom
      const delta = -e.deltaY * ZOOM_SENSITIVITY
      const newZoom = clamp(cam.zoom * (1 + delta), base * MIN_ZOOM_FACTOR, base * MAX_ZOOM_FACTOR)

      // Zoom toward pointer
      cam.x = mx - ((mx - cam.x) / oldZoom) * newZoom
      cam.y = my - ((my - cam.y) / oldZoom) * newZoom
      cam.zoom = newZoom
      clampCamera()

      // Update card position
      if (selected) {
        const screen = worldToScreen(selected.pin_x, selected.pin_y)
        setCardPos({ x: screen.x, y: screen.y })
      }
    },
    [clampCamera, selected, worldToScreen]
  )

  // ─── Touch Pinch Zoom ────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        pinchRef.current = {
          active: true,
          startDist: Math.sqrt(dx * dx + dy * dy),
          startZoom: camRef.current.zoom,
        }
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current.active) {
        e.preventDefault()
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const dist = Math.sqrt(dx * dx + dy * dy)
        const scale = dist / pinchRef.current.startDist
        const base = baseZoomRef.current
        const cam = camRef.current

        const rect = canvas.getBoundingClientRect()
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top

        const oldZoom = cam.zoom
        const newZoom = clamp(
          pinchRef.current.startZoom * scale,
          base * MIN_ZOOM_FACTOR,
          base * MAX_ZOOM_FACTOR
        )

        cam.x = cx - ((cx - cam.x) / oldZoom) * newZoom
        cam.y = cy - ((cy - cam.y) / oldZoom) * newZoom
        cam.zoom = newZoom
        clampCamera()
      }
    }

    const handleTouchEnd = () => {
      pinchRef.current.active = false
    }

    canvas.addEventListener("touchstart", handleTouchStart, { passive: false })
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false })
    canvas.addEventListener("touchend", handleTouchEnd)

    return () => {
      canvas.removeEventListener("touchstart", handleTouchStart)
      canvas.removeEventListener("touchmove", handleTouchMove)
      canvas.removeEventListener("touchend", handleTouchEnd)
    }
  }, [clampCamera])

  // ─── Prevent default wheel scroll ────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const prevent = (e: WheelEvent) => e.preventDefault()
    canvas.addEventListener("wheel", prevent, { passive: false })
    return () => canvas.removeEventListener("wheel", prevent)
  }, [])

  // ─── Render ──────────────────────────────────
  return (
    <div ref={containerRef} className="bg-background relative h-full w-full overflow-hidden">
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none"
        style={{ cursor: "grab" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
      />

      {/* Loading */}
      {!loaded && (
        <div className="bg-background absolute inset-0 z-20 flex items-center justify-center">
          <div className="border-primary/30 border-t-primary h-8 w-8 animate-spin rounded-full border-2" />
        </div>
      )}

      {/* Title overlay */}
      {titlePhase !== "gone" && loaded && (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center transition-opacity duration-500"
          style={{ opacity: titlePhase === "in" ? 1 : 0 }}
        >
          <div className="bg-card/90 rounded-2xl px-8 py-5 text-center shadow-lg backdrop-blur-sm">
            <h1 className="text-foreground text-2xl font-bold">{regionName}</h1>
            <p className="text-muted-foreground mt-1 text-sm">{league}</p>
          </div>
        </div>
      )}

      {/* Back button */}
      <button
        onClick={() => (onBack ? onBack() : router.push("/stadium"))}
        className="bg-card/90 border-border text-foreground hover:bg-card absolute top-3 left-3 z-10 flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm shadow-sm backdrop-blur-sm transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      {/* Info card */}
      {selected && (
        <StadiumInfoCard
          pin={selected}
          screenX={clamp(cardPos.x, sizeRef.current.w * 0.15, sizeRef.current.w * 0.85)}
          screenY={cardPos.y}
          onClose={() => setSelected(null)}
          onEnter={() => router.push(`/stadium/${selected.team_id}`)}
          onInvest={() => onInvest?.(selected)}
        />
      )}
    </div>
  )
}

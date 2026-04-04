"use client"

import { useRef, useEffect, useState } from "react"
import {
  UK_MAP,
  STADIUMS,
  MAP_ROWS,
  MAP_COLS,
  TileType,
  getNearbyStadium,
  UK_COASTLINE,
  type Stadium,
} from "@/lib/constants/uk-map-data"

const FULL_W = 1200
const FULL_H = 1680
const CELL_W = FULL_W / MAP_COLS
const CELL_H = FULL_H / MAP_ROWS
const CHAR_SPEED = 3

const DIRS = [
  "south",
  "north",
  "east",
  "west",
  "south-east",
  "south-west",
  "north-east",
  "north-west",
] as const

function getDir(dx: number, dy: number): string {
  if (dy < 0 && dx === 0) return "north"
  if (dy > 0 && dx === 0) return "south"
  if (dx < 0 && dy === 0) return "west"
  if (dx > 0 && dy === 0) return "east"
  if (dy < 0 && dx > 0) return "north-east"
  if (dy < 0 && dx < 0) return "north-west"
  if (dy > 0 && dx > 0) return "south-east"
  if (dy > 0 && dx < 0) return "south-west"
  return "south"
}

// Land mask stored after terrain render for pixel-perfect walkability
let landMaskData: Uint8ClampedArray | null = null

function isLand(px: number, py: number): boolean {
  if (!landMaskData) {
    // Fallback to grid if mask not ready
    const c = Math.floor(px / CELL_W),
      r = Math.floor(py / CELL_H)
    if (r < 0 || r >= MAP_ROWS || c < 0 || c >= MAP_COLS) return false
    return UK_MAP[r][c] !== TileType.Ocean
  }
  const x = Math.floor(px),
    y = Math.floor(py)
  if (x < 0 || x >= FULL_W || y < 0 || y >= FULL_H) return false
  return landMaskData[(y * FULL_W + x) * 4] > 128
}

// Noise
function noise(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return n - Math.floor(n)
}
function fbm(x: number, y: number, oct = 4): number {
  let v = 0,
    a = 1,
    f = 1,
    m = 0
  for (let i = 0; i < oct; i++) {
    v += noise(x * f, y * f) * a
    m += a
    a *= 0.5
    f *= 2
  }
  return v / m
}

// Smooth upscale helper
function upscale(src: HTMLCanvasElement): ImageData {
  const c = document.createElement("canvas")
  c.width = FULL_W
  c.height = FULL_H
  const ctx = c.getContext("2d")!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(src, 0, 0, FULL_W, FULL_H)
  return ctx.getImageData(0, 0, FULL_W, FULL_H)
}

function clamp(v: number) {
  return Math.max(0, Math.min(255, v | 0))
}

// ═══════════════════════════════════════════
// JRPG World Map Renderer (FF6-inspired)
// ═══════════════════════════════════════════
function renderTerrain(sprites: Record<string, HTMLImageElement>): HTMLCanvasElement {
  const W = FULL_W,
    H = FULL_H

  // 1) Land mask from polygon — real UK coastline shape
  const mt = document.createElement("canvas")
  mt.width = W
  mt.height = H
  const mc = mt.getContext("2d")!
  mc.fillStyle = "#000"
  mc.fillRect(0, 0, W, H)
  mc.fillStyle = "#fff"
  mc.beginPath()
  mc.moveTo(UK_COASTLINE[0][0], UK_COASTLINE[0][1])
  for (let i = 1; i < UK_COASTLINE.length; i++) mc.lineTo(UK_COASTLINE[i][0], UK_COASTLINE[i][1])
  mc.closePath()
  mc.fill()
  // Slight blur for smooth coastline edges
  mc.filter = "blur(4px)"
  mc.drawImage(mt, 0, 0)
  mc.filter = "none"
  const land = mc.getImageData(0, 0, W, H).data
  landMaskData = land // Store for walkability checks

  // 2) Elevation mask
  const et = document.createElement("canvas")
  et.width = MAP_COLS
  et.height = MAP_ROWS
  const ec = et.getContext("2d")!
  for (let r = 0; r < MAP_ROWS; r++)
    for (let c = 0; c < MAP_COLS; c++) {
      let v = 0
      switch (UK_MAP[r][c]) {
        case TileType.Mountain:
          v = 255
          break
        case TileType.Forest:
          v = 140
          break
        case TileType.City:
          v = 55
          break
        case TileType.Grass:
          v = 35
          break
      }
      ec.fillStyle = `rgb(${v},${v},${v})`
      ec.fillRect(c, r, 1, 1)
    }
  const elev = upscale(et).data

  // 3) Clean per-pixel rendering — crisp solid colors, minimal noise
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d")!
  const img = ctx.createImageData(W, H)
  const d = img.data

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const L = land[i] / 255

      let r: number, g: number, b: number

      if (L < 0.1) {
        // Deep ocean — clean solid blue
        r = 20
        g = 50
        b = 140
      } else if (L < 0.25) {
        // Shallow water — lighter blue gradient
        const t = (L - 0.1) / 0.15
        r = 25 + t * 35
        g = 65 + t * 55
        b = 165 - t * 30
      } else if (L < 0.42) {
        // Coast transition — blend to green
        const t = (L - 0.25) / 0.17
        r = 50 + t * 10
        g = 115 + t * 40
        b = 110 - t * 70
      } else {
        // Land — clean bright green (sprites add detail)
        r = 58
        g = 155
        b = 38
        // Very subtle variation only
        const v = noise(x * 0.01, y * 0.01)
        if (v > 0.6) {
          g += 8
          r -= 3
        }
        if (v < 0.35) {
          g -= 6
          r += 3
        }

        // Coastal edge darken
        if (L < 0.55) {
          const f = 1 - (L - 0.42) / 0.13
          r *= 1 - f * 0.15
          g *= 1 - f * 0.1
          b *= 1 - f * 0.2
        }
      }

      d[i] = clamp(r)
      d[i + 1] = clamp(g)
      d[i + 2] = clamp(b)
      d[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)

  // 5) Overlay PixelLab pixel art sprites
  const mtnL = sprites["mountain-large"]
  const mtnM = sprites["mountain-medium"]
  const fL = sprites["forest-large"]
  const fS = sprites["forest-small"]
  const cld = sprites["cloud-large"]

  // Mountains — place at known highland regions
  if (mtnL) {
    ctx.drawImage(mtnL, 10 * CELL_W - 20, 2 * CELL_H - 35, 8 * CELL_W + 40, 6.5 * CELL_H)
  }
  if (mtnM) {
    ctx.drawImage(mtnM, 4 * CELL_W - 10, 24 * CELL_H - 20, 5 * CELL_W, 3 * CELL_H + 10) // Wales
    ctx.drawImage(mtnM, 8 * CELL_W - 5, 17 * CELL_H - 10, 3 * CELL_W + 10, 2.5 * CELL_H) // Lake District
    ctx.globalAlpha = 0.8
    ctx.drawImage(mtnM, 12 * CELL_W, 15 * CELL_H - 5, 2.5 * CELL_W, 2.5 * CELL_H) // Pennines
    ctx.globalAlpha = 1
  }

  // Forests — use small sprite scattered with jitter (not every cell, cluster feel)
  if (fS) {
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        if (UK_MAP[r][c] !== TileType.Forest) continue
        // 2-3 small trees per forest cell, jittered for natural look
        const count = 2 + (noise(r * 3, c * 7) > 0.5 ? 1 : 0)
        for (let t = 0; t < count; t++) {
          const ox = (noise(r + t * 5, c) - 0.5) * CELL_W * 0.8
          const oy = (noise(c + t * 5, r) - 0.5) * CELL_H * 0.8
          const sz = 18 + noise(t, r + c) * 14
          ctx.drawImage(
            fS,
            c * CELL_W + CELL_W / 2 + ox - sz / 2,
            r * CELL_H + CELL_H / 2 + oy - sz / 2,
            sz,
            sz
          )
        }
      }
    }
  }

  // Clouds over ocean
  if (cld) {
    for (let ci = 0; ci < 15; ci++) {
      const cx = noise(ci * 5.3, 0.91) * W
      const cy = noise(0.91, ci * 5.3) * H
      const col = Math.floor(cx / CELL_W),
        row = Math.floor(cy / CELL_H)
      if (
        row >= 0 &&
        row < MAP_ROWS &&
        col >= 0 &&
        col < MAP_COLS &&
        UK_MAP[row][col] !== TileType.Ocean
      )
        continue
      const s = 0.5 + noise(ci, ci) * 1.0
      ctx.globalAlpha = 0.65 + noise(ci * 2, 0) * 0.25
      ctx.drawImage(cld, cx - 60 * s, cy - 35 * s, 120 * s, 70 * s)
    }
    ctx.globalAlpha = 1
  }

  return canvas
}

// ═══════════════════════════════════════════
// Game Component
// ═══════════════════════════════════════════
interface GS {
  px: number
  py: number
  dir: string
  camX: number
  camY: number
  keys: Set<string>
  zoom: number
}

export function PaintedMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [nearby, setNearby] = useState<Stadium | null>(null)
  const terrainRef = useRef<HTMLCanvasElement | null>(null)
  const imgs = useRef<Record<string, HTMLImageElement>>({})
  const gs = useRef<GS>({
    px: 19.5 * CELL_W,
    py: 30.5 * CELL_H,
    dir: "south",
    camX: 19.5 * CELL_W,
    camY: 30.5 * CELL_H,
    keys: new Set(),
    zoom: 2,
  })

  useEffect(() => {
    const srcs: Record<string, string> = {
      "stadium-large": "/map/objects/stadium-large.png",
      "stadium-medium": "/map/objects/stadium-medium.png",
      "mountain-large": "/map/objects/mountain-large.png",
      "mountain-medium": "/map/objects/mountain-medium.png",
      "forest-large": "/map/objects/forest-large.png",
      "forest-small": "/map/objects/forest-small.png",
      "cloud-large": "/map/objects/cloud-large.png",
    }
    for (const d of DIRS) srcs[`c-${d}`] = `/map/character/${d}.png`
    let n = 0
    const total = Object.keys(srcs).length
    Object.entries(srcs).forEach(([k, s]) => {
      const img = new Image()
      img.onload = img.onerror = () => {
        if (img.complete && img.naturalWidth > 0) imgs.current[k] = img
        if (++n >= total) {
          terrainRef.current = renderTerrain(imgs.current)
          setLoaded(true)
        }
      }
      img.src = s
    })
  }, [])

  useEffect(() => {
    const mv = (s: GS) => {
      let dx = 0,
        dy = 0
      if (s.keys.has("ArrowUp") || s.keys.has("w") || s.keys.has("W")) dy = -1
      if (s.keys.has("ArrowDown") || s.keys.has("s") || s.keys.has("S")) dy = 1
      if (s.keys.has("ArrowLeft") || s.keys.has("a") || s.keys.has("A")) dx = -1
      if (s.keys.has("ArrowRight") || s.keys.has("d") || s.keys.has("D")) dx = 1
      if (!dx && !dy) return
      const l = Math.sqrt(dx * dx + dy * dy)
      dx /= l
      dy /= l
      s.dir = getDir(dx, dy)
      const nx = s.px + dx * CHAR_SPEED,
        ny = s.py + dy * CHAR_SPEED
      if (isLand(nx, ny)) {
        s.px = nx
        s.py = ny
      } else if (isLand(nx, s.py)) s.px = nx
      else if (isLand(s.px, ny)) s.py = ny
    }
    const kd = (e: KeyboardEvent) => {
      gs.current.keys.add(e.key)
      if (e.key.startsWith("Arrow")) e.preventDefault()
      mv(gs.current)
    }
    const ku = (e: KeyboardEvent) => gs.current.keys.delete(e.key)
    const wh = (e: WheelEvent) => {
      e.preventDefault()
      gs.current.zoom = Math.max(0.4, Math.min(4, gs.current.zoom - e.deltaY * 0.002))
    }
    window.addEventListener("keydown", kd)
    window.addEventListener("keyup", ku)
    window.addEventListener("wheel", wh, { passive: false })
    return () => {
      window.removeEventListener("keydown", kd)
      window.removeEventListener("keyup", ku)
      window.removeEventListener("wheel", wh)
    }
  }, [])

  useEffect(() => {
    if (!loaded || !canvasRef.current) return
    const cv = canvasRef.current,
      ctx = cv.getContext("2d")!
    let raf: number,
      tick = 0
    const resize = () => {
      cv.width = innerWidth
      cv.height = innerHeight
    }
    resize()
    addEventListener("resize", resize)

    const loop = () => {
      const s = gs.current
      let dx = 0,
        dy = 0
      if (s.keys.has("ArrowUp") || s.keys.has("w") || s.keys.has("W")) dy = -1
      if (s.keys.has("ArrowDown") || s.keys.has("s") || s.keys.has("S")) dy = 1
      if (s.keys.has("ArrowLeft") || s.keys.has("a") || s.keys.has("A")) dx = -1
      if (s.keys.has("ArrowRight") || s.keys.has("d") || s.keys.has("D")) dx = 1
      if (dx || dy) {
        const l = Math.sqrt(dx * dx + dy * dy)
        dx /= l
        dy /= l
        s.dir = getDir(dx, dy)
        const nx = s.px + dx * CHAR_SPEED,
          ny = s.py + dy * CHAR_SPEED
        if (isLand(nx, ny)) {
          s.px = nx
          s.py = ny
        } else if (isLand(nx, s.py)) s.px = nx
        else if (isLand(s.px, ny)) s.py = ny
      }
      s.camX += (s.px - s.camX) * 0.08
      s.camY += (s.py - s.camY) * 0.08
      if (++tick > 20) {
        tick = 0
        setNearby(getNearbyStadium(Math.floor(s.py / CELL_H), Math.floor(s.px / CELL_W), 3))
      }

      const W = cv.width,
        H = cv.height
      ctx.fillStyle = "#0a1428"
      ctx.fillRect(0, 0, W, H)
      ctx.save()
      ctx.translate(W / 2, H / 2)
      ctx.scale(s.zoom, s.zoom)
      ctx.translate(-s.camX, -s.camY)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"
      if (terrainRef.current) ctx.drawImage(terrainRef.current, 0, 0)

      for (const st of STADIUMS) {
        const sx = (st.col + 0.5) * CELL_W,
          sy = (st.row + 0.5) * CELL_H
        const img = imgs.current[st.size === "large" ? "stadium-large" : "stadium-medium"]
        const sz = st.size === "large" ? 44 : 32
        if (img) ctx.drawImage(img, sx - sz / 2, sy - sz + 6, sz, sz)
        ctx.imageSmoothingEnabled = true
        ctx.font = "bold 7px sans-serif"
        ctx.textAlign = "center"
        ctx.strokeStyle = "#000"
        ctx.lineWidth = 2.5
        ctx.strokeText(st.name, sx, sy - sz + 2)
        ctx.fillStyle = "#fff"
        ctx.fillText(st.name, sx, sy - sz + 2)
        ctx.font = "6px sans-serif"
        ctx.fillStyle = "#ffd700"
        ctx.strokeText(st.team, sx, sy - sz + 10)
        ctx.fillText(st.team, sx, sy - sz + 10)
        ctx.imageSmoothingEnabled = false
      }

      ctx.imageSmoothingEnabled = false
      const ci = imgs.current[`c-${s.dir}`]
      if (ci) ctx.drawImage(ci, s.px - 17, s.py - 30, 34, 34)
      else {
        ctx.fillStyle = "#ff4444"
        ctx.beginPath()
        ctx.arc(s.px, s.py - 6, 5, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
      minimap(ctx, W, H, s)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener("resize", resize)
    }
  }, [loaded])

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#0a1428]">
      {!loaded && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0a1428] text-white">
          <div className="mb-2 text-2xl font-bold">Rendering UK Map...</div>
          <div className="text-sm opacity-60">Painting terrain...</div>
        </div>
      )}
      <canvas ref={canvasRef} className="block" />
      <div className="absolute top-4 left-4 rounded-xl bg-black/70 px-4 py-3 text-white backdrop-blur-sm">
        <h2 className="text-lg font-bold">UK Stadium Explorer</h2>
        <p className="mt-1 text-xs opacity-60">WASD / Arrows · Scroll to zoom</p>
      </div>
      {nearby && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-xl border border-yellow-500/50 bg-black/80 px-6 py-4 text-center text-white backdrop-blur-sm">
          <div className="text-xs font-semibold tracking-wider text-yellow-400 uppercase">
            Stadium Nearby
          </div>
          <div className="mt-1 text-xl font-bold">{nearby.name}</div>
          <div className="text-sm opacity-80">
            {nearby.team} — Capacity: {nearby.capacity}
          </div>
        </div>
      )}
    </div>
  )
}

function minimap(ctx: CanvasRenderingContext2D, W: number, H: number, s: GS) {
  const mw = 100,
    mh = 140,
    mx = W - mw - 16,
    my = 16,
    sx = mw / FULL_W,
    sy = mh / FULL_H
  ctx.fillStyle = "rgba(0,0,0,0.55)"
  ctx.beginPath()
  ctx.roundRect(mx - 4, my - 4, mw + 8, mh + 8, 8)
  ctx.fill()
  for (let r = 0; r < MAP_ROWS; r++)
    for (let c = 0; c < MAP_COLS; c++) {
      const t = UK_MAP[r][c]
      if (t === TileType.Ocean) continue
      ctx.fillStyle = t === TileType.Mountain ? "#888" : t === TileType.Forest ? "#2a5" : "#4a3"
      ctx.fillRect(
        mx + c * CELL_W * sx,
        my + r * CELL_H * sy,
        Math.ceil(CELL_W * sx),
        Math.ceil(CELL_H * sy)
      )
    }
  ctx.fillStyle = "#f44"
  for (const st of STADIUMS) {
    ctx.beginPath()
    ctx.arc(
      mx + (st.col + 0.5) * CELL_W * sx,
      my + (st.row + 0.5) * CELL_H * sy,
      1.5,
      0,
      Math.PI * 2
    )
    ctx.fill()
  }
  ctx.fillStyle = "#0f8"
  ctx.beginPath()
  ctx.arc(mx + s.px * sx, my + s.py * sy, 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = "rgba(255,255,255,0.4)"
  ctx.lineWidth = 1
  ctx.strokeRect(
    mx + (s.camX - W / 2 / s.zoom) * sx,
    my + (s.camY - H / 2 / s.zoom) * sy,
    (W / s.zoom) * sx,
    (H / s.zoom) * sy
  )
}

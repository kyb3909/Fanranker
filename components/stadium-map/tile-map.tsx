"use client"

import { useRef, useEffect, useState } from "react"
import {
  UK_MAP,
  STADIUMS,
  MAP_ROWS,
  MAP_COLS,
  TILE_PX,
  MAP_W,
  MAP_H,
  Terrain,
  TILESET_CONFIGS,
  VARIANT_CONFIGS,
  isWalkable,
  getNearbyStadium,
  type Stadium,
  type TilesetConfig,
} from "@/lib/constants/uk-map-data-v2"

// ─── Directions ───
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

// ─── Wang Tile Lookup ───
interface TilesetMeta {
  tiles: {
    corners: { NW: string; NE: string; SW: string; SE: string }
    bounding_box: { x: number; y: number }
  }[]
}

// Use string key for corners to handle "transition" values
function buildLookup(meta: TilesetMeta): Map<string, { x: number; y: number }> {
  const m = new Map<string, { x: number; y: number }>()
  for (const t of meta.tiles) {
    const key = `${t.corners.NW}-${t.corners.NE}-${t.corners.SW}-${t.corners.SE}`
    m.set(key, { x: t.bounding_box.x, y: t.bounding_box.y })
  }
  return m
}

// Also build a binary fallback lookup (ignoring transition → lower)
function buildBinaryLookup(meta: TilesetMeta): Map<number, { x: number; y: number }> {
  const m = new Map<number, { x: number; y: number }>()
  for (const t of meta.tiles) {
    const idx =
      (t.corners.NW === "upper" ? 8 : 0) +
      (t.corners.NE === "upper" ? 4 : 0) +
      (t.corners.SW === "upper" ? 2 : 0) +
      (t.corners.SE === "upper" ? 1 : 0)
    if (!m.has(idx)) m.set(idx, { x: t.bounding_box.x, y: t.bounding_box.y })
  }
  return m
}

// ─── Vertex Grid ───
// Build vertex grid for a specific terrain set — vertex = 1 if ANY neighbor is in targetTerrains
function buildVertexGrid(targetTerrains: Set<number>): number[][] {
  const vg: number[][] = Array.from({ length: MAP_ROWS + 1 }, () => Array(MAP_COLS + 1).fill(0))
  const isTarget = (r: number, c: number): number => {
    if (r < 0 || r >= MAP_ROWS || c < 0 || c >= MAP_COLS) return 0
    return targetTerrains.has(UK_MAP[r][c]) ? 1 : 0
  }
  for (let vr = 0; vr <= MAP_ROWS; vr++)
    for (let vc = 0; vc <= MAP_COLS; vc++)
      vg[vr][vc] = Math.max(
        isTarget(vr - 1, vc - 1),
        isTarget(vr - 1, vc),
        isTarget(vr, vc - 1),
        isTarget(vr, vc)
      )
  return vg
}

// Terrain groupings for each tileset layer
const TERRAIN_GROUPS: Record<string, Set<number>> = {
  "deep-shallow": new Set([
    Terrain.ShallowWater,
    Terrain.Grass,
    Terrain.DarkGrass,
    Terrain.Forest,
    Terrain.ConiferForest,
    Terrain.Mountain,
    Terrain.SnowMountain,
    Terrain.Hill,
    Terrain.Moorland,
    Terrain.Farmland,
    Terrain.City,
    Terrain.River,
    Terrain.Wetland,
  ]),
  "shallow-grass": new Set([
    Terrain.Grass,
    Terrain.DarkGrass,
    Terrain.Forest,
    Terrain.ConiferForest,
    Terrain.Mountain,
    Terrain.SnowMountain,
    Terrain.Hill,
    Terrain.Moorland,
    Terrain.Farmland,
    Terrain.City,
    Terrain.River,
    Terrain.Wetland,
  ]),
  "grass-hill": new Set([Terrain.Hill]),
  "grass-forest": new Set([Terrain.Forest]),
  "grass-conifer": new Set([Terrain.ConiferForest]),
  "grass-mountain": new Set([Terrain.Mountain]),
  "grass-snow": new Set([Terrain.SnowMountain]),
  "grass-moorland": new Set([Terrain.Moorland]),
  "grass-farmland": new Set([Terrain.Farmland]),
  "grass-city": new Set([Terrain.City]),
  "grass-river": new Set([Terrain.River]),
  "forest-mountain": new Set([Terrain.Mountain, Terrain.SnowMountain]),
  "grass-darkgrass": new Set([Terrain.DarkGrass]),
  "grass-wetland": new Set([Terrain.Wetland]),
  "grass-estuary": new Set([Terrain.River]),
  "grass-deciduous": new Set([Terrain.Forest]),
  "coast-gravel": new Set([
    Terrain.Grass,
    Terrain.DarkGrass,
    Terrain.Forest,
    Terrain.ConiferForest,
    Terrain.Mountain,
    Terrain.SnowMountain,
    Terrain.Hill,
    Terrain.Moorland,
    Terrain.Farmland,
    Terrain.City,
    Terrain.River,
    Terrain.Wetland,
  ]),
  "coast-rocky": new Set([
    Terrain.Grass,
    Terrain.DarkGrass,
    Terrain.Forest,
    Terrain.ConiferForest,
    Terrain.Mountain,
    Terrain.SnowMountain,
    Terrain.Hill,
    Terrain.Moorland,
    Terrain.Farmland,
    Terrain.City,
    Terrain.River,
    Terrain.Wetland,
  ]),
}

function wangIndex(vg: number[][], row: number, col: number): number {
  return vg[row][col] * 8 + vg[row][col + 1] * 4 + vg[row + 1][col] * 2 + vg[row + 1][col + 1]
}

// ─── Loaded Tileset ───
interface LoadedTileset {
  config: TilesetConfig
  img: HTMLImageElement
  lookup: Map<number, { x: number; y: number }>
  vertexGrid: number[][]
}

// ─── Render terrain to offscreen canvas ───
function renderTerrain(tilesets: LoadedTileset[]): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = MAP_W
  canvas.height = MAP_H
  const ctx = canvas.getContext("2d")!
  ctx.imageSmoothingEnabled = false

  // Fill deep ocean as base
  ctx.fillStyle = "#0c1e3a"
  ctx.fillRect(0, 0, MAP_W, MAP_H)

  // Draw each tileset layer bottom-to-top
  for (let li = 0; li < tilesets.length; li++) {
    const ts = tilesets[li]
    const isBase = ts.config.id === "deep-shallow" || ts.config.id === "shallow-grass"

    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        const idx = wangIndex(ts.vertexGrid, row, col)

        // Base layers: draw ALL cells (idx=0 = full lower tile, idx=15 = full upper tile)
        // Non-base layers: skip idx=0 (no target terrain nearby)
        if (!isBase && idx === 0) continue

        const src = ts.lookup.get(idx)
        if (!src) continue
        ctx.drawImage(ts.img, src.x, src.y, 32, 32, col * TILE_PX, row * TILE_PX, TILE_PX, TILE_PX)
      }
    }
  }

  return canvas
}

// ─── Game State ───
interface GS {
  px: number
  py: number
  dir: string
  camX: number
  camY: number
  keys: Set<string>
  zoom: number
}

// ═══════════════════════════════════════════
// Component
// ═══════════════════════════════════════════
export function TileMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [nearby, setNearby] = useState<Stadium | null>(null)
  const terrainRef = useRef<HTMLCanvasElement | null>(null)
  const imgs = useRef<Record<string, HTMLImageElement>>({})
  const gs = useRef<GS>({
    px: 38 * TILE_PX + TILE_PX / 2,
    py: 60 * TILE_PX + TILE_PX / 2, // Near London
    dir: "south",
    camX: 38 * TILE_PX,
    camY: 60 * TILE_PX,
    keys: new Set(),
    zoom: 2.5,
  })

  // Load all assets
  useEffect(() => {
    const allConfigs = [...TILESET_CONFIGS, ...VARIANT_CONFIGS]
    const spriteKeys: Record<string, string> = {
      "stadium-large": "/map/objects/stadium-large.png",
      "stadium-medium": "/map/objects/stadium-medium.png",
    }
    for (const d of DIRS) spriteKeys[`c-${d}`] = `/map/character/${d}.png`

    let loaded = 0
    const metas: Record<string, TilesetMeta> = {}
    const tilesetImgs: Record<string, HTMLImageElement> = {}
    const total = allConfigs.length * 2 + Object.keys(spriteKeys).length

    const checkDone = () => {
      if (++loaded < total) return

      // Build loaded tilesets with correct terrain matching
      const tilesets: LoadedTileset[] = []
      for (const cfg of TILESET_CONFIGS) {
        const img = tilesetImgs[cfg.id]
        const meta = metas[cfg.id]
        if (!img || !meta) continue
        const terrainGroup = TERRAIN_GROUPS[cfg.id] || new Set<number>()
        tilesets.push({
          config: cfg,
          img,
          lookup: buildBinaryLookup(meta),
          vertexGrid: buildVertexGrid(terrainGroup),
        })
      }

      terrainRef.current = renderTerrain(tilesets)
      setLoaded(true)
    }

    // Load tilesets
    for (const cfg of allConfigs) {
      const img = new Image()
      img.onload = () => {
        tilesetImgs[cfg.id] = img
        checkDone()
      }
      img.onerror = () => checkDone()
      img.src = `/map/tiles/${cfg.pngFile}`

      fetch(`/map/tiles/${cfg.jsonFile}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (j?.tileset_data?.tiles) metas[cfg.id] = j.tileset_data
          else if (j?.tiles) metas[cfg.id] = j
          checkDone()
        })
        .catch(() => checkDone())
    }

    // Load sprites
    for (const [key, src] of Object.entries(spriteKeys)) {
      const img = new Image()
      img.onload = img.onerror = () => {
        if (img.complete && img.naturalWidth > 0) imgs.current[key] = img
        checkDone()
      }
      img.src = src
    }
  }, [])

  // Keyboard + zoom
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
      const speed = 3
      const nx = s.px + dx * speed,
        ny = s.py + dy * speed
      const nr = Math.floor(ny / TILE_PX),
        nc = Math.floor(nx / TILE_PX)
      const cr = Math.floor(s.py / TILE_PX),
        cc = Math.floor(s.px / TILE_PX)
      if (isWalkable(nr, nc)) {
        s.px = nx
        s.py = ny
      } else if (isWalkable(cr, nc)) {
        s.px = nx
      } else if (isWalkable(nr, cc)) {
        s.py = ny
      }
    }
    const kd = (e: KeyboardEvent) => {
      gs.current.keys.add(e.key)
      if (e.key.startsWith("Arrow")) e.preventDefault()
      mv(gs.current)
    }
    const ku = (e: KeyboardEvent) => gs.current.keys.delete(e.key)
    const wh = (e: WheelEvent) => {
      e.preventDefault()
      gs.current.zoom = Math.max(0.5, Math.min(5, gs.current.zoom - e.deltaY * 0.002))
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

  // Game loop
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
      // Held-key movement
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
        const nx = s.px + dx * 3,
          ny = s.py + dy * 3
        const nr = Math.floor(ny / TILE_PX),
          nc = Math.floor(nx / TILE_PX)
        if (isWalkable(nr, nc)) {
          s.px = nx
          s.py = ny
        } else if (isWalkable(Math.floor(s.py / TILE_PX), nc)) s.px = nx
        else if (isWalkable(nr, Math.floor(s.px / TILE_PX))) s.py = ny
      }
      s.camX += (s.px - s.camX) * 0.08
      s.camY += (s.py - s.camY) * 0.08
      if (++tick > 20) {
        tick = 0
        setNearby(getNearbyStadium(Math.floor(s.py / TILE_PX), Math.floor(s.px / TILE_PX), 4))
      }

      const W = cv.width,
        H = cv.height
      ctx.fillStyle = "#0c1e3a"
      ctx.fillRect(0, 0, W, H)
      ctx.save()
      ctx.translate(W / 2, H / 2)
      ctx.scale(s.zoom, s.zoom)
      ctx.translate(-s.camX, -s.camY)
      ctx.imageSmoothingEnabled = false

      // Terrain
      if (terrainRef.current) ctx.drawImage(terrainRef.current, 0, 0)

      // Stadiums
      for (const st of STADIUMS) {
        const sx = (st.col + 0.5) * TILE_PX,
          sy = (st.row + 0.5) * TILE_PX
        const img = imgs.current[st.size === "large" ? "stadium-large" : "stadium-medium"]
        const sz = st.size === "large" ? 36 : 28
        if (img) ctx.drawImage(img, sx - sz / 2, sy - sz + 4, sz, sz)
        ctx.imageSmoothingEnabled = true
        ctx.font = "bold 6px sans-serif"
        ctx.textAlign = "center"
        ctx.strokeStyle = "#000"
        ctx.lineWidth = 2
        ctx.strokeText(st.name, sx, sy - sz)
        ctx.fillStyle = "#fff"
        ctx.fillText(st.name, sx, sy - sz)
        ctx.font = "5px sans-serif"
        ctx.fillStyle = "#ffd700"
        ctx.strokeText(st.team, sx, sy - sz + 7)
        ctx.fillText(st.team, sx, sy - sz + 7)
        ctx.imageSmoothingEnabled = false
      }

      // Character
      const ci = imgs.current[`c-${s.dir}`]
      if (ci) ctx.drawImage(ci, s.px - 14, s.py - 24, 28, 28)
      else {
        ctx.fillStyle = "#f44"
        ctx.beginPath()
        ctx.arc(s.px, s.py - 4, 4, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.restore()

      // Minimap
      const mw = 90,
        mh = 126,
        mx = W - mw - 12,
        my = 12
      const sx2 = mw / MAP_W,
        sy2 = mh / MAP_H
      ctx.fillStyle = "rgba(0,0,0,0.5)"
      ctx.beginPath()
      ctx.roundRect(mx - 3, my - 3, mw + 6, mh + 6, 6)
      ctx.fill()
      for (let r = 0; r < MAP_ROWS; r++)
        for (let c = 0; c < MAP_COLS; c++) {
          const t = UK_MAP[r][c]
          if (t === Terrain.DeepOcean || t === Terrain.ShallowWater) continue
          ctx.fillStyle =
            t === Terrain.Mountain || t === Terrain.SnowMountain
              ? "#888"
              : t === Terrain.Forest || t === Terrain.ConiferForest
                ? "#2a5"
                : t === Terrain.City
                  ? "#cc8"
                  : t === Terrain.Moorland
                    ? "#856"
                    : t === Terrain.Farmland
                      ? "#a93"
                      : t === Terrain.Hill
                        ? "#7a5"
                        : "#4a3"
          ctx.fillRect(
            mx + c * TILE_PX * sx2,
            my + r * TILE_PX * sy2,
            Math.ceil(TILE_PX * sx2),
            Math.ceil(TILE_PX * sy2)
          )
        }
      ctx.fillStyle = "#f44"
      for (const st of STADIUMS) {
        ctx.beginPath()
        ctx.arc(
          mx + (st.col + 0.5) * TILE_PX * sx2,
          my + (st.row + 0.5) * TILE_PX * sy2,
          1.5,
          0,
          Math.PI * 2
        )
        ctx.fill()
      }
      ctx.fillStyle = "#0f8"
      ctx.beginPath()
      ctx.arc(mx + s.px * sx2, my + s.py * sy2, 2.5, 0, Math.PI * 2)
      ctx.fill()

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener("resize", resize)
    }
  }, [loaded])

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#0c1e3a]">
      {!loaded && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0c1e3a] text-white">
          <div className="mb-2 text-2xl font-bold">Loading UK Stadium Map...</div>
          <div className="text-sm opacity-60">Assembling tilesets...</div>
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

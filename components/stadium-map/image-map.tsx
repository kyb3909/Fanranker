"use client"

import { useRef, useEffect, useState, useCallback } from "react"

// ─── Config ───
const GRID = 204 // 204×204 grid cells (2x detail)
const SRC_SIZE = 2048 // Source image size
const CELL_SRC = SRC_SIZE / GRID // ~10px per cell in source
const TILE_PX = 10 // Rendered tile size (smaller = more detail)
const MAP_PX = GRID * TILE_PX // 2040px rendered map
const CHAR_SPEED = 3

// Terrain types
const T = {
  DEEP: 0,
  SHALLOW: 1,
  GRASS: 2,
  DARK_GRASS: 3,
  FOREST: 4,
  CONIFER: 5,
  MOUNTAIN: 6,
  SNOW: 7,
  HILL: 8,
  MOOR: 9,
  FARM: 10,
  CITY: 11,
  RIVER: 12,
} as const

// ─── Tileset definitions ───
interface TsDef {
  id: string
  png: string
  json: string
  targets: Set<number> // terrain types that count as "upper"
  isBase?: boolean // draw all cells including idx=0
}

const TILESETS: TsDef[] = [
  {
    id: "deep-shallow",
    png: "ts-deep-shallow.png",
    json: "ts-deep-shallow.json",
    targets: new Set([
      T.SHALLOW,
      T.GRASS,
      T.DARK_GRASS,
      T.FOREST,
      T.CONIFER,
      T.MOUNTAIN,
      T.SNOW,
      T.HILL,
      T.MOOR,
      T.FARM,
      T.CITY,
      T.RIVER,
    ]),
    isBase: true,
  },
  {
    id: "shallow-grass",
    png: "ts-shallow-grass.png",
    json: "ts-shallow-grass.json",
    targets: new Set([
      T.GRASS,
      T.DARK_GRASS,
      T.FOREST,
      T.CONIFER,
      T.MOUNTAIN,
      T.SNOW,
      T.HILL,
      T.MOOR,
      T.FARM,
      T.CITY,
      T.RIVER,
    ]),
    isBase: true,
  },
  // Grass variation — breaks up flat green
  {
    id: "grass-darkgrass",
    png: "ts-grass-darkgrass.png",
    json: "ts-grass-darkgrass.json",
    targets: new Set([T.DARK_GRASS]),
  },
  {
    id: "grass-forest",
    png: "ts-grass-forest.png",
    json: "ts-grass-forest.json",
    targets: new Set([T.FOREST]),
  },
  {
    id: "grass-conifer",
    png: "ts-grass-conifer.png",
    json: "ts-grass-conifer.json",
    targets: new Set([T.CONIFER]),
  },
  {
    id: "grass-deciduous",
    png: "ts-grass-deciduous.png",
    json: "ts-grass-deciduous.json",
    targets: new Set([T.FOREST]),
  }, // Alternative forest style
  {
    id: "grass-mountain",
    png: "ts-grass-mountain.png",
    json: "ts-grass-mountain.json",
    targets: new Set([T.MOUNTAIN]),
  },
  {
    id: "grass-snow",
    png: "ts-grass-snow.png",
    json: "ts-grass-snow.json",
    targets: new Set([T.SNOW]),
  },
  {
    id: "grass-hill",
    png: "ts-grass-hill.png",
    json: "ts-grass-hill.json",
    targets: new Set([T.HILL]),
  },
  {
    id: "grass-moorland",
    png: "ts-grass-moorland.png",
    json: "ts-grass-moorland.json",
    targets: new Set([T.MOOR]),
  },
  {
    id: "grass-farmland",
    png: "ts-grass-farmland.png",
    json: "ts-grass-farmland.json",
    targets: new Set([T.FARM]),
  },
  {
    id: "grass-wetland",
    png: "ts-grass-wetland.png",
    json: "ts-grass-wetland.json",
    targets: new Set([T.RIVER]),
  }, // Wetland for river edges
  {
    id: "grass-city",
    png: "ts-grass-city.png",
    json: "ts-grass-city.json",
    targets: new Set([T.CITY]),
  },
  {
    id: "grass-river",
    png: "ts-grass-river.png",
    json: "ts-grass-river.json",
    targets: new Set([T.RIVER]),
  },
  {
    id: "forest-mountain",
    png: "ts-forest-mountain.png",
    json: "ts-forest-mountain.json",
    targets: new Set([T.MOUNTAIN, T.SNOW]),
  },
]

// ─── Classify pixel color to terrain ───
function classifyColor(r: number, g: number, b: number): number {
  // Transparent or very dark → deep ocean
  if (r < 25 && g < 35 && b < 50) return T.DEEP

  // Blue dominant → ocean
  if (b > r + 30 && b > g + 10) {
    if (b > 140 && g < 100) return T.DEEP
    if (g > 80 && b > 100) return T.SHALLOW
    return T.DEEP
  }

  // White/very light → snow or cloud (treat as snow on land context)
  if (r > 190 && g > 190 && b > 190) return T.SNOW

  // Brown dominant → mountain
  if (r > 100 && g > 60 && b < 70 && r > g) return T.MOUNTAIN
  if (r > 80 && g > 60 && g < 90 && b < 60) return T.HILL

  // Grey-brown → moorland
  if (r > 90 && g > 80 && b > 60 && r < 140 && Math.abs(r - g) < 30 && b < g) return T.MOOR

  // Dark green → forest
  if (g > 50 && g > r && g > b && r < 70 && g < 110) return T.FOREST
  if (g > 40 && g > r && r < 50 && b < 50) return T.CONIFER

  // Medium green → dark grass or regular grass
  if (g > 100 && g > r && g > b) {
    if (r < 80) return g > 140 ? T.GRASS : T.DARK_GRASS
    return T.GRASS
  }

  // Yellow-green → farmland
  if (r > 100 && g > 100 && b < 80 && g > b) return T.FARM

  // Default: if greenish, grass; if bluish, ocean
  if (g > r && g > b) return T.GRASS
  if (b > r) return T.DEEP
  return T.GRASS
}

// Simple deterministic hash for variety
function hash(a: number, b: number): number {
  return ((a * 73 + b * 137 + a * b * 53 + 7919) % 1000) / 1000
}

// ─── Build terrain grid from image ───
function buildGridFromImage(imgData: ImageData): number[][] {
  const grid: number[][] = Array.from({ length: GRID }, () => Array(GRID).fill(T.DEEP))

  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const sx = Math.floor((col + 0.5) * CELL_SRC)
      const sy = Math.floor((row + 0.5) * CELL_SRC)
      const i = (sy * SRC_SIZE + sx) * 4
      let terrain = classifyColor(imgData.data[i], imgData.data[i + 1], imgData.data[i + 2])

      // Add variety to plain grass — ~40% becomes DARK_GRASS for texture
      if (terrain === T.GRASS) {
        const h = hash(row, col)
        if (h < 0.25) terrain = T.DARK_GRASS
        else if (h < 0.32) terrain = T.FARM
        else if (h < 0.37) terrain = T.HILL
      }

      grid[row][col] = terrain
    }
  }

  // ── Coastline cleanup: remove stray land pixels ──
  // Pass 1: Any land cell with 5+ ocean neighbors → ocean (removes tiny islands/noise)
  const isOcean = (r: number, c: number) =>
    r < 0 || r >= GRID || c < 0 || c >= GRID || grid[r][c] === T.DEEP || grid[r][c] === T.SHALLOW
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (grid[r][c] === T.DEEP || grid[r][c] === T.SHALLOW) continue
      let oceanCount = 0
      for (const [dr, dc] of [
        [-1, -1],
        [-1, 0],
        [-1, 1],
        [0, -1],
        [0, 1],
        [1, -1],
        [1, 0],
        [1, 1],
      ]) {
        if (isOcean(r + dr, c + dc)) oceanCount++
      }
      if (oceanCount >= 6) grid[r][c] = T.SHALLOW
    }
  }

  // Pass 2: Any ocean cell surrounded by mostly land → shallow (fill holes)
  for (let r = 1; r < GRID - 1; r++) {
    for (let c = 1; c < GRID - 1; c++) {
      if (grid[r][c] !== T.DEEP && grid[r][c] !== T.SHALLOW) continue
      let landCount = 0
      for (const [dr, dc] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        if (!isOcean(r + dr, c + dc)) landCount++
      }
      if (landCount >= 3) grid[r][c] = T.GRASS
    }
  }

  return grid
}

// ─── Wang tile helpers ───
interface TsMeta {
  tiles: {
    corners: { NW: string; NE: string; SW: string; SE: string }
    bounding_box: { x: number; y: number }
  }[]
}

function buildLookup(meta: TsMeta): Map<number, { x: number; y: number }> {
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

function buildVertexGrid(grid: number[][], targets: Set<number>): number[][] {
  const vg: number[][] = Array.from({ length: GRID + 1 }, () => Array(GRID + 1).fill(0))
  const chk = (r: number, c: number) =>
    r >= 0 && r < GRID && c >= 0 && c < GRID && targets.has(grid[r][c]) ? 1 : 0
  for (let vr = 0; vr <= GRID; vr++)
    for (let vc = 0; vc <= GRID; vc++)
      vg[vr][vc] = Math.max(chk(vr - 1, vc - 1), chk(vr - 1, vc), chk(vr, vc - 1), chk(vr, vc))
  return vg
}

function wangIdx(vg: number[][], r: number, c: number): number {
  return vg[r][c] * 8 + vg[r][c + 1] * 4 + vg[r + 1][c] * 2 + vg[r + 1][c + 1]
}

// ─── Render terrain (2-pass: base then overlays) ───
function renderTerrain(
  grid: number[][],
  layers: {
    def: TsDef
    img: HTMLImageElement
    lookup: Map<number, { x: number; y: number }>
    vg: number[][]
  }[]
): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = MAP_PX
  canvas.height = MAP_PX
  const ctx = canvas.getContext("2d")!
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = "#0c1e3a"
  ctx.fillRect(0, 0, MAP_PX, MAP_PX)

  // PASS 1: Base layers (ocean depth + coastline + grass)
  // These draw ALL cells including idx=0
  for (const layer of layers) {
    if (!layer.def.isBase) continue
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const idx = wangIdx(layer.vg, r, c)
        const src = layer.lookup.get(idx)
        if (!src) continue
        ctx.drawImage(layer.img, src.x, src.y, 32, 32, c * TILE_PX, r * TILE_PX, TILE_PX, TILE_PX)
      }
    }
  }

  // PASS 2: Feature overlays — ONLY draw pure feature tiles (no border transitions)
  // Wang idx 15 = all 4 corners are "upper" = fully inside the feature
  // This avoids mismatched border colors between tilesets
  // The grass base underneath shows through naturally at edges
  for (const layer of layers) {
    if (layer.def.isBase) continue
    const fullTile = layer.lookup.get(15) // Pure feature tile (no grass border)
    if (!fullTile) continue
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        // Only draw if this cell IS the target terrain
        const cellTerrain = grid[r][c]
        if (!layer.def.targets.has(cellTerrain)) continue
        ctx.drawImage(
          layer.img,
          fullTile.x,
          fullTile.y,
          32,
          32,
          c * TILE_PX,
          r * TILE_PX,
          TILE_PX,
          TILE_PX
        )
      }
    }
  }

  return canvas
}

// ─── Stadiums ───
interface Stadium {
  name: string
  team: string
  x: number
  y: number
  size: "large" | "medium"
  capacity: string
}
const STADIUMS_RAW = [
  {
    name: "Celtic Park",
    team: "Celtic",
    x: 670,
    y: 550,
    size: "large" as const,
    capacity: "60,411",
  },
  { name: "Ibrox", team: "Rangers", x: 620, y: 570, size: "medium" as const, capacity: "50,817" },
  {
    name: "St James' Park",
    team: "Newcastle",
    x: 830,
    y: 780,
    size: "large" as const,
    capacity: "52,305",
  },
  {
    name: "Anfield",
    team: "Liverpool",
    x: 680,
    y: 930,
    size: "large" as const,
    capacity: "61,276",
  },
  {
    name: "Old Trafford",
    team: "Man United",
    x: 730,
    y: 920,
    size: "large" as const,
    capacity: "74,310",
  },
  { name: "Etihad", team: "Man City", x: 760, y: 940, size: "large" as const, capacity: "53,400" },
  {
    name: "Elland Road",
    team: "Leeds",
    x: 820,
    y: 910,
    size: "medium" as const,
    capacity: "37,890",
  },
  {
    name: "Villa Park",
    team: "Aston Villa",
    x: 770,
    y: 1060,
    size: "medium" as const,
    capacity: "42,640",
  },
  {
    name: "Principality Stadium",
    team: "Wales",
    x: 600,
    y: 1130,
    size: "large" as const,
    capacity: "73,931",
  },
  { name: "Wembley", team: "England", x: 870, y: 1210, size: "large" as const, capacity: "90,000" },
  {
    name: "Emirates",
    team: "Arsenal",
    x: 900,
    y: 1230,
    size: "large" as const,
    capacity: "60,704",
  },
  {
    name: "Stamford Bridge",
    team: "Chelsea",
    x: 880,
    y: 1260,
    size: "medium" as const,
    capacity: "40,341",
  },
  {
    name: "Tottenham Stadium",
    team: "Spurs",
    x: 920,
    y: 1200,
    size: "large" as const,
    capacity: "62,850",
  },
  {
    name: "St Mary's",
    team: "Southampton",
    x: 790,
    y: 1340,
    size: "medium" as const,
    capacity: "32,384",
  },
]
const STADIUMS: Stadium[] = STADIUMS_RAW.map((s) => ({
  ...s,
  x: (s.x / SRC_SIZE) * MAP_PX,
  y: (s.y / SRC_SIZE) * MAP_PX,
}))

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

interface GS {
  px: number
  py: number
  dir: string
  camX: number
  camY: number
  keys: Set<string>
  zoom: number
}

// ═══════════════════════════════
// Component
// ═══════════════════════════════
export function ImageMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [nearby, setNearby] = useState<Stadium | null>(null)
  const terrainRef = useRef<HTMLCanvasElement | null>(null)
  const gridRef = useRef<number[][] | null>(null)
  const imgs = useRef<Record<string, HTMLImageElement>>({})
  const gs = useRef<GS>({
    px: (870 / SRC_SIZE) * MAP_PX,
    py: (1210 / SRC_SIZE) * MAP_PX,
    dir: "south",
    camX: (870 / SRC_SIZE) * MAP_PX,
    camY: (1210 / SRC_SIZE) * MAP_PX,
    keys: new Set(),
    zoom: 1.8,
  })

  const isLand = useCallback((px: number, py: number): boolean => {
    const grid = gridRef.current
    if (!grid) return true
    const c = Math.floor(px / TILE_PX),
      r = Math.floor(py / TILE_PX)
    if (r < 0 || r >= GRID || c < 0 || c >= GRID) return false
    const t = grid[r][c]
    return t !== T.DEEP && t !== T.SHALLOW && t !== T.RIVER
  }, [])

  // Load everything
  useEffect(() => {
    const spriteKeys: Record<string, string> = {
      "stadium-red": "/map/objects/hex-stadium-red.png",
      "stadium-blue": "/map/objects/hex-stadium-blue.png",
      "stadium-wembley": "/map/objects/hex-stadium-wembley.png",
    }
    for (const d of DIRS) spriteKeys[`c-${d}`] = `/map/character/${d}.png`

    let count = 0
    const tsImgs: Record<string, HTMLImageElement> = {}
    const tsMetas: Record<string, TsMeta> = {}
    const total = 1 + TILESETS.length * 2 + Object.keys(spriteKeys).length

    const checkDone = () => {
      if (++count < total) return
      const grid = gridRef.current
      if (!grid) {
        setLoaded(true)
        return
      }

      // Build layers
      const layers: {
        def: TsDef
        img: HTMLImageElement
        lookup: Map<number, { x: number; y: number }>
        vg: number[][]
      }[] = []
      for (const def of TILESETS) {
        const img = tsImgs[def.id]
        const meta = tsMetas[def.id]
        if (!img || !meta) continue
        layers.push({ def, img, lookup: buildLookup(meta), vg: buildVertexGrid(grid, def.targets) })
      }

      terrainRef.current = renderTerrain(grid, layers)
      setLoaded(true)
    }

    // Load source image → build terrain grid
    const srcImg = new Image()
    srcImg.onload = () => {
      const c = document.createElement("canvas")
      c.width = SRC_SIZE
      c.height = SRC_SIZE
      const ctx = c.getContext("2d")!
      ctx.drawImage(srcImg, 0, 0, SRC_SIZE, SRC_SIZE)
      const imgData = ctx.getImageData(0, 0, SRC_SIZE, SRC_SIZE)
      gridRef.current = buildGridFromImage(imgData)
      checkDone()
    }
    srcImg.onerror = () => checkDone()
    srcImg.src = "/map/uk-base.png"

    // Load tilesets
    for (const def of TILESETS) {
      const img = new Image()
      img.onload = () => {
        tsImgs[def.id] = img
        checkDone()
      }
      img.onerror = () => checkDone()
      img.src = `/map/tiles/${def.png}`

      fetch(`/map/tiles/${def.json}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (j?.tileset_data?.tiles) tsMetas[def.id] = j.tileset_data
          else if (j?.tiles) tsMetas[def.id] = j
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

  // Keyboard
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
      gs.current.zoom = Math.max(0.3, Math.min(4, gs.current.zoom - e.deltaY * 0.002))
    }
    window.addEventListener("keydown", kd)
    window.addEventListener("keyup", ku)
    window.addEventListener("wheel", wh, { passive: false })
    return () => {
      window.removeEventListener("keydown", kd)
      window.removeEventListener("keyup", ku)
      window.removeEventListener("wheel", wh)
    }
  }, [isLand])

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
      if (++tick > 15) {
        tick = 0
        let cl: Stadium | null = null,
          md = 60
        for (const st of STADIUMS) {
          const d = Math.sqrt((st.x - s.px) ** 2 + (st.y - s.py) ** 2)
          if (d < md) {
            md = d
            cl = st
          }
        }
        setNearby(cl)
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
      if (terrainRef.current) ctx.drawImage(terrainRef.current, 0, 0)

      // Stadiums
      for (const st of STADIUMS) {
        const ik =
          st.name === "Wembley"
            ? "stadium-wembley"
            : [
                  "Anfield",
                  "Old Trafford",
                  "St James' Park",
                  "Villa Park",
                  "Emirates",
                  "Principality Stadium",
                ].includes(st.name)
              ? "stadium-red"
              : "stadium-blue"
        const img = imgs.current[ik]
        const sz = st.size === "large" ? 36 : 28
        if (img) ctx.drawImage(img, st.x - sz / 2, st.y - sz + 6, sz, sz)
        ctx.imageSmoothingEnabled = true
        ctx.font = "bold 8px sans-serif"
        ctx.textAlign = "center"
        ctx.strokeStyle = "#000"
        ctx.lineWidth = 2.5
        ctx.strokeText(st.name, st.x, st.y - sz)
        ctx.fillStyle = "#fff"
        ctx.fillText(st.name, st.x, st.y - sz)
        ctx.font = "7px sans-serif"
        ctx.fillStyle = "#ffd700"
        ctx.strokeText(st.team, st.x, st.y - sz + 10)
        ctx.fillText(st.team, st.x, st.y - sz + 10)
        ctx.imageSmoothingEnabled = false
      }

      // Character
      const ci = imgs.current[`c-${s.dir}`]
      if (ci) ctx.drawImage(ci, s.px - 16, s.py - 28, 32, 32)
      else {
        ctx.fillStyle = "#f44"
        ctx.beginPath()
        ctx.arc(s.px, s.py - 4, 5, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()

      // Minimap
      const mw = 110,
        mh = 110,
        mx = W - mw - 14,
        my = 14
      ctx.fillStyle = "rgba(0,0,0,0.5)"
      ctx.beginPath()
      ctx.roundRect(mx - 3, my - 3, mw + 6, mh + 6, 6)
      ctx.fill()
      if (terrainRef.current) ctx.drawImage(terrainRef.current, mx, my, mw, mh)
      ctx.fillStyle = "#0f8"
      ctx.beginPath()
      ctx.arc(mx + (s.px / MAP_PX) * mw, my + (s.py / MAP_PX) * mh, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#f44"
      for (const st of STADIUMS) {
        ctx.beginPath()
        ctx.arc(mx + (st.x / MAP_PX) * mw, my + (st.y / MAP_PX) * mh, 1.5, 0, Math.PI * 2)
        ctx.fill()
      }

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener("resize", resize)
    }
  }, [loaded, isLand])

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#0c1e3a]">
      {!loaded && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0c1e3a] text-white">
          <div className="mb-2 text-2xl font-bold">Loading UK Stadium Map...</div>
          <div className="text-sm opacity-60">Analyzing terrain & assembling tiles...</div>
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

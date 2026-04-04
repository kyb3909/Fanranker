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

// ─── Craftpix tile coordinates (16x16 tiles in spritesheets) ───
// ground_grasss.png (336x256): row/col in 16px grid
const CX = {
  // 잔디 바닥 타일 (ground_grasss.png 우하단 영역)
  grass: [
    { x: 0, y: 192 }, // 잔디 변형 1
    { x: 16, y: 192 }, // 잔디 변형 2
    { x: 32, y: 192 }, // 잔디 변형 3
    { x: 0, y: 208 }, // 잔디 변형 4
  ],
  // 흙 바닥 (ground_grasss.png 상단)
  dirt: { x: 80, y: 0 },
  // 밝은 잔디
  lightGrass: { x: 0, y: 128 },
}

// Water_coasts.png (272x576): 물/해안 타일
const WX = {
  // 깊은 바다 (단색 물 타일)
  deepWater: { x: 0, y: 0 },
  // 얕은 바다
  shallowWater: { x: 16, y: 0 },
}

// 해시 기반 타일 변형 선택 (같은 지형이라도 약간씩 다른 타일)
function tileVariant(r: number, c: number, count: number): number {
  return (r * 73 + c * 137 + 7919) % count
}

// ─── Render terrain (3-pass: craftpix base → Wang transitions → object overlays) ───
function renderTerrain(
  grid: number[][],
  layers: {
    def: TsDef
    img: HTMLImageElement
    lookup: Map<number, { x: number; y: number }>
    vg: number[][]
  }[],
  craftpixImgs?: {
    ground?: HTMLImageElement
    water?: HTMLImageElement
    trees?: HTMLImageElement
    details?: HTMLImageElement
  }
): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = MAP_PX
  canvas.height = MAP_PX
  const ctx = canvas.getContext("2d")!
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = "#0c1e3a"
  ctx.fillRect(0, 0, MAP_PX, MAP_PX)

  // PASS 0: Craftpix base textures (바닥 채우기)
  if (craftpixImgs) {
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const terrain = grid[r][c]
        const dx = c * TILE_PX
        const dy = r * TILE_PX

        if (terrain === T.DEEP || terrain === T.SHALLOW) {
          // 바다: craftpix 물 타일
          if (craftpixImgs.water) {
            const src = terrain === T.DEEP ? WX.deepWater : WX.shallowWater
            ctx.drawImage(craftpixImgs.water, src.x, src.y, 16, 16, dx, dy, TILE_PX, TILE_PX)
          }
        } else if (terrain === T.RIVER) {
          // 강: 얕은 물
          if (craftpixImgs.water) {
            ctx.drawImage(
              craftpixImgs.water,
              WX.shallowWater.x,
              WX.shallowWater.y,
              16,
              16,
              dx,
              dy,
              TILE_PX,
              TILE_PX
            )
          }
        } else {
          // 육지: craftpix 잔디 타일 (변형 적용)
          if (craftpixImgs.ground) {
            if (terrain === T.FARM || terrain === T.MOOR) {
              // 농지/황무지: 흙 타일
              ctx.drawImage(
                craftpixImgs.ground,
                CX.dirt.x,
                CX.dirt.y,
                16,
                16,
                dx,
                dy,
                TILE_PX,
                TILE_PX
              )
            } else {
              // 일반 잔디 (변형)
              const v = tileVariant(r, c, CX.grass.length)
              const src = CX.grass[v]
              ctx.drawImage(craftpixImgs.ground, src.x, src.y, 16, 16, dx, dy, TILE_PX, TILE_PX)
            }
          }
        }
      }
    }
  }

  // PASS 1: Wang base layers (ocean depth + coastline transitions)
  for (const layer of layers) {
    if (!layer.def.isBase) continue
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const idx = wangIdx(layer.vg, r, c)
        if (craftpixImgs && idx === 0) continue // craftpix가 바닥을 채웠으면 빈 타일 스킵
        if (craftpixImgs && idx === 15) continue // 완전 내부 타일도 스킵 (craftpix가 처리)
        const src = layer.lookup.get(idx)
        if (!src) continue
        ctx.drawImage(layer.img, src.x, src.y, 32, 32, c * TILE_PX, r * TILE_PX, TILE_PX, TILE_PX)
      }
    }
  }

  // PASS 2: Wang feature overlays (forest, mountain textures at edges)
  for (const layer of layers) {
    if (layer.def.isBase) continue
    const fullTile = layer.lookup.get(15)
    if (!fullTile) continue
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
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

  // PASS 3: Craftpix object overlays (나무, 바위)
  if (craftpixImgs?.trees) {
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const terrain = grid[r][c]
        const dx = c * TILE_PX
        const dy = r * TILE_PX

        if (terrain === T.FOREST || terrain === T.CONIFER) {
          // 숲: 나무 스프라이트 (Trees_rocks.png에서 작은 나무)
          // 나무는 크므로 일부 셀에만 배치 (밀도 조절)
          if (tileVariant(r, c, 4) === 0) {
            // 작은 나무 (Trees_rocks.png 상단, ~32x32 영역)
            const treeX = tileVariant(r, c, 3) * 64
            ctx.drawImage(
              craftpixImgs.trees,
              treeX,
              0,
              64,
              64,
              dx - TILE_PX,
              dy - TILE_PX * 2,
              TILE_PX * 3,
              TILE_PX * 3
            )
          }
        } else if (terrain === T.MOUNTAIN || terrain === T.HILL) {
          // 산/언덕: 바위 스프라이트
          if (tileVariant(r, c, 5) === 0) {
            const rockX = 0
            const rockY = 256 + tileVariant(r, c, 2) * 64
            ctx.drawImage(
              craftpixImgs.trees,
              rockX,
              rockY,
              64,
              64,
              dx - TILE_PX / 2,
              dy - TILE_PX,
              TILE_PX * 2,
              TILE_PX * 2
            )
          }
        }
      }
    }
  }

  // PASS 4: Craftpix detail overlays (꽃, 풀)
  if (craftpixImgs?.details) {
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const terrain = grid[r][c]
        if (terrain !== T.GRASS && terrain !== T.DARK_GRASS) continue
        // 드물게 꽃/풀 배치
        if (tileVariant(r, c, 12) !== 0) continue
        const dx = c * TILE_PX
        const dy = r * TILE_PX
        const detailIdx = tileVariant(r + 1, c + 1, 6)
        const detailX = (detailIdx % 6) * 32
        const detailY = 0
        ctx.drawImage(craftpixImgs.details, detailX, detailY, 32, 32, dx, dy, TILE_PX, TILE_PX)
      }
    }
  }

  return canvas
}

// ─── Stadiums (props 기반) ───
export interface StadiumPin {
  team_id: string
  name: string
  team_name: string
  pin_x: number // 0~100%
  pin_y: number // 0~100%
  color: string
  level: number
  is_open: boolean
}

interface MappedStadium extends StadiumPin {
  x: number
  y: number
}

function mapStadiums(pins: StadiumPin[]): MappedStadium[] {
  return pins.map((p) => ({
    ...p,
    x: (p.pin_x / 100) * MAP_PX,
    y: (p.pin_y / 100) * MAP_PX,
  }))
}

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
interface ImageMapProps {
  stadiums: StadiumPin[]
  onStadiumClick?: (teamId: string, isOpen: boolean) => void
}

export function ImageMap({ stadiums, onStadiumClick }: ImageMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [nearby, setNearby] = useState<MappedStadium | null>(null)
  const terrainRef = useRef<HTMLCanvasElement | null>(null)
  const gridRef = useRef<number[][] | null>(null)
  const imgs = useRef<Record<string, HTMLImageElement>>({})
  const mappedRef = useRef<MappedStadium[]>([])

  // 경기장 매핑 (props 변경 시 갱신)
  useEffect(() => {
    mappedRef.current = mapStadiums(stadiums)
  }, [stadiums])

  // 첫 번째 OPEN 경기장 위치로 초기 카메라, 없으면 맵 중앙
  const firstOpen = stadiums.find((s) => s.is_open)
  const startX = firstOpen ? (firstOpen.pin_x / 100) * MAP_PX : MAP_PX / 2
  const startY = firstOpen ? (firstOpen.pin_y / 100) * MAP_PX : MAP_PX / 2

  const gs = useRef<GS>({
    px: startX,
    py: startY,
    dir: "south",
    camX: startX,
    camY: startY,
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

    // Craftpix 스프라이트시트 추가 로드
    const craftpixKeys: Record<string, string> = {
      "cx-ground": "/map/craftpix/PNG/ground_grasss.png",
      "cx-water": "/map/craftpix/PNG/Water_coasts.png",
      "cx-trees": "/map/craftpix/PNG/Trees_rocks.png",
      "cx-details": "/map/craftpix/PNG/Details.png",
    }

    let count = 0
    const tsImgs: Record<string, HTMLImageElement> = {}
    const tsMetas: Record<string, TsMeta> = {}
    const cxImgs: Record<string, HTMLImageElement> = {}
    const total =
      1 + TILESETS.length * 2 + Object.keys(spriteKeys).length + Object.keys(craftpixKeys).length

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

      // Craftpix 이미지를 renderTerrain에 전달
      const craftpixImgs = {
        ground: cxImgs["cx-ground"],
        water: cxImgs["cx-water"],
        trees: cxImgs["cx-trees"],
        details: cxImgs["cx-details"],
      }

      terrainRef.current = renderTerrain(grid, layers, craftpixImgs)
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

    // Load craftpix spritesheets
    for (const [key, src] of Object.entries(craftpixKeys)) {
      const img = new Image()
      img.onload = img.onerror = () => {
        if (img.complete && img.naturalWidth > 0) cxImgs[key] = img
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
        let cl: MappedStadium | null = null,
          md = 60
        for (const st of mappedRef.current) {
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

      // Stadiums (DB 기반)
      for (const st of mappedRef.current) {
        const sz = st.is_open ? 36 : 28

        if (st.is_open) {
          // OPEN 경기장: 빛나는 효과 + 아이콘
          const pulse = 0.15 * Math.sin(Date.now() / 400)
          ctx.globalAlpha = 0.3 + pulse
          ctx.fillStyle = st.color === "#FFFFFF" ? "#FFD700" : st.color
          ctx.beginPath()
          ctx.arc(st.x, st.y - sz / 2, sz * 0.8, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 1

          const img = imgs.current["stadium-wembley"] || imgs.current["stadium-red"]
          if (img) ctx.drawImage(img, st.x - sz / 2, st.y - sz + 6, sz, sz)
        } else {
          // 부지: 회색 반투명
          ctx.globalAlpha = 0.5
          ctx.fillStyle = "#666"
          ctx.beginPath()
          ctx.arc(st.x, st.y - 8, 10, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = "#8B7355"
          ctx.fillRect(st.x - 8, st.y - 6, 16, 12)
          ctx.globalAlpha = 1
        }

        // 라벨
        ctx.imageSmoothingEnabled = true
        ctx.font = "bold 8px sans-serif"
        ctx.textAlign = "center"
        ctx.strokeStyle = "#000"
        ctx.lineWidth = 2.5
        const label = st.name
        ctx.strokeText(label, st.x, st.y - sz - 2)
        ctx.fillStyle = st.is_open ? "#fff" : "#aaa"
        ctx.fillText(label, st.x, st.y - sz - 2)

        // 팀명 / 상태
        ctx.font = "7px sans-serif"
        ctx.fillStyle = st.is_open ? "#ffd700" : "#888"
        const sub = st.is_open ? st.team_name : "부지"
        ctx.strokeText(sub, st.x, st.y - sz + 8)
        ctx.fillText(sub, st.x, st.y - sz + 8)
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
      for (const st of mappedRef.current) {
        ctx.fillStyle = st.is_open ? "#ffd700" : "#888"
        ctx.beginPath()
        ctx.arc(
          mx + (st.x / MAP_PX) * mw,
          my + (st.y / MAP_PX) * mh,
          st.is_open ? 2.5 : 1.5,
          0,
          Math.PI * 2
        )
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
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <span>🏴󠁧󠁢󠁥󠁮󠁧󠁿</span> England
        </h2>
        <p className="mt-1 text-xs opacity-60">
          WASD / Arrows · Scroll to zoom · Click stadium to enter
        </p>
      </div>
      {nearby && (
        <button
          onClick={() => onStadiumClick?.(nearby.team_id, nearby.is_open)}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-xl border border-yellow-500/50 bg-black/80 px-6 py-4 text-center text-white backdrop-blur-sm transition-transform hover:scale-105 active:scale-95"
        >
          <div
            className={`text-xs font-semibold tracking-wider uppercase ${nearby.is_open ? "text-yellow-400" : "text-gray-400"}`}
          >
            {nearby.is_open ? "Stadium Nearby — Enter" : "Construction Site"}
          </div>
          <div className="mt-1 text-xl font-bold">{nearby.name}</div>
          <div className="text-sm opacity-80">
            {nearby.team_name} {nearby.is_open ? "" : "· 건설 대기 중"}
          </div>
        </button>
      )}
    </div>
  )
}

/**
 * Natural Earth UK 폴리곤 → Tiled .tmj 자동 생성 스크립트.
 *
 * 영국 본섬 + 북아일랜드 폴리곤을 grid에 ray-casting 으로 land/sea 판정,
 * 주요 도시 좌표를 grid 셀에 매핑해 entrance object 생성, Tiled JSON 출력.
 *
 * 실행: pnpm exec tsx scripts/generate-uk-map.ts
 * 출력: public/map/uk-auto.json
 */

import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import booleanPointInPolygon from "@turf/boolean-point-in-polygon"
import { point } from "@turf/helpers"

// GeoJSON types — @turf/helpers 의 type re-export 가 깔끔치 않아 직접 정의
interface Polygon {
  type: "Polygon"
  coordinates: number[][][]
}
interface MultiPolygon {
  type: "MultiPolygon"
  coordinates: number[][][][]
}
interface Feature<G> {
  type: "Feature"
  properties: Record<string, unknown> | null
  geometry: G
}

// ---------- 설정 ----------
const GRID_W = 160
const GRID_H = 240
const TILE_SIZE = 16
const COUNTRIES_GEOJSON = "public/map/data/ne_countries.geojson"
const OUTPUT_JSON = "public/map/uk-auto.json"

// 타일 ID 매핑 (LimeZu Modern Exteriors 16x16, firstgid=1 기준)
// 184       = 잔디 (default)
// GRASS_TILES = Grass_1_1~22 변종 (find-tile-ids.ts 자동 검색)
// 1540      = Deep_Water_1_9 plain (강·바다 공용 — 진한 네이비)
// Deep_Water 3×3 autotile (가운데=plain, 가장자리 8 = 잔디↔물 경계)
const TILE_GRASS = 184
const TILE_RIVER = 1540
const GRASS_TILES = [
  228, 229, 231, 407, 583, 581, 580, 404, 232, 235, 760, 2176, 2000, 2001, 2177, 2353, 2529, 2528,
  2352, 409, 405,
] // 21 variants (Grass_1_11 missing)

// Deterministic PRNG (Mulberry32) — 재실행 시 동일 패턴 보장
function makeRng(seed: number): () => number {
  let s = seed
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Deep_Water_1_1~9 ID (3×3 autotile). find-tile-ids.ts 로 자동 검색.
const SEA = {
  topLeft: 1363, // 1_1
  top: 1364, // 1_2
  topRight: 1365, // 1_3
  right: 1541, // 1_4
  bottomRight: 1717, // 1_5
  bottom: 1716, // 1_6
  bottomLeft: 1715, // 1_7
  left: 1539, // 1_8
  plain: 1540, // 1_9
} as const

/**
 * sea cell의 4변 인접 land 패턴 → autotile ID.
 * grid[y][x] = true(land) / false(sea).
 *
 * 9-tile autotile은 4변 인접 (N/E/S/W) 으로 충분히 표현됨.
 * 3변+ 인접 = 좁은 inlet → plain 폴백 (작은 호수는 잘 안 생김).
 */
function autotileSeaCell(grid: boolean[][], x: number, y: number): number {
  const isLand = (cx: number, cy: number) =>
    cx >= 0 && cx < GRID_W && cy >= 0 && cy < GRID_H && grid[cy][cx]
  const N = isLand(x, y - 1)
  const E = isLand(x + 1, y)
  const S = isLand(x, y + 1)
  const W = isLand(x - 1, y)
  const count = (N ? 1 : 0) + (E ? 1 : 0) + (S ? 1 : 0) + (W ? 1 : 0)

  if (count === 0) return SEA.plain
  if (count >= 3) return SEA.plain // 좁은 inlet 폴백

  if (count === 1) {
    if (N) return SEA.top
    if (E) return SEA.right
    if (S) return SEA.bottom
    return SEA.left
  }

  // count === 2: 두 변 인접 (코너) 또는 마주보는 변 (해협)
  if (N && W) return SEA.topLeft
  if (N && E) return SEA.topRight
  if (S && E) return SEA.bottomRight
  if (S && W) return SEA.bottomLeft
  // N+S 또는 E+W = 좁은 해협 → plain
  return SEA.plain
}

// 영국 주요 강 — Natural Earth 데이터에 부족해서 수동 hardcode (lon, lat).
// Source → 주요 도시 → mouth 순. mouth는 sea cell 까지 닿도록 살짝 외곽으로.
const RIVERS: Array<{ name: string; points: [number, number][]; width: number }> = [
  {
    name: "Thames",
    width: 0, // 폭 1 cell — 모든 강 통일
    points: [
      [-1.78, 51.69], // Source (Cotswolds)
      [-1.26, 51.75], // Oxford
      [-1.0, 51.46], // Reading
      [-0.6, 51.48], // Windsor
      [-0.12, 51.5], // London
      [0.4, 51.45], // Lower Thames
      [1.5, 51.45], // North Sea (sea cell 도달)
    ],
  },
  {
    name: "Severn",
    width: 0, // 폭 1 cell — Thames 다음으로 큼 단 시각상 가늘게
    points: [
      [-3.78, 52.55], // Source (Wales)
      [-2.75, 52.71], // Shrewsbury
      [-2.22, 52.19], // Worcester
      [-2.55, 51.86], // Gloucester
      [-2.95, 51.5], // Bristol
      [-3.5, 51.3], // Bristol Channel (sea)
    ],
  },
  {
    name: "Trent",
    width: 0,
    points: [
      [-2.04, 53.05], // Source (Staffordshire)
      [-1.63, 52.8], // Burton
      [-1.15, 52.96], // Nottingham
      [-0.5, 53.7], // Humber
      [0.5, 53.65], // North Sea (sea)
    ],
  },
  {
    name: "Tyne",
    width: 0,
    points: [
      [-2.3, 54.97], // Source (Pennines)
      [-1.62, 54.97], // Newcastle
      [-1.0, 55.0], // North Sea (sea)
    ],
  },
  {
    name: "Tweed",
    width: 0,
    points: [
      [-3.34, 55.46], // Source (Tweedsmuir)
      [-3.18, 55.65], // Peebles
      [-1.7, 55.77], // North Sea (sea)
    ],
  },
]

// EPL Big Six + Wembley — 시각적 분리 우선 (지리 정확성 X). 큰 건물 들어갈 공간.
// gx/gy = grid 직접 좌표. 런던 4개 cluster 살짝 분산, 맨체스터 2개 분리.
const STADIUMS: Array<{
  teamId: string
  label: string
  stadium: string
  gx: number
  gy: number
}> = [
  // 런던 4개: Thames row ~190 기준. 강북 = Tottenham(가장 북) / Wembley(서북) / Arsenal(중앙).
  // 강남 = Chelsea. Tottenham > Arsenal 더 북쪽.
  {
    teamId: "epl_tottenham",
    label: "토트넘",
    stadium: "Tottenham Hotspur Stadium",
    gx: 128,
    gy: 178,
  },
  {
    teamId: "epl_wembley",
    label: "잉글랜드 (웸블리)",
    stadium: "Wembley Stadium",
    gx: 95,
    gy: 185,
  },
  {
    teamId: "epl_arsenal",
    label: "아스날 (에미레이츠)",
    stadium: "Emirates Stadium",
    gx: 115,
    gy: 186,
  },
  {
    teamId: "epl_chelsea",
    label: "첼시 (스탬포드 브리지)",
    stadium: "Stamford Bridge",
    gx: 112,
    gy: 200,
  },
  // 북부 3개
  { teamId: "epl_liverpool", label: "리버풀 (안필드)", stadium: "Anfield", gx: 65, gy: 138 },
  { teamId: "epl_manutd", label: "맨유 (올드 트래포드)", stadium: "Old Trafford", gx: 78, gy: 125 },
  { teamId: "epl_mancity", label: "맨시티 (에티하드)", stadium: "Etihad Stadium", gx: 95, gy: 130 },
]

// ---------- 유틸 ----------
interface CountriesGeoJSON {
  type: "FeatureCollection"
  features: Array<{
    type: "Feature"
    properties: { ISO_A2?: string; ADMIN?: string; NAME?: string }
    geometry: Polygon | MultiPolygon
  }>
}

function loadUKPolygon(): Feature<Polygon> {
  const raw = readFileSync(resolve(COUNTRIES_GEOJSON), "utf-8")
  const data = JSON.parse(raw) as CountriesGeoJSON
  const uk = data.features.find(
    (f) =>
      f.properties.ISO_A2 === "GB" ||
      f.properties.ADMIN === "United Kingdom" ||
      f.properties.NAME === "United Kingdom"
  )
  if (!uk) throw new Error("UK feature not found in Natural Earth GeoJSON")

  // 본섬(Great Britain)만 사용 — 북아일랜드·작은 섬 제거. MultiPolygon → 가장 큰 polygon 1개.
  const geom = uk.geometry
  if (geom.type === "Polygon") {
    return { type: "Feature", properties: uk.properties, geometry: geom }
  }
  let largestRing: number[][] = geom.coordinates[0][0]
  let largestPoly: number[][][] = geom.coordinates[0]
  for (const poly of geom.coordinates) {
    const outerRing = poly[0]
    if (outerRing.length > largestRing.length) {
      largestRing = outerRing
      largestPoly = poly
    }
  }
  console.log(
    `MultiPolygon ${geom.coordinates.length}개 polygon 중 가장 큰 1개 선택 (vertex ${largestRing.length}, 본섬 추정)`
  )
  return {
    type: "Feature",
    properties: uk.properties,
    geometry: { type: "Polygon", coordinates: largestPoly },
  }
}

function getBoundingBox(uk: Feature<Polygon>): {
  minLon: number
  maxLon: number
  minLat: number
  maxLat: number
} {
  let minLon = Infinity
  let maxLon = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  for (const ring of uk.geometry.coordinates) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon
      if (lon > maxLon) maxLon = lon
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }
  }
  return { minLon, maxLon, minLat, maxLat }
}

function rasterizeToGrid(uk: Feature<Polygon>, gridW: number, gridH: number): boolean[][] {
  const { minLon, maxLon, minLat, maxLat } = getBoundingBox(uk)

  // 약간 패딩 (영국이 grid 가장자리에 안 닿게)
  const padFactor = 0.05
  const lonRange = maxLon - minLon
  const latRange = maxLat - minLat
  const padLon = lonRange * padFactor
  const padLat = latRange * padFactor
  const lonStart = minLon - padLon
  const lonEnd = maxLon + padLon
  const latStart = minLat - padLat
  const latEnd = maxLat + padLat

  const cellW = (lonEnd - lonStart) / gridW
  const cellH = (latEnd - latStart) / gridH

  const grid: boolean[][] = []
  for (let y = 0; y < gridH; y++) {
    const row: boolean[] = []
    for (let x = 0; x < gridW; x++) {
      // 셀 중심점
      const lon = lonStart + (x + 0.5) * cellW
      // 위도는 위로 갈수록 +. grid y는 아래로 +. 뒤집기
      const lat = latEnd - (y + 0.5) * cellH
      const isLand = booleanPointInPolygon(point([lon, lat]), uk)
      row.push(isLand)
    }
    grid.push(row)
  }
  return grid
}

function printGridAscii(grid: boolean[][]) {
  console.log(`\nGrid ${grid[0].length}×${grid.length}\n`)
  for (const row of grid) {
    const line = row.map((cell) => (cell ? "█" : "·")).join("")
    console.log(line)
  }
  console.log(`\n육지 셀: ${grid.flat().filter(Boolean).length} / ${grid.length * grid[0].length}`)
}

// ---------- 강 래스터화 (Bresenham) ----------
function bresenhamLine(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
  const points: Array<[number, number]> = []
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  let x = x0
  let y = y0
  while (true) {
    points.push([x, y])
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x += sx
    }
    if (e2 < dx) {
      err += dx
      y += sy
    }
  }
  return points
}

function buildRiverGrid(
  bbox: { minLon: number; maxLon: number; minLat: number; maxLat: number },
  landGrid: boolean[][]
): boolean[][] {
  const riverGrid: boolean[][] = Array.from({ length: GRID_H }, () => new Array(GRID_W).fill(false))

  for (const river of RIVERS) {
    // 1. polyline → 1 cell 폭 cells
    const linePoints: Array<[number, number]> = []
    for (let i = 0; i < river.points.length - 1; i++) {
      const [lon1, lat1] = river.points[i]
      const [lon2, lat2] = river.points[i + 1]
      const a = projectToGrid(lon1, lat1, bbox)
      const b = projectToGrid(lon2, lat2, bbox)
      linePoints.push(...bresenhamLine(a.gx, a.gy, b.gx, b.gy))
    }

    // 2. dilate (radius = river.width) → 폭 (2*width + 1) cell
    const r = river.width
    for (const [cx, cy] of linePoints) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = cx + dx
          const ny = cy + dy
          if (nx >= 0 && nx < GRID_W && ny >= 0 && ny < GRID_H && landGrid[ny][nx]) {
            riverGrid[ny][nx] = true
          }
        }
      }
    }
  }
  return riverGrid
}

// ---------- 좌표 → grid 셀 + sub-pixel ----------
function projectToGrid(
  lon: number,
  lat: number,
  bbox: { minLon: number; maxLon: number; minLat: number; maxLat: number }
): { gx: number; gy: number; px: number; py: number } {
  const padFactor = 0.05
  const lonRange = bbox.maxLon - bbox.minLon
  const latRange = bbox.maxLat - bbox.minLat
  const padLon = lonRange * padFactor
  const padLat = latRange * padFactor
  const lonStart = bbox.minLon - padLon
  const lonEnd = bbox.maxLon + padLon
  const latStart = bbox.minLat - padLat
  const latEnd = bbox.maxLat + padLat
  const cellW = (lonEnd - lonStart) / GRID_W
  const cellH = (latEnd - latStart) / GRID_H

  const fx = (lon - lonStart) / cellW
  const fy = (latEnd - lat) / cellH

  return {
    gx: Math.floor(fx),
    gy: Math.floor(fy),
    px: fx * TILE_SIZE,
    py: fy * TILE_SIZE,
  }
}

// ---------- Tiled .tmj 출력 ----------
interface TiledLayer {
  data?: number[]
  draworder?: string
  height?: number
  id: number
  name: string
  objects?: TiledObject[]
  opacity: number
  type: "tilelayer" | "objectgroup"
  visible: boolean
  width?: number
  x: number
  y: number
}

interface TiledObject {
  height: number
  id: number
  name: string
  opacity: number
  properties?: Array<{ name: string; type: string; value: string | number | boolean }>
  rotation: number
  type: string
  visible: boolean
  width: number
  x: number
  y: number
}

interface TiledMap {
  compressionlevel: number
  height: number
  infinite: boolean
  layers: TiledLayer[]
  nextlayerid: number
  nextobjectid: number
  orientation: string
  renderorder: string
  tiledversion: string
  tileheight: number
  tilesets: Array<Record<string, unknown>>
  tilewidth: number
  type: string
  version: string
  width: number
}

function buildTiledMap(
  grid: boolean[][],
  riverGrid: boolean[][],
  stadiumCells: Array<{
    stadium: (typeof STADIUMS)[number]
    gx: number
    gy: number
    px: number
    py: number
  }>
): TiledMap {
  // background — 육지: 강 cell=river, 그 외=잔디 변종 random / 바다=autotile
  const grassRng = makeRng(2026)
  const backgroundData: number[] = []
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (grid[y][x]) {
        if (riverGrid[y][x]) {
          backgroundData.push(TILE_RIVER)
        } else {
          // 80% default 잔디 + 20% 변종 (subtle texture, 너무 noisy 안 되게)
          if (grassRng() < 0.2) {
            backgroundData.push(GRASS_TILES[Math.floor(grassRng() * GRASS_TILES.length)])
          } else {
            backgroundData.push(TILE_GRASS)
          }
        }
      } else {
        backgroundData.push(autotileSeaCell(grid, x, y))
      }
    }
  }

  const collisionData = new Array(GRID_W * GRID_H).fill(0)

  const ENTRANCE_SIZE = TILE_SIZE * 4 // 64×64 (4×4 cell) — 큰 stadium 에셋 들어갈 자리
  const objects: TiledObject[] = stadiumCells.map(({ stadium, px, py }, idx) => ({
    height: ENTRANCE_SIZE,
    id: idx + 1,
    name: stadium.teamId,
    opacity: 1,
    properties: [
      { name: "label", type: "string", value: stadium.label },
      { name: "stadium_name", type: "string", value: stadium.stadium },
      { name: "target_scene", type: "string", value: stadium.teamId },
    ],
    rotation: 0,
    type: "stadium_entrance",
    visible: true,
    width: ENTRANCE_SIZE,
    x: px - ENTRANCE_SIZE / 2,
    y: py - ENTRANCE_SIZE / 2,
  }))

  return {
    compressionlevel: -1,
    height: GRID_H,
    infinite: false,
    layers: [
      {
        data: backgroundData,
        height: GRID_H,
        id: 1,
        name: "background",
        opacity: 1,
        type: "tilelayer",
        visible: true,
        width: GRID_W,
        x: 0,
        y: 0,
      },
      {
        data: new Array(GRID_W * GRID_H).fill(0),
        height: GRID_H,
        id: 2,
        name: "decoration",
        opacity: 1,
        type: "tilelayer",
        visible: true,
        width: GRID_W,
        x: 0,
        y: 0,
      },
      {
        data: collisionData,
        height: GRID_H,
        id: 3,
        name: "collision",
        opacity: 1,
        type: "tilelayer",
        visible: true,
        width: GRID_W,
        x: 0,
        y: 0,
      },
      {
        draworder: "topdown",
        id: 4,
        name: "objects",
        objects,
        opacity: 1,
        type: "objectgroup",
        visible: true,
        x: 0,
        y: 0,
      },
    ],
    nextlayerid: 5,
    nextobjectid: objects.length + 1,
    orientation: "orthogonal",
    renderorder: "right-down",
    tiledversion: "1.12.1",
    tileheight: TILE_SIZE,
    tilesets: [
      {
        columns: 176,
        firstgid: 1,
        image: "tilesets/modern-exteriors.png",
        imageheight: 8224,
        imagewidth: 2816,
        margin: 0,
        name: "Modern_Exteriors_Complete_Tileset",
        spacing: 0,
        tilecount: 90464,
        tileheight: TILE_SIZE,
        tilewidth: TILE_SIZE,
      },
    ],
    tilewidth: TILE_SIZE,
    type: "map",
    version: "1.10",
    width: GRID_W,
  }
}

// ---------- 실행 ----------
function main() {
  console.log("Natural Earth GeoJSON 로드…")
  const uk = loadUKPolygon()
  console.log(`UK feature 발견: ${uk.properties?.NAME ?? uk.properties?.ADMIN}`)

  const bbox = getBoundingBox(uk)
  console.log(
    `Bounding box: lon ${bbox.minLon.toFixed(2)}~${bbox.maxLon.toFixed(2)}, lat ${bbox.minLat.toFixed(2)}~${bbox.maxLat.toFixed(2)}`
  )

  const grid = rasterizeToGrid(uk, GRID_W, GRID_H)
  printGridAscii(grid)

  // 경기장 → grid 셀 (직접 좌표 사용, sub-pixel은 grid 가운데)
  const stadiumCells = STADIUMS.map((stadium) => ({
    stadium,
    gx: stadium.gx,
    gy: stadium.gy,
    px: (stadium.gx + 0.5) * TILE_SIZE,
    py: (stadium.gy + 0.5) * TILE_SIZE,
  }))
  console.log("\n경기장 grid 좌표:")
  for (const c of stadiumCells) {
    const inLand =
      c.gx >= 0 && c.gx < GRID_W && c.gy >= 0 && c.gy < GRID_H ? grid[c.gy][c.gx] : false
    console.log(
      `  ${c.stadium.label.padEnd(28)} (${c.gx}, ${c.gy}) ${inLand ? "✓ 육지" : "⚠ 바다/밖"}`
    )
  }

  // grid 셀 충돌 (런던 6개가 가까이 있음) 검사
  const cellMap = new Map<string, string[]>()
  for (const c of stadiumCells) {
    const key = `${c.gx},${c.gy}`
    cellMap.set(key, [...(cellMap.get(key) ?? []), c.stadium.label])
  }
  const collisions = [...cellMap.entries()].filter(([, labels]) => labels.length > 1)
  if (collisions.length > 0) {
    console.log("\n⚠ 같은 grid 셀에 겹치는 경기장:")
    for (const [key, labels] of collisions) console.log(`  (${key}) → ${labels.join(", ")}`)
  }

  // 강 래스터화
  const riverGrid = buildRiverGrid(bbox, grid)
  const riverCellCount = riverGrid.flat().filter(Boolean).length
  console.log(`강 cell: ${riverCellCount} (${RIVERS.length} 강, Bresenham 폭 1 cell)`)

  // .tmj 출력
  const tmjMap = buildTiledMap(grid, riverGrid, stadiumCells)
  writeFileSync(resolve(OUTPUT_JSON), JSON.stringify(tmjMap, null, 1), "utf-8")
  console.log(`\n→ ${OUTPUT_JSON} 작성 완료 (${GRID_W}×${GRID_H}, ${STADIUMS.length} 경기장)`)
}

main()

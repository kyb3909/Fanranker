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
const GRID_W = 80
const GRID_H = 120
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
// Plain green 잔디 변종만 (시각 확인). Grass_3_*, 4_* 는 LimeZu 명명이 "Grass" 라도 실제 흙·모래라 제외.
// 184 = default, 232 = Grass_1_9 (autotile center), 405 = Grass_1_22.
const GRASS_TILES = [184, 232, 405]

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

// Grass_3 (흙·산악 갈색) 9-tile autotile — 잔디 안에 흙 영역
const DIRT = {
  topLeft: 8394,
  top: 8395,
  topRight: 8396,
  right: 8572,
  bottomRight: 8748,
  bottom: 8747,
  bottomLeft: 8746,
  left: 8570,
  plain: 8397,
} as const

type AutotileSet = {
  topLeft: number
  top: number
  topRight: number
  right: number
  bottomRight: number
  bottom: number
  bottomLeft: number
  left: number
  plain: number
}
function autotile9(
  isOutside: (cx: number, cy: number) => boolean,
  set: AutotileSet,
  x: number,
  y: number
): number {
  const N = isOutside(x, y - 1)
  const E = isOutside(x + 1, y)
  const S = isOutside(x, y + 1)
  const W = isOutside(x - 1, y)
  const count = (N ? 1 : 0) + (E ? 1 : 0) + (S ? 1 : 0) + (W ? 1 : 0)
  if (count === 0) return set.plain
  if (count >= 3) return set.plain
  if (count === 1) {
    if (N) return set.top
    if (E) return set.right
    if (S) return set.bottom
    return set.left
  }
  if (N && W) return set.topLeft
  if (N && E) return set.topRight
  if (S && E) return set.bottomRight
  if (S && W) return set.bottomLeft
  return set.plain
}

function autotileSeaCell(grid: boolean[][], x: number, y: number): number {
  const isLand = (cx: number, cy: number) =>
    cx >= 0 && cx < GRID_W && cy >= 0 && cy < GRID_H && grid[cy][cx]
  return autotile9(isLand, SEA, x, y)
}

function autotileDirtCell(dirtGrid: boolean[][], x: number, y: number): number {
  // dirt cell 입장에서 "외부" = 잔디 (= dirt가 아닌 곳). dirt 자체와 같으면 plain.
  const isGrass = (cx: number, cy: number) =>
    cx >= 0 && cx < GRID_W && cy >= 0 && cy < GRID_H && !dirtGrid[cy][cx]
  return autotile9(isGrass, DIRT, x, y)
}

function autotileRiverCell(riverGrid: boolean[][], x: number, y: number): number {
  // 강 cell 입장에서 "외부" = 잔디 (= river가 아닌 곳).
  // Deep_Water set 재사용 (같은 물 색).
  const isGrass = (cx: number, cy: number) =>
    cx >= 0 && cx < GRID_W && cy >= 0 && cy < GRID_H && !riverGrid[cy][cx]
  return autotile9(isGrass, SEA, x, y)
}

// 영국 주요 강 — Thames 만 (사용자 요청).
const RIVERS: Array<{ name: string; points: [number, number][]; width: number }> = [
  {
    name: "Thames",
    width: 1, // 폭 3 cell (사각 box outline 방지)
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
  // 런던 4개: Thames row ~94 기준. entrance box 4×4 cell 이라 강과 겹침 방지 위해 강북 = row 88 이하, 강남 = row 100 이상.
  {
    teamId: "epl_tottenham",
    label: "토트넘",
    stadium: "Tottenham Hotspur Stadium",
    gx: 64,
    gy: 84,
  },
  { teamId: "epl_wembley", label: "잉글랜드 (웸블리)", stadium: "Wembley Stadium", gx: 47, gy: 87 },
  {
    teamId: "epl_arsenal",
    label: "아스날 (에미레이츠)",
    stadium: "Emirates Stadium",
    gx: 58,
    gy: 88,
  },
  {
    teamId: "epl_chelsea",
    label: "첼시 (스탬포드 브리지)",
    stadium: "Stamford Bridge",
    gx: 55,
    gy: 100,
  },
  // 북부 3개
  { teamId: "epl_liverpool", label: "리버풀 (안필드)", stadium: "Anfield", gx: 32, gy: 69 },
  { teamId: "epl_manutd", label: "맨유 (올드 트래포드)", stadium: "Old Trafford", gx: 39, gy: 62 },
  { teamId: "epl_mancity", label: "맨시티 (에티하드)", stadium: "Etihad Stadium", gx: 47, gy: 65 },
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

// ---------- Wang corner-based autotile (PixelLab tileset-ocean-grass) ----------
// 9 unique wang tiles 매핑. mask 4-bit (NW NE SE SW), 1=upper(잔디), 0=lower(바다)
const WANG_AVAILABLE = new Set<number>([
  0b0000, 0b0001, 0b0010, 0b0011, 0b0110, 0b0111, 0b1001, 0b1011, 0b1111,
])

interface WangSprite {
  gx: number
  gy: number
  mask: number
}

function wangCornerMask(landGrid: boolean[][], gx: number, gy: number): number {
  const get = (cx: number, cy: number): number => {
    if (cx < 0 || cx >= GRID_W || cy < 0 || cy >= GRID_H) return 0
    return landGrid[cy][cx] ? 1 : 0
  }
  // NW NE SE SW = 좌상·우상·우하·좌하 인접 cell
  const nw = get(gx - 1, gy - 1)
  const ne = get(gx + 1, gy - 1)
  const se = get(gx + 1, gy + 1)
  const sw = get(gx - 1, gy + 1)
  return (nw << 3) | (ne << 2) | (se << 1) | sw
}

function buildCoastline(landGrid: boolean[][]): WangSprite[] {
  const out: WangSprite[] = []
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const mask = wangCornerMask(landGrid, gx, gy)
      // plain cells (전부 같음) 은 sprite skip — background tile 그대로
      if (mask === 0b1111 || mask === 0b0000) continue
      // unavailable mask는 가장 가까운 fallback (현재는 그대로 — 일부 tile missing)
      if (!WANG_AVAILABLE.has(mask)) continue
      out.push({ gx, gy, mask })
    }
  }
  return out
}

// ---------- 강 가장자리 sprite overlay (Grass_Water 9-tile) ----------
// water-edge-1~8 = 가장자리, 9 = plain. river cell 4변에 잔디 인접하면 가장자리 그림.
function buildWaterEdges(
  riverGrid: boolean[][]
): Array<{ gx: number; gy: number; variant: number }> {
  const edges: Array<{ gx: number; gy: number; variant: number }> = []
  const isGrass = (cx: number, cy: number) =>
    cx >= 0 && cx < GRID_W && cy >= 0 && cy < GRID_H && !riverGrid[cy][cx]
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      if (!riverGrid[gy][gx]) continue
      const N = isGrass(gx, gy - 1)
      const E = isGrass(gx + 1, gy)
      const S = isGrass(gx, gy + 1)
      const W = isGrass(gx - 1, gy)
      // 1_1~8 매핑이 LimeZu 23-cell blob autotile 컨벤션과 달라 모두 plain (water-edge-9 = Grass_Water_1_22 teal solid) 사용.
      // 깔끔한 강 line 우선. 가장자리 polish 는 23-cell 정확 매핑 도출 후.
      void N
      void E
      void S
      void W
      edges.push({ gx, gy, variant: 9 })
    }
  }
  return edges
}

// ---------- 잔디 sprinkle decoration (작은 풀) ----------
const SPROUT_VARIANTS = 4
const SPROUT_DENSITY = 0.08 // 잔디 cell 8% 에 작은 풀

function placeSprouts(
  grid: boolean[][],
  riverGrid: boolean[][],
  dirtGrid: boolean[][],
  treeOccupied: boolean[][]
): Array<{ gx: number; gy: number; variant: number }> {
  const rng = makeRng(2028)
  const sprouts: Array<{ gx: number; gy: number; variant: number }> = []
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      if (!grid[gy][gx]) continue
      if (riverGrid[gy][gx]) continue
      if (dirtGrid[gy][gx]) continue
      if (treeOccupied[gy][gx]) continue
      if (rng() > SPROUT_DENSITY) continue
      sprouts.push({ gx, gy, variant: 1 + Math.floor(rng() * SPROUT_VARIANTS) })
    }
  }
  return sprouts
}

// ---------- 산악 영역 (스코틀랜드 + 웨일즈 hardcoded bbox) ----------
const UK_MOUNTAIN_REGIONS: Array<{
  name: string
  bbox: [number, number, number, number]
  density: number
}> = [
  // bbox = [minLon, minLat, maxLon, maxLat]
  { name: "Scottish Highlands", bbox: [-5.7, 56.5, -3.0, 58.6], density: 0.85 }, // 스코틀랜드 북부 빽빽
  { name: "Southern Uplands", bbox: [-4.5, 55.0, -2.5, 55.7], density: 0.65 }, // 스코틀랜드 남부
  { name: "Lake District", bbox: [-3.4, 54.3, -2.8, 54.8], density: 0.55 },
  { name: "Snowdonia", bbox: [-4.3, 52.8, -3.6, 53.2], density: 0.55 }, // 웨일즈 북
  { name: "Brecon Beacons", bbox: [-3.7, 51.7, -3.1, 52.0], density: 0.45 }, // 웨일즈 남
]

function buildMountainGrid(
  bbox: { minLon: number; maxLon: number; minLat: number; maxLat: number },
  landGrid: boolean[][],
  riverGrid: boolean[][]
): boolean[][] {
  const mGrid: boolean[][] = Array.from({ length: GRID_H }, () => new Array(GRID_W).fill(false))
  const rng = makeRng(3030)
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      if (!landGrid[gy][gx]) continue
      if (riverGrid[gy][gx]) continue
      // grid → lon/lat
      const padFactor = 0.05
      const lonRange = bbox.maxLon - bbox.minLon
      const latRange = bbox.maxLat - bbox.minLat
      const lonStart = bbox.minLon - lonRange * padFactor
      const lonEnd = bbox.maxLon + lonRange * padFactor
      const latStart = bbox.minLat - latRange * padFactor
      const latEnd = bbox.maxLat + latRange * padFactor
      const cellW = (lonEnd - lonStart) / GRID_W
      const cellH = (latEnd - latStart) / GRID_H
      const lon = lonStart + (gx + 0.5) * cellW
      const lat = latEnd - (gy + 0.5) * cellH
      // bbox 안 검사
      const inRegion = UK_MOUNTAIN_REGIONS.find(
        (r) => lon >= r.bbox[0] && lon <= r.bbox[2] && lat >= r.bbox[1] && lat <= r.bbox[3]
      )
      if (!inRegion) continue
      // density 따라 random
      if (rng() < inRegion.density) mGrid[gy][gx] = true
    }
  }
  return mGrid
}

// ---------- 흙 영역 마스크 (영국 본섬 일부) ----------
const DIRT_NOISE_SCALE = 0.1
const DIRT_NOISE_THRESHOLD = 0.74

function buildDirtGrid(landGrid: boolean[][], riverGrid: boolean[][]): boolean[][] {
  const dirtGrid: boolean[][] = Array.from({ length: GRID_H }, () => new Array(GRID_W).fill(false))
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      if (!landGrid[gy][gx]) continue
      if (riverGrid[gy][gx]) continue
      const noise = valueNoise(gx * DIRT_NOISE_SCALE, gy * DIRT_NOISE_SCALE, 4242)
      if (noise > DIRT_NOISE_THRESHOLD) dirtGrid[gy][gx] = true
    }
  }
  return dirtGrid
}

// ---------- Tree decoration placement (forest cluster via value noise) ----------
// 작은 나무 (32×32, tree-s-1~5) + 큰 나무 (64×64, tree-1~3) mix.
// 빽빽한 숲 = 작은 나무 위주.
const TREE_LARGE_VARIANTS = 3 // tree-1~3 (큰 나무)
const TREE_SMALL_VARIANTS = 5 // tree-s-1~5 (작은 나무)
const TREE_LARGE_W = 4 // 64×64
const TREE_SMALL_W = 2 // 32×32
const FOREST_NOISE_SCALE = 0.05
const FOREST_DENSITY_HIGH = 0.42 // 숲 영역 확대 (경기장 없는 곳 빽빽)
const FOREST_PROB_SMALL = 0.95 // 숲 cell 에 작은 나무 둘 확률 (매우 빽빽)
const FOREST_PROB_LARGE_BONUS = 0.05 // 큰 나무 sparse 추가

function hash2D(x: number, y: number, seed: number): number {
  let h = (x * 374761393) ^ (y * 668265263) ^ seed
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const a = hash2D(ix, iy, seed)
  const b = hash2D(ix + 1, iy, seed)
  const c = hash2D(ix, iy + 1, seed)
  const d = hash2D(ix + 1, iy + 1, seed)
  const u = smoothstep(fx)
  const v = smoothstep(fy)
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v
}

type TreePlacement = {
  gx: number
  gy: number
  size: "small" | "large"
  variant: number
}

function placeTrees(
  grid: boolean[][],
  riverGrid: boolean[][],
  dirtGrid: boolean[][],
  stadiumPositions: Array<{ gx: number; gy: number }>
): { trees: TreePlacement[]; occupied: boolean[][] } {
  const rng = makeRng(2027)
  const trees: TreePlacement[] = []
  const occupied: boolean[][] = Array.from({ length: GRID_H }, () => new Array(GRID_W).fill(false))

  const isStadiumNearby = (gx: number, gy: number) =>
    stadiumPositions.some((s) => Math.abs(gx - s.gx) < 4 && Math.abs(gy - s.gy) < 4)

  function fits(gx: number, gy: number, sz: number): boolean {
    if (gx < 0 || gx + sz > GRID_W) return false
    if (gy < 0 || gy + sz > GRID_H) return false
    for (let dy = 0; dy < sz; dy++) {
      for (let dx = 0; dx < sz; dx++) {
        const cx = gx + dx
        const cy = gy + dy
        if (!grid[cy][cx]) return false
        if (riverGrid[cy][cx]) return false
        if (dirtGrid[cy][cx]) return false // 흙 영역엔 나무 X
      }
    }
    // 같은 cell 좌상 시작점만 중복 차단 — 인접 cell 에 나무 OK (sprite 겹침)
    if (occupied[gy][gx]) return false
    if (isStadiumNearby(gx + sz / 2, gy + sz / 2)) return false
    return true
  }

  function markOccupied(gx: number, gy: number, sz: number) {
    void sz
    occupied[gy][gx] = true
  }

  // 1차: 작은 나무 빽빽이 (2×2 cell footprint). 모든 land cell scan.
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      if (!grid[gy][gx]) continue
      const noise = valueNoise(gx * FOREST_NOISE_SCALE, gy * FOREST_NOISE_SCALE, 7777)
      if (noise <= FOREST_DENSITY_HIGH) continue
      if (rng() > FOREST_PROB_SMALL) continue
      // 작은 나무 (2×2)
      if (!fits(gx, gy, TREE_SMALL_W)) continue
      markOccupied(gx, gy, TREE_SMALL_W)
      const variant = 1 + Math.floor(rng() * TREE_SMALL_VARIANTS)
      trees.push({ gx, gy, size: "small", variant })
    }
  }

  // 2차: 큰 나무 sparse (4×4 footprint). occupied 안 된 forest cell 에서.
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      if (!grid[gy][gx]) continue
      const noise = valueNoise(gx * FOREST_NOISE_SCALE, gy * FOREST_NOISE_SCALE, 7777)
      if (noise <= FOREST_DENSITY_HIGH) continue
      if (rng() > FOREST_PROB_LARGE_BONUS) continue
      if (!fits(gx, gy, TREE_LARGE_W)) continue
      markOccupied(gx, gy, TREE_LARGE_W)
      const variant = 1 + Math.floor(rng() * TREE_LARGE_VARIANTS)
      trees.push({ gx, gy, size: "large", variant })
    }
  }

  return { trees, occupied }
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

/** Catmull-Rom spline subsample: control points 사이에 곡선 점 N개 보간 */
function catmullRomSubsample(
  pts: Array<[number, number]>,
  samplesPerSegment: number
): Array<[number, number]> {
  if (pts.length < 2) return pts
  const out: Array<[number, number]> = []
  const ext: Array<[number, number]> = [pts[0], ...pts, pts[pts.length - 1]]
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = ext[i]
    const p1 = ext[i + 1]
    const p2 = ext[i + 2]
    const p3 = ext[i + 3]
    for (let t = 0; t < samplesPerSegment; t++) {
      const tt = t / samplesPerSegment
      const t2 = tt * tt
      const t3 = t2 * tt
      const x =
        0.5 *
        (2 * p1[0] +
          (-p0[0] + p2[0]) * tt +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
      const y =
        0.5 *
        (2 * p1[1] +
          (-p0[1] + p2[1]) * tt +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
      out.push([x, y])
    }
  }
  out.push(pts[pts.length - 1])
  return out
}

function buildRiverGrid(
  bbox: { minLon: number; maxLon: number; minLat: number; maxLat: number },
  landGrid: boolean[][]
): boolean[][] {
  const riverGrid: boolean[][] = Array.from({ length: GRID_H }, () => new Array(GRID_W).fill(false))

  for (const river of RIVERS) {
    // 1. lat/lon → grid → Catmull-Rom 보간 (자연 곡선)
    const ctrlGrid: Array<[number, number]> = river.points.map(([lon, lat]) => {
      const p = projectToGrid(lon, lat, bbox)
      return [p.gx, p.gy] as [number, number]
    })
    const smoothed = catmullRomSubsample(ctrlGrid, 32)
    const linePoints: Array<[number, number]> = []
    for (let i = 0; i < smoothed.length - 1; i++) {
      const [x1, y1] = smoothed[i]
      const [x2, y2] = smoothed[i + 1]
      linePoints.push(
        ...bresenhamLine(Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2))
      )
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
  dirtGrid: boolean[][],
  stadiumCells: Array<{
    stadium: (typeof STADIUMS)[number]
    gx: number
    gy: number
    px: number
    py: number
  }>,
  trees: TreePlacement[],
  sprouts: Array<{ gx: number; gy: number; variant: number }>,
  waterEdges: Array<{ gx: number; gy: number; variant: number }>,
  coastline: WangSprite[]
): TiledMap {
  // background — 육지: 강=river, 흙=dirt autotile, 잔디 / 바다=sea autotile
  const grassRng = makeRng(2026)
  const backgroundData: number[] = []
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (grid[y][x]) {
        // river cell 은 background = 잔디 (sprite 로 덮음 — 색 mismatch 방지)
        if (riverGrid[y][x]) backgroundData.push(TILE_GRASS)
        else if (dirtGrid[y][x]) backgroundData.push(autotileDirtCell(dirtGrid, x, y))
        else backgroundData.push(GRASS_TILES[Math.floor(grassRng() * GRASS_TILES.length)])
      } else {
        backgroundData.push(autotileSeaCell(grid, x, y))
      }
    }
  }

  const collisionData = new Array(GRID_W * GRID_H).fill(0)

  const ENTRANCE_SIZE = TILE_SIZE * 4 // 64×64 (4×4 cell) — 큰 stadium 에셋 들어갈 자리
  const stadiumObjects: TiledObject[] = stadiumCells.map(({ stadium, px, py }, idx) => ({
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

  const treeObjects: TiledObject[] = trees.map((t, idx) => {
    const sz = t.size === "small" ? TREE_SMALL_W : TREE_LARGE_W
    const px = sz * TILE_SIZE
    const asset = t.size === "small" ? `tree-s-${t.variant}` : `tree-${t.variant}`
    return {
      height: px,
      id: stadiumObjects.length + idx + 1,
      name: asset,
      opacity: 1,
      properties: [{ name: "asset", type: "string", value: asset }],
      rotation: 0,
      type: "tree",
      visible: true,
      width: px,
      x: t.gx * TILE_SIZE,
      y: t.gy * TILE_SIZE,
    }
  })

  const baseId = stadiumObjects.length + treeObjects.length
  const sproutObjects: TiledObject[] = sprouts.map((s, idx) => ({
    height: TILE_SIZE,
    id: baseId + idx + 1,
    name: `sprout-${s.variant}`,
    opacity: 1,
    properties: [{ name: "asset", type: "string", value: `sprout-${s.variant}` }],
    rotation: 0,
    type: "sprout",
    visible: true,
    width: TILE_SIZE,
    x: s.gx * TILE_SIZE,
    y: s.gy * TILE_SIZE,
  }))

  const baseId2 = baseId + sproutObjects.length
  const waterEdgeObjects: TiledObject[] = waterEdges.map((e, idx) => ({
    height: TILE_SIZE,
    id: baseId2 + idx + 1,
    name: `water-edge-${e.variant}`,
    opacity: 1,
    properties: [{ name: "asset", type: "string", value: `water-edge-${e.variant}` }],
    rotation: 0,
    type: "water-edge",
    visible: true,
    width: TILE_SIZE,
    x: e.gx * TILE_SIZE,
    y: e.gy * TILE_SIZE,
  }))

  const baseId3 = baseId2 + waterEdgeObjects.length
  const coastlineObjects: TiledObject[] = coastline.map((c, idx) => {
    const maskBin = c.mask.toString(2).padStart(4, "0")
    return {
      height: TILE_SIZE,
      id: baseId3 + idx + 1,
      name: `og-${maskBin}`,
      opacity: 1,
      properties: [{ name: "asset", type: "string", value: `og-${maskBin}` }],
      rotation: 0,
      type: "wang",
      visible: true,
      width: TILE_SIZE,
      x: c.gx * TILE_SIZE,
      y: c.gy * TILE_SIZE,
    }
  })

  const objects = [
    ...stadiumObjects,
    ...treeObjects,
    ...sproutObjects,
    ...waterEdgeObjects,
    ...coastlineObjects,
  ]

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

  // 산악 영역 (스코틀랜드·웨일즈)
  const mountainGrid = buildMountainGrid(bbox, grid, riverGrid)
  const mountainCellCount = mountainGrid.flat().filter(Boolean).length
  console.log(`산악 cell: ${mountainCellCount} (스코틀랜드 + 웨일즈)`)

  // 흙 영역 = 산악 + 추가 noise cluster
  const dirtGrid = buildDirtGrid(grid, riverGrid)
  // 산악 cell도 흙으로 marking (흙 autotile 사용)
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      if (mountainGrid[gy][gx]) dirtGrid[gy][gx] = true
    }
  }
  const dirtCellCount = dirtGrid.flat().filter(Boolean).length
  console.log(`흙 cell (산악 포함): ${dirtCellCount}`)

  // Tree decoration placement (작은 + 큰 나무 mix)
  const { trees, occupied: treeOccupied } = placeTrees(grid, riverGrid, dirtGrid, stadiumCells)
  const smallCount = trees.filter((t) => t.size === "small").length
  const largeCount = trees.length - smallCount
  console.log(`나무: ${trees.length} 개 (작은 ${smallCount} / 큰 ${largeCount})`)

  // 잔디 위 작은 풀 sprinkle
  const sprouts = placeSprouts(grid, riverGrid, dirtGrid, treeOccupied)
  console.log(`작은 풀: ${sprouts.length} 개`)

  // 강 sprite overlay
  const waterEdges = buildWaterEdges(riverGrid)
  console.log(`강 cell: ${waterEdges.length}`)

  // 해안선 wang autotile (PixelLab tileset-ocean-grass)
  const coastline = buildCoastline(grid)
  console.log(`해안선 wang: ${coastline.length}`)
  console.log(`강 가장자리: ${waterEdges.length} 개`)

  // .tmj 출력
  const tmjMap = buildTiledMap(
    grid,
    riverGrid,
    dirtGrid,
    stadiumCells,
    trees,
    sprouts,
    waterEdges,
    coastline
  )
  writeFileSync(resolve(OUTPUT_JSON), JSON.stringify(tmjMap, null, 1), "utf-8")
  console.log(`\n→ ${OUTPUT_JSON} 작성 완료 (${GRID_W}×${GRID_H}, ${STADIUMS.length} 경기장)`)
}

main()

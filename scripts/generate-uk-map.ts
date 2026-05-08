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
// 184 = 잔디 (검증된 값). 바다 타일은 추후 결정 — 지금은 0 (빈 타일, 검정 배경).
const TILE_GRASS = 184
const TILE_SEA = 0

// EPL 11 + Wembley 경기장 (실제 lat/lon, supabase/migrations/20260401_team_stadium_system.sql 시드 기반)
const STADIUMS: Array<{
  teamId: string
  label: string
  stadium: string
  lon: number
  lat: number
}> = [
  {
    teamId: "epl_wembley",
    label: "잉글랜드 (웸블리)",
    stadium: "Wembley Stadium",
    lon: -0.2796,
    lat: 51.556,
  },
  {
    teamId: "epl_manutd",
    label: "맨유 (올드 트래포드)",
    stadium: "Old Trafford",
    lon: -2.2913,
    lat: 53.4631,
  },
  {
    teamId: "epl_mancity",
    label: "맨시티 (에티하드)",
    stadium: "Etihad Stadium",
    lon: -2.2004,
    lat: 53.4831,
  },
  {
    teamId: "epl_liverpool",
    label: "리버풀 (안필드)",
    stadium: "Anfield",
    lon: -2.9608,
    lat: 53.4308,
  },
  {
    teamId: "epl_arsenal",
    label: "아스날 (에미레이츠)",
    stadium: "Emirates Stadium",
    lon: -0.1084,
    lat: 51.5549,
  },
  {
    teamId: "epl_chelsea",
    label: "첼시 (스탬포드 브리지)",
    stadium: "Stamford Bridge",
    lon: -0.191,
    lat: 51.4817,
  },
  {
    teamId: "epl_tottenham",
    label: "토트넘",
    stadium: "Tottenham Hotspur Stadium",
    lon: -0.0664,
    lat: 51.6043,
  },
  {
    teamId: "epl_newcastle",
    label: "뉴캐슬 (세인트 제임스)",
    stadium: "St James' Park",
    lon: -1.6217,
    lat: 54.9756,
  },
  {
    teamId: "epl_astonvilla",
    label: "아스톤빌라 (빌라파크)",
    stadium: "Villa Park",
    lon: -1.8847,
    lat: 52.5092,
  },
  {
    teamId: "epl_brighton",
    label: "브라이턴 (아멕스)",
    stadium: "Amex Stadium",
    lon: -0.0834,
    lat: 50.8616,
  },
  {
    teamId: "epl_westham",
    label: "웨스트햄 (런던 스타디움)",
    stadium: "London Stadium",
    lon: -0.0166,
    lat: 51.5386,
  },
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
  stadiumCells: Array<{
    stadium: (typeof STADIUMS)[number]
    gx: number
    gy: number
    px: number
    py: number
  }>
): TiledMap {
  // background — 육지=잔디, 바다=빈
  const backgroundData: number[] = []
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      backgroundData.push(grid[y][x] ? TILE_GRASS : TILE_SEA)
    }
  }

  const collisionData = new Array(GRID_W * GRID_H).fill(0)

  const ENTRANCE_SIZE = TILE_SIZE * 2
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

  // 경기장 → grid 셀
  const stadiumCells = STADIUMS.map((stadium) => ({
    stadium,
    ...projectToGrid(stadium.lon, stadium.lat, bbox),
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

  // .tmj 출력
  const tmjMap = buildTiledMap(grid, stadiumCells)
  writeFileSync(resolve(OUTPUT_JSON), JSON.stringify(tmjMap, null, 1), "utf-8")
  console.log(`\n→ ${OUTPUT_JSON} 작성 완료 (${GRID_W}×${GRID_H}, ${STADIUMS.length} 경기장)`)
}

main()

// ═══════════════════════════════════════════════════════
// UK Map Data v2 — 60×84 grid, 14 terrain types
// 삼국지 영걸전 style tile-based map
// ═══════════════════════════════════════════════════════

export enum Terrain {
  DeepOcean = 0,
  ShallowWater = 1,
  Grass = 2,
  DarkGrass = 3,
  Forest = 4, // Generic / deciduous
  ConiferForest = 5, // Scottish pine
  Mountain = 6,
  SnowMountain = 7,
  Hill = 8,
  Moorland = 9,
  Farmland = 10,
  City = 11,
  River = 12,
  Wetland = 13,
}

export const MAP_ROWS = 84
export const MAP_COLS = 60
export const TILE_PX = 20 // 1200/60 = 20, 1680/84 = 20
export const MAP_W = MAP_COLS * TILE_PX // 1200
export const MAP_H = MAP_ROWS * TILE_PX // 1680

export interface Stadium {
  name: string
  team: string
  row: number
  col: number
  size: "large" | "medium"
  capacity: string
}

// Deterministic hash
function hash(a: number, b: number): number {
  return ((a * 73 + b * 137 + a * b * 53 + 7919) % 1000) / 1000
}

// ─── UK Land Ranges (60×84 grid) ───
// [row, startCol, endCol] — 2x resolution of original 30×42
const UK_LAND_RANGES: [number, number, number][] = [
  // North Scotland tip (rows 4-5)
  [4, 28, 31],
  [5, 27, 32],
  // Scottish Highlands (rows 6-17)
  [6, 26, 33],
  [7, 25, 33],
  [8, 24, 33],
  [9, 23, 33],
  [10, 22, 34],
  [11, 21, 35],
  [12, 20, 35],
  [13, 20, 35],
  [14, 19, 35],
  [15, 19, 34],
  [16, 18, 34],
  [17, 18, 33],
  // Central Scotland (rows 18-21)
  [18, 19, 33],
  [19, 19, 33],
  [20, 18, 33],
  [21, 17, 33],
  // Glasgow-Edinburgh belt (rows 22-27)
  [22, 16, 33],
  [23, 17, 33],
  [24, 17, 33],
  [25, 17, 32],
  [26, 18, 32],
  [27, 18, 31],
  // Borders (rows 28-31)
  [28, 18, 31],
  [29, 19, 31],
  [30, 18, 32],
  [31, 17, 32],
  // Northern England (rows 32-37)
  [32, 16, 33],
  [33, 16, 33],
  [34, 16, 34],
  [35, 15, 34],
  [36, 15, 35],
  [37, 14, 35],
  // Liverpool-Manchester-Leeds belt (rows 38-41)
  [38, 14, 35],
  [39, 14, 35],
  [40, 14, 36],
  [41, 14, 36],
  // Midlands (rows 42-47)
  [42, 14, 37],
  [43, 13, 37],
  [44, 12, 36],
  [45, 12, 37],
  [46, 11, 37],
  [47, 10, 37],
  // Wales + Central England (rows 48-53)
  [48, 9, 38],
  [49, 8, 39],
  [50, 9, 40],
  [51, 10, 40],
  [52, 11, 40],
  [53, 12, 41],
  // South-Central England (rows 54-59)
  [54, 12, 41],
  [55, 13, 41],
  [56, 14, 41],
  [57, 14, 42],
  [58, 14, 42],
  [59, 14, 43],
  // London & Southeast (rows 60-65)
  [60, 14, 44],
  [61, 15, 43],
  [62, 16, 42],
  [63, 16, 41],
  [64, 15, 40],
  [65, 14, 38],
  // South coast (rows 66-69)
  [66, 14, 36],
  [67, 14, 35],
  [68, 13, 32],
  [69, 13, 30],
  // Southwest (rows 70-77)
  [70, 12, 28],
  [71, 13, 27],
  [72, 14, 26],
  [73, 14, 25],
  [74, 15, 24],
  [75, 16, 23],
  [76, 17, 22],
  [77, 18, 21],
  // Cornwall tip (rows 78-79)
  [78, 19, 20],
  [79, 20, 20],
]

// ─── Terrain assignment by region ───
function getTerrainType(row: number, col: number, startCol: number, endCol: number): Terrain {
  const h = hash(row, col)
  const isCoastEdge = col <= startCol + 1 || col >= endCol - 1
  const width = endCol - startCol
  const relCol = (col - startCol) / Math.max(width, 1) // 0 to 1 across land

  // Scottish Highlands (rows 4-17)
  if (row <= 17) {
    if (isCoastEdge && h < 0.4) return Terrain.Hill
    if (h < 0.2) return Terrain.SnowMountain
    if (h < 0.45) return Terrain.Mountain
    if (h < 0.6) return Terrain.ConiferForest
    if (h < 0.7) return Terrain.Moorland
    return Terrain.Grass
  }

  // Central Scotland (rows 18-27)
  if (row <= 27) {
    if (h < 0.15) return Terrain.ConiferForest
    if (h < 0.25) return Terrain.Hill
    if (h < 0.35) return Terrain.Moorland
    if (h < 0.45) return Terrain.DarkGrass
    return Terrain.Grass
  }

  // Borders & Northern England (rows 28-37)
  if (row <= 37) {
    // Lake District (west side, rows 34-37)
    if (row >= 34 && row <= 37 && col <= startCol + 4) {
      if (h < 0.35) return Terrain.Mountain
      if (h < 0.5) return Terrain.Hill
      return Terrain.Moorland
    }
    // Pennines (center)
    if (relCol > 0.3 && relCol < 0.6 && h < 0.3) return Terrain.Hill
    if (h < 0.15) return Terrain.Forest
    if (h < 0.25) return Terrain.Moorland
    return Terrain.Grass
  }

  // Liverpool-Manchester-Leeds (rows 38-41)
  if (row <= 41) {
    if (h < 0.12) return Terrain.Forest
    if (h < 0.2) return Terrain.Hill
    if (h < 0.3) return Terrain.DarkGrass
    return Terrain.Grass
  }

  // Midlands (rows 42-47)
  if (row <= 47) {
    if (h < 0.12) return Terrain.Forest
    if (h < 0.22) return Terrain.Farmland
    if (h < 0.3) return Terrain.DarkGrass
    return Terrain.Grass
  }

  // Wales (rows 48-53, western columns)
  if (row <= 53) {
    // Welsh mountains (west half)
    if (col <= startCol + (endCol - startCol) * 0.35) {
      if (row >= 48 && row <= 52) {
        if (h < 0.3) return Terrain.Mountain
        if (h < 0.45) return Terrain.Hill
        if (h < 0.55) return Terrain.Moorland
        return Terrain.Grass
      }
    }
    // English midlands (east half)
    if (h < 0.15) return Terrain.Farmland
    if (h < 0.25) return Terrain.Forest
    if (h < 0.35) return Terrain.DarkGrass
    return Terrain.Grass
  }

  // Southern England (rows 54-65)
  if (row <= 65) {
    if (h < 0.18) return Terrain.Farmland
    if (h < 0.28) return Terrain.Forest
    if (h < 0.35) return Terrain.DarkGrass
    if (h < 0.4) return Terrain.Hill
    return Terrain.Grass
  }

  // Southwest (rows 66-79)
  if (h < 0.15) return Terrain.Forest
  if (h < 0.25) return Terrain.Farmland
  if (h < 0.35) return Terrain.Hill
  if (h < 0.42) return Terrain.Moorland
  return Terrain.Grass
}

// ─── Build the map ───
function generateMap(): Terrain[][] {
  const map: Terrain[][] = Array.from({ length: MAP_ROWS }, () =>
    Array(MAP_COLS).fill(Terrain.DeepOcean)
  )

  // Land range lookup
  const ranges = new Map<number, [number, number]>()
  for (const [row, start, end] of UK_LAND_RANGES) {
    ranges.set(row, [start, end])
  }

  // Fill land
  for (let r = 0; r < MAP_ROWS; r++) {
    const range = ranges.get(r)
    if (!range) continue
    const [start, end] = range
    for (let c = start; c <= end; c++) {
      map[r][c] = getTerrainType(r, c, start, end)
    }
  }

  // Shallow water ring around land (1-2 cells out from coast)
  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      if (map[r][c] !== Terrain.DeepOcean) continue
      // Check if any neighbor is land
      let nearLand = false
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr = r + dr,
            nc = c + dc
          if (nr >= 0 && nr < MAP_ROWS && nc >= 0 && nc < MAP_COLS) {
            if (map[nr][nc] !== Terrain.DeepOcean && map[nr][nc] !== Terrain.ShallowWater) {
              nearLand = true
            }
          }
        }
      }
      if (nearLand) map[r][c] = Terrain.ShallowWater
    }
  }

  // Place cities at known positions (doubled from original 30×42)
  const cities: [number, number][] = [
    [12, 26], // Inverness
    [16, 30], // Aberdeen
    [22, 20], // Glasgow
    [22, 30], // Edinburgh
    [32, 28], // Newcastle
    [38, 20], // Liverpool
    [38, 26], // Manchester
    [39, 32], // Leeds
    [46, 28], // Birmingham
    [50, 14], // Cardiff
    [50, 30], // Bristol
    [56, 32], // Oxford
    [60, 38], // London (center)
    [60, 40], // London (east)
    [58, 38], // London (north)
    [66, 30], // Southampton
    [66, 36], // Brighton
    [70, 20], // Exeter
    [74, 20], // Plymouth
  ]
  for (const [r, c] of cities) {
    if (
      r < MAP_ROWS &&
      c < MAP_COLS &&
      map[r][c] !== Terrain.DeepOcean &&
      map[r][c] !== Terrain.ShallowWater
    ) {
      map[r][c] = Terrain.City
      // Surrounding cells also city for larger towns
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
        [0, -1],
        [-1, 0],
      ]) {
        const nr = r + dr,
          nc = c + dc
        if (
          nr >= 0 &&
          nr < MAP_ROWS &&
          nc >= 0 &&
          nc < MAP_COLS &&
          map[nr][nc] !== Terrain.DeepOcean &&
          map[nr][nc] !== Terrain.ShallowWater
        ) {
          if (hash(nr, nc) < 0.5) map[nr][nc] = Terrain.City
        }
      }
    }
  }

  // Rivers (simple vertical/horizontal strips)
  // Thames (roughly row 58-62, following eastward)
  for (let c = 30; c <= 40; c++) {
    const r = 59 + Math.floor(hash(59, c) * 2)
    if (
      map[r]?.[c] &&
      map[r][c] !== Terrain.DeepOcean &&
      map[r][c] !== Terrain.ShallowWater &&
      map[r][c] !== Terrain.City
    )
      map[r][c] = Terrain.River
  }
  // Severn (roughly rows 46-52, western side)
  for (let r = 46; r <= 52; r++) {
    const c = 14 + Math.floor(hash(r, 14) * 3)
    if (
      map[r]?.[c] &&
      map[r][c] !== Terrain.DeepOcean &&
      map[r][c] !== Terrain.ShallowWater &&
      map[r][c] !== Terrain.City
    )
      map[r][c] = Terrain.River
  }
  // Humber (row ~40, eastern)
  for (let c = 32; c <= 36; c++) {
    if (
      map[40]?.[c] &&
      map[40][c] !== Terrain.DeepOcean &&
      map[40][c] !== Terrain.ShallowWater &&
      map[40][c] !== Terrain.City
    )
      map[40][c] = Terrain.River
  }

  return map
}

export const UK_MAP = generateMap()

// ─── Stadiums (doubled grid positions) ───
export const STADIUMS: Stadium[] = [
  { name: "Celtic Park", team: "Celtic", row: 24, col: 20, size: "large", capacity: "60,411" },
  { name: "Ibrox", team: "Rangers", row: 26, col: 18, size: "medium", capacity: "50,817" },
  {
    name: "St James' Park",
    team: "Newcastle",
    row: 32,
    col: 28,
    size: "large",
    capacity: "52,305",
  },
  { name: "Anfield", team: "Liverpool", row: 38, col: 20, size: "large", capacity: "61,276" },
  { name: "Old Trafford", team: "Man United", row: 38, col: 24, size: "large", capacity: "74,310" },
  { name: "Etihad", team: "Man City", row: 40, col: 26, size: "large", capacity: "53,400" },
  { name: "Elland Road", team: "Leeds", row: 38, col: 32, size: "medium", capacity: "37,890" },
  { name: "Villa Park", team: "Aston Villa", row: 46, col: 28, size: "medium", capacity: "42,640" },
  {
    name: "Principality Stadium",
    team: "Wales",
    row: 50,
    col: 14,
    size: "large",
    capacity: "73,931",
  },
  { name: "Wembley", team: "England", row: 58, col: 38, size: "large", capacity: "90,000" },
  { name: "Emirates", team: "Arsenal", row: 60, col: 40, size: "large", capacity: "60,704" },
  {
    name: "Stamford Bridge",
    team: "Chelsea",
    row: 62,
    col: 38,
    size: "medium",
    capacity: "40,341",
  },
  { name: "Tottenham Stadium", team: "Spurs", row: 58, col: 42, size: "large", capacity: "62,850" },
  { name: "St Mary's", team: "Southampton", row: 66, col: 30, size: "medium", capacity: "32,384" },
]

// ─── Helpers ───
export function isWalkable(row: number, col: number): boolean {
  if (row < 0 || row >= MAP_ROWS || col < 0 || col >= MAP_COLS) return false
  const t = UK_MAP[row][col]
  return t !== Terrain.DeepOcean && t !== Terrain.ShallowWater && t !== Terrain.River
}

export function getNearbyStadium(row: number, col: number, range = 4): Stadium | null {
  let closest: Stadium | null = null
  let minDist = range + 1
  for (const s of STADIUMS) {
    const dist = Math.abs(s.row - row) + Math.abs(s.col - col)
    if (dist < minDist) {
      minDist = dist
      closest = s
    }
  }
  return closest
}

// ─── Tileset configuration ───
// Maps terrain pairs to tileset filenames
export interface TilesetConfig {
  id: string // unique key
  pngFile: string // path under /map/tiles/
  jsonFile: string
  lowerTerrain: Terrain | Terrain[] // which terrain is "lower"
  upperTerrain: Terrain | Terrain[] // which terrain is "upper"
  threshold: number // vertex >= threshold = upper
  region?: "scotland" | "south" | "all" // region restriction
}

export const TILESET_CONFIGS: TilesetConfig[] = [
  // Layer 0: Ocean depth
  {
    id: "deep-shallow",
    pngFile: "ts-deep-shallow.png",
    jsonFile: "ts-deep-shallow.json",
    lowerTerrain: Terrain.DeepOcean,
    upperTerrain: Terrain.ShallowWater,
    threshold: 1,
  },
  // Layer 1: Coastline
  {
    id: "shallow-grass",
    pngFile: "ts-shallow-grass.png",
    jsonFile: "ts-shallow-grass.json",
    lowerTerrain: Terrain.ShallowWater,
    upperTerrain: Terrain.Grass,
    threshold: 2,
  },
  // Layer 2: Hills
  {
    id: "grass-hill",
    pngFile: "ts-grass-hill.png",
    jsonFile: "ts-grass-hill.json",
    lowerTerrain: Terrain.Grass,
    upperTerrain: Terrain.Hill,
    threshold: 8,
  },
  // Layer 3: Forest (deciduous — default)
  {
    id: "grass-forest",
    pngFile: "ts-grass-forest.png",
    jsonFile: "ts-grass-forest.json",
    lowerTerrain: Terrain.Grass,
    upperTerrain: Terrain.Forest,
    threshold: 4,
  },
  // Layer 4: Conifer forest (Scotland)
  {
    id: "grass-conifer",
    pngFile: "ts-grass-conifer.png",
    jsonFile: "ts-grass-conifer.json",
    lowerTerrain: Terrain.Grass,
    upperTerrain: Terrain.ConiferForest,
    threshold: 5,
  },
  // Layer 5: Mountain
  {
    id: "grass-mountain",
    pngFile: "ts-grass-mountain.png",
    jsonFile: "ts-grass-mountain.json",
    lowerTerrain: Terrain.Grass,
    upperTerrain: Terrain.Mountain,
    threshold: 6,
  },
  // Layer 6: Snow mountain
  {
    id: "grass-snow",
    pngFile: "ts-grass-snow.png",
    jsonFile: "ts-grass-snow.json",
    lowerTerrain: Terrain.Grass,
    upperTerrain: Terrain.SnowMountain,
    threshold: 7,
  },
  // Layer 7: Moorland
  {
    id: "grass-moorland",
    pngFile: "ts-grass-moorland.png",
    jsonFile: "ts-grass-moorland.json",
    lowerTerrain: Terrain.Grass,
    upperTerrain: Terrain.Moorland,
    threshold: 9,
  },
  // Layer 8: Farmland
  {
    id: "grass-farmland",
    pngFile: "ts-grass-farmland.png",
    jsonFile: "ts-grass-farmland.json",
    lowerTerrain: Terrain.Grass,
    upperTerrain: Terrain.Farmland,
    threshold: 10,
  },
  // Layer 9: City
  {
    id: "grass-city",
    pngFile: "ts-grass-city.png",
    jsonFile: "ts-grass-city.json",
    lowerTerrain: Terrain.Grass,
    upperTerrain: Terrain.City,
    threshold: 11,
  },
  // Layer 10: River
  {
    id: "grass-river",
    pngFile: "ts-grass-river.png",
    jsonFile: "ts-grass-river.json",
    lowerTerrain: Terrain.Grass,
    upperTerrain: Terrain.River,
    threshold: 12,
  },
  // Layer 11: Forest→Mountain
  {
    id: "forest-mountain",
    pngFile: "ts-forest-mountain.png",
    jsonFile: "ts-forest-mountain.json",
    lowerTerrain: Terrain.Forest,
    upperTerrain: Terrain.Mountain,
    threshold: 6,
  },
]

// Variant tilesets (same terrain pair, different visual style)
export const VARIANT_CONFIGS: TilesetConfig[] = [
  {
    id: "coast-gravel",
    pngFile: "ts-coast-gravel.png",
    jsonFile: "ts-coast-gravel.json",
    lowerTerrain: Terrain.ShallowWater,
    upperTerrain: Terrain.Grass,
    threshold: 2,
    region: "south",
  },
  {
    id: "coast-rocky",
    pngFile: "ts-coast-rocky.png",
    jsonFile: "ts-coast-rocky.json",
    lowerTerrain: Terrain.ShallowWater,
    upperTerrain: Terrain.Grass,
    threshold: 2,
    region: "scotland",
  },
  {
    id: "grass-deciduous",
    pngFile: "ts-grass-deciduous.png",
    jsonFile: "ts-grass-deciduous.json",
    lowerTerrain: Terrain.Grass,
    upperTerrain: Terrain.Forest,
    threshold: 4,
    region: "south",
  },
  {
    id: "grass-estuary",
    pngFile: "ts-grass-estuary.png",
    jsonFile: "ts-grass-estuary.json",
    lowerTerrain: Terrain.Grass,
    upperTerrain: Terrain.River,
    threshold: 12,
    region: "south",
  },
]

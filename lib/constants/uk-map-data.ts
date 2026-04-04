export enum TileType {
  Ocean = 0,
  Grass = 1,
  Forest = 2,
  Mountain = 3,
  City = 4,
}

export interface Stadium {
  name: string
  team: string
  row: number
  col: number
  size: "large" | "medium"
  capacity: string
}

// UK land ranges: [row, startCol, endCol]
const UK_LAND_RANGES: [number, number, number][] = [
  // Scottish Highlands
  [2, 14, 15],
  [3, 13, 16],
  [4, 12, 16],
  [5, 11, 16],
  [6, 10, 17],
  [7, 10, 17],
  [8, 9, 17],
  [9, 9, 16],
  [10, 10, 16],
  [11, 9, 16],
  // Central Scotland
  [12, 8, 16],
  [13, 9, 16],
  [14, 10, 15],
  // Borders & Northern England
  [15, 9, 15],
  [16, 9, 16],
  [17, 8, 16],
  [18, 8, 17],
  [19, 7, 17],
  [20, 7, 17],
  // Midlands
  [21, 7, 18],
  [22, 6, 17],
  [23, 6, 18],
  [24, 5, 18],
  // Wales
  [25, 4, 19],
  [26, 5, 20],
  [27, 6, 20],
  // Southern England
  [28, 6, 21],
  [29, 7, 20],
  [30, 7, 22],
  [31, 8, 21],
  [32, 8, 20],
  [33, 7, 18],
  [34, 7, 17],
  // Southwest
  [35, 6, 15],
  [36, 7, 14],
  [37, 8, 12],
  [38, 9, 11],
  [39, 10, 10],
]

export const MAP_ROWS = 42
export const MAP_COLS = 30

// Deterministic pseudo-random based on position
export function hash(row: number, col: number): number {
  const h = (row * 73 + col * 137 + row * col * 53 + 7919) % 1000
  return h / 1000
}

function getTerrainType(row: number, col: number, startCol: number, endCol: number): TileType {
  const r = hash(row, col)
  const isEdge = col === startCol || col === endCol

  // Scottish Highlands (rows 2-8)
  if (row <= 8) {
    if (isEdge) return TileType.Mountain
    return r < 0.35 ? TileType.Forest : r < 0.55 ? TileType.Mountain : TileType.Grass
  }
  // Scottish Lowlands (rows 9-14)
  if (row <= 14) {
    return r < 0.25 ? TileType.Forest : TileType.Grass
  }
  // Lake District / Northern England (rows 15-20)
  if (row <= 20) {
    if (row >= 17 && row <= 19 && col <= startCol + 1) return TileType.Mountain
    return r < 0.2 ? TileType.Forest : TileType.Grass
  }
  // Wales + Midlands (rows 21-26)
  if (row <= 26) {
    if (col <= 8 && row >= 24) return r < 0.4 ? TileType.Mountain : TileType.Forest
    return r < 0.15 ? TileType.Forest : TileType.Grass
  }
  // Southern England (rows 27-35)
  if (row <= 35) {
    return r < 0.2 ? TileType.Forest : TileType.Grass
  }
  // Southwest (rows 36+)
  return r < 0.3 ? TileType.Forest : TileType.Grass
}

// Build the full map
function generateMap(): TileType[][] {
  const map: TileType[][] = Array.from({ length: MAP_ROWS }, () =>
    Array(MAP_COLS).fill(TileType.Ocean)
  )

  // Build land range lookup
  const landRanges = new Map<number, [number, number]>()
  for (const [row, start, end] of UK_LAND_RANGES) {
    landRanges.set(row, [start, end])
  }

  for (let r = 0; r < MAP_ROWS; r++) {
    const range = landRanges.get(r)
    if (!range) continue
    const [start, end] = range
    for (let c = start; c <= end; c++) {
      map[r][c] = getTerrainType(r, c, start, end)
    }
  }

  // Place cities at known positions
  const cities: [number, number][] = [
    [6, 13],
    [8, 15],
    [12, 10],
    [12, 15],
    [16, 14],
    [19, 10],
    [19, 13],
    [19, 16],
    [23, 14],
    [25, 7],
    [25, 15],
    [28, 16],
    [30, 19],
    [30, 20],
    [29, 19],
    [33, 15],
    [33, 18],
    [35, 10],
    [37, 10],
  ]
  for (const [r, c] of cities) {
    if (map[r]?.[c] !== undefined && map[r][c] !== TileType.Ocean) {
      map[r][c] = TileType.City
    }
  }

  return map
}

export const UK_MAP = generateMap()

export const STADIUMS: Stadium[] = [
  // Scotland
  { name: "Celtic Park", team: "Celtic", row: 12, col: 10, size: "large", capacity: "60,411" },
  { name: "Ibrox", team: "Rangers", row: 13, col: 9, size: "medium", capacity: "50,817" },
  // Northeast
  {
    name: "St James' Park",
    team: "Newcastle",
    row: 16,
    col: 14,
    size: "large",
    capacity: "52,305",
  },
  // Northwest
  { name: "Anfield", team: "Liverpool", row: 19, col: 10, size: "large", capacity: "61,276" },
  { name: "Old Trafford", team: "Man United", row: 19, col: 13, size: "large", capacity: "74,310" },
  { name: "Etihad", team: "Man City", row: 20, col: 13, size: "large", capacity: "53,400" },
  // Yorkshire
  { name: "Elland Road", team: "Leeds", row: 19, col: 16, size: "medium", capacity: "37,890" },
  // Midlands
  { name: "Villa Park", team: "Aston Villa", row: 23, col: 14, size: "medium", capacity: "42,640" },
  // Wales
  {
    name: "Principality Stadium",
    team: "Wales",
    row: 25,
    col: 7,
    size: "large",
    capacity: "73,931",
  },
  // London
  { name: "Wembley", team: "England", row: 29, col: 19, size: "large", capacity: "90,000" },
  { name: "Emirates", team: "Arsenal", row: 30, col: 20, size: "large", capacity: "60,704" },
  {
    name: "Stamford Bridge",
    team: "Chelsea",
    row: 31,
    col: 19,
    size: "medium",
    capacity: "40,341",
  },
  { name: "Tottenham Stadium", team: "Spurs", row: 29, col: 21, size: "large", capacity: "62,850" },
  // South
  { name: "St Mary's", team: "Southampton", row: 33, col: 15, size: "medium", capacity: "32,384" },
]

export function isWalkable(row: number, col: number): boolean {
  if (row < 0 || row >= MAP_ROWS || col < 0 || col >= MAP_COLS) return false
  return UK_MAP[row][col] !== TileType.Ocean
}

// ═══════════════════════════════════════
// UK Coastline polygon (lat/lon → pixel)
// ═══════════════════════════════════════
// Map pixel space: 1200 x 1680
// lon range: -8 to +2 (10°), lat range: 49.5 to 59 (9.5°)
export function geoToPixel(lat: number, lon: number): [number, number] {
  const x = ((lon + 8) / 10) * 1200
  const y = ((59 - lat) / 9.5) * 1680
  return [x, y]
}

// Clockwise outline of Great Britain mainland (~70 points)
const UK_GEO: [number, number][] = [
  // North Scotland
  [58.6, -5.0],
  [58.5, -3.4],
  [58.3, -3.0],
  // East Scotland
  [57.7, -2.0],
  [57.15, -2.05],
  [56.7, -2.2],
  [56.45, -2.7],
  [56.2, -2.5],
  [56.05, -3.0],
  [56.0, -3.35],
  [55.95, -3.0],
  // East England
  [55.4, -1.6],
  [55.0, -1.4],
  [54.6, -1.1],
  [54.3, -0.4],
  [53.9, -0.1],
  [53.6, 0.1],
  // The Wash
  [53.1, 0.3],
  [52.95, 0.5],
  [52.8, 0.35],
  // East Anglia
  [52.6, 1.7],
  [52.0, 1.6],
  [51.85, 1.2],
  // Thames / Kent
  [51.5, 0.9],
  [51.35, 1.4],
  [51.1, 1.3],
  // South coast
  [50.9, 0.3],
  [50.75, -0.7],
  [50.7, -1.3],
  [50.65, -1.8],
  [50.55, -2.4],
  [50.5, -3.3],
  // Cornwall
  [50.25, -3.8],
  [50.35, -4.2],
  [50.07, -5.5],
  // North Cornwall
  [50.5, -5.05],
  [50.8, -4.5],
  [51.0, -4.1],
  [51.2, -3.4],
  // South Wales
  [51.4, -3.2],
  [51.55, -3.8],
  [51.65, -4.3],
  [51.7, -5.05],
  [51.85, -5.25],
  // West Wales
  [52.1, -4.95],
  [52.4, -4.65],
  [52.8, -4.4],
  [53.1, -4.35],
  [53.3, -4.6],
  [53.35, -4.25],
  // NW England
  [53.3, -3.1],
  [53.5, -3.0],
  [53.85, -3.05],
  [54.05, -2.85],
  [54.4, -3.45],
  // Solway Firth → SW Scotland
  [54.85, -3.6],
  [54.95, -3.85],
  [55.0, -4.5],
  [55.25, -4.85],
  [55.6, -4.8],
  // Clyde → West Scotland
  [55.85, -4.95],
  [55.95, -5.4],
  [56.4, -5.55],
  [56.85, -5.75],
  [57.3, -5.85],
  [57.6, -5.3],
  [58.0, -5.05],
  [58.6, -5.0],
]

export const UK_COASTLINE: [number, number][] = UK_GEO.map(([lat, lon]) => geoToPixel(lat, lon))

export function getNearbyStadium(row: number, col: number, range = 2): Stadium | null {
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

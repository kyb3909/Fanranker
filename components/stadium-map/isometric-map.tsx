"use client"

import { useRef, useEffect, useState, useCallback } from "react"
import {
  UK_MAP,
  STADIUMS,
  MAP_ROWS,
  MAP_COLS,
  TileType,
  isWalkable,
  getNearbyStadium,
  type Stadium,
} from "@/lib/constants/uk-map-data"

const TILE_W = 64
const TILE_H = 32
const HALF_W = TILE_W / 2
const HALF_H = TILE_H / 2

function gridToScreen(row: number, col: number) {
  return {
    x: (col - row) * HALF_W,
    y: (col + row) * HALF_H,
  }
}

const TILE_IMAGE_MAP: Record<TileType, string> = {
  [TileType.Ocean]: "/map/tiles/ocean.png",
  [TileType.Grass]: "/map/tiles/grass.png",
  [TileType.Forest]: "/map/tiles/forest.png",
  [TileType.Mountain]: "/map/tiles/mountain.png",
  [TileType.City]: "/map/tiles/city.png",
}

const DIRECTIONS = [
  "south",
  "north",
  "east",
  "west",
  "south-east",
  "south-west",
  "north-east",
  "north-west",
] as const

function getDirection(dRow: number, dCol: number): string {
  if (dRow === -1 && dCol === 0) return "north"
  if (dRow === 1 && dCol === 0) return "south"
  if (dRow === 0 && dCol === -1) return "west"
  if (dRow === 0 && dCol === 1) return "east"
  if (dRow === -1 && dCol === 1) return "north-east"
  if (dRow === -1 && dCol === -1) return "north-west"
  if (dRow === 1 && dCol === 1) return "south-east"
  if (dRow === 1 && dCol === -1) return "south-west"
  return "south"
}

interface GameState {
  playerRow: number
  playerCol: number
  playerDir: string
  playerScreenX: number
  playerScreenY: number
  cameraX: number
  cameraY: number
  isMoving: boolean
  moveProgress: number
  moveFromRow: number
  moveFromCol: number
  moveToRow: number
  moveToCol: number
  keys: Set<string>
}

export function IsometricMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [nearbyStadium, setNearbyStadium] = useState<Stadium | null>(null)
  const imagesRef = useRef<Record<string, HTMLImageElement>>({})
  const stateRef = useRef<GameState>({
    playerRow: 30,
    playerCol: 19, // Start near London
    playerDir: "south",
    playerScreenX: 0,
    playerScreenY: 0,
    cameraX: 0,
    cameraY: 0,
    isMoving: false,
    moveProgress: 0,
    moveFromRow: 0,
    moveFromCol: 0,
    moveToRow: 0,
    moveToCol: 0,
    keys: new Set(),
  })

  // Load images
  useEffect(() => {
    const sources: Record<string, string> = { ...TILE_IMAGE_MAP }
    sources["stadium-large"] = "/map/objects/stadium-large.png"
    sources["stadium-medium"] = "/map/objects/stadium-medium.png"
    sources["city-marker"] = "/map/objects/city-marker.png"
    for (const d of DIRECTIONS) {
      sources[`char-${d}`] = `/map/character/${d}.png`
    }

    let count = 0
    const total = Object.keys(sources).length

    Object.entries(sources).forEach(([key, src]) => {
      const img = new Image()
      img.onload = img.onerror = () => {
        if (img.complete && img.naturalWidth > 0) {
          imagesRef.current[key] = img
        }
        if (++count >= total) setLoaded(true)
      }
      img.src = src
    })
  }, [])

  // Init camera
  useEffect(() => {
    if (!loaded) return
    const s = stateRef.current
    const pos = gridToScreen(s.playerRow, s.playerCol)
    s.playerScreenX = pos.x
    s.playerScreenY = pos.y
    s.cameraX = pos.x
    s.cameraY = pos.y
  }, [loaded])

  // Keyboard — immediate movement on keydown + held key support
  useEffect(() => {
    const tryMove = (s: GameState) => {
      if (s.isMoving) return
      let dRow = 0,
        dCol = 0
      if (s.keys.has("ArrowUp") || s.keys.has("w") || s.keys.has("W")) dRow = -1
      if (s.keys.has("ArrowDown") || s.keys.has("s") || s.keys.has("S")) dRow = 1
      if (s.keys.has("ArrowLeft") || s.keys.has("a") || s.keys.has("A")) dCol = -1
      if (s.keys.has("ArrowRight") || s.keys.has("d") || s.keys.has("D")) dCol = 1
      if (dRow === 0 && dCol === 0) return
      s.playerDir = getDirection(dRow, dCol)
      const newRow = s.playerRow + dRow
      const newCol = s.playerCol + dCol
      if (isWalkable(newRow, newCol)) {
        s.isMoving = true
        s.moveProgress = 0
        s.moveFromRow = s.playerRow
        s.moveFromCol = s.playerCol
        s.moveToRow = newRow
        s.moveToCol = newCol
      }
    }

    const down = (e: KeyboardEvent) => {
      const s = stateRef.current
      s.keys.add(e.key)
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault()
      }
      // Immediately start movement on keydown
      tryMove(s)
    }
    const up = (e: KeyboardEvent) => stateRef.current.keys.delete(e.key)
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  }, [])

  // Game loop
  useEffect(() => {
    if (!loaded || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")!
    ctx.imageSmoothingEnabled = false
    let raf: number

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener("resize", resize)

    const MOVE_SPEED = 0.1
    let lastStadiumCheck = 0

    const tryMoveFromLoop = (s: GameState) => {
      if (s.isMoving) return
      let dRow = 0,
        dCol = 0
      if (s.keys.has("ArrowUp") || s.keys.has("w") || s.keys.has("W")) dRow = -1
      if (s.keys.has("ArrowDown") || s.keys.has("s") || s.keys.has("S")) dRow = 1
      if (s.keys.has("ArrowLeft") || s.keys.has("a") || s.keys.has("A")) dCol = -1
      if (s.keys.has("ArrowRight") || s.keys.has("d") || s.keys.has("D")) dCol = 1
      if (dRow === 0 && dCol === 0) return
      s.playerDir = getDirection(dRow, dCol)
      const newRow = s.playerRow + dRow
      const newCol = s.playerCol + dCol
      if (isWalkable(newRow, newCol)) {
        s.isMoving = true
        s.moveProgress = 0
        s.moveFromRow = s.playerRow
        s.moveFromCol = s.playerCol
        s.moveToRow = newRow
        s.moveToCol = newCol
      }
    }

    const loop = () => {
      const s = stateRef.current

      // --- Movement ---
      tryMoveFromLoop(s)

      if (s.isMoving) {
        s.moveProgress += MOVE_SPEED
        if (s.moveProgress >= 1) {
          s.moveProgress = 1
          s.playerRow = s.moveToRow
          s.playerCol = s.moveToCol
          s.isMoving = false
        }
        const from = gridToScreen(s.moveFromRow, s.moveFromCol)
        const to = gridToScreen(s.moveToRow, s.moveToCol)
        s.playerScreenX = from.x + (to.x - from.x) * s.moveProgress
        s.playerScreenY = from.y + (to.y - from.y) * s.moveProgress
      }

      // Camera smooth follow
      s.cameraX += (s.playerScreenX - s.cameraX) * 0.08
      s.cameraY += (s.playerScreenY - s.cameraY) * 0.08

      // Stadium proximity check (throttled)
      lastStadiumCheck++
      if (lastStadiumCheck > 15) {
        lastStadiumCheck = 0
        const ns = getNearbyStadium(s.playerRow, s.playerCol, 3)
        setNearbyStadium(ns)
      }

      // --- Render ---
      const W = canvas.width
      const H = canvas.height
      ctx.fillStyle = "#0f2940"
      ctx.fillRect(0, 0, W, H)

      const offX = W / 2 - s.cameraX
      const offY = H / 2 - s.cameraY

      // Draw tiles (skip ocean - background color serves as ocean)
      for (let row = 0; row < MAP_ROWS; row++) {
        for (let col = 0; col < MAP_COLS; col++) {
          const tile = UK_MAP[row][col]
          if (tile === TileType.Ocean) continue

          const { x, y } = gridToScreen(row, col)
          const dx = x + offX - HALF_W
          const dy = y + offY - HALF_H

          // Viewport culling
          if (dx > W + TILE_W || dx < -TILE_W * 2 || dy > H + TILE_W || dy < -TILE_W * 2) continue

          const img = imagesRef.current[tile]
          if (img) {
            // Adjust Y based on tile height: blocks extend upward
            let yAdj = 0
            if (tile === TileType.Forest || tile === TileType.Mountain) yAdj = -20
            else if (tile === TileType.City) yAdj = -10
            ctx.drawImage(img, dx, dy + yAdj, TILE_W, TILE_W)
          }
        }
      }

      // Draw stadiums
      for (const stadium of STADIUMS) {
        const { x, y } = gridToScreen(stadium.row, stadium.col)
        const imgKey = stadium.size === "large" ? "stadium-large" : "stadium-medium"
        const img = imagesRef.current[imgKey]
        const sz = stadium.size === "large" ? 96 : 72
        if (img) {
          ctx.drawImage(img, x + offX - sz / 2, y + offY - sz + 12, sz, sz)
        }
        // Label
        ctx.font = 'bold 10px "Segoe UI", sans-serif'
        ctx.textAlign = "center"
        ctx.strokeStyle = "#000"
        ctx.lineWidth = 3
        ctx.strokeText(stadium.name, x + offX, y + offY - sz + 6)
        ctx.fillStyle = "#fff"
        ctx.fillText(stadium.name, x + offX, y + offY - sz + 6)
        // Team name
        ctx.font = '9px "Segoe UI", sans-serif'
        ctx.fillStyle = "#ffd700"
        ctx.strokeText(stadium.team, x + offX, y + offY - sz + 18)
        ctx.fillText(stadium.team, x + offX, y + offY - sz + 18)
      }

      // Draw character
      const charImg = imagesRef.current[`char-${s.playerDir}`]
      if (charImg) {
        ctx.drawImage(charImg, s.playerScreenX + offX - 34, s.playerScreenY + offY - 52, 68, 68)
      } else {
        // Fallback circle
        ctx.fillStyle = "#ff4444"
        ctx.beginPath()
        ctx.arc(s.playerScreenX + offX, s.playerScreenY + offY - 8, 8, 0, Math.PI * 2)
        ctx.fill()
      }

      // Minimap
      drawMinimap(ctx, W, H, s)

      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", resize)
    }
  }, [loaded])

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#0f2940]">
      {!loaded && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0f2940] text-white">
          <div className="mb-2 text-2xl font-bold">Loading UK Stadium Map...</div>
          <div className="text-sm opacity-60">Preparing tiles and character</div>
        </div>
      )}
      <canvas ref={canvasRef} className="block" />

      {/* HUD */}
      <div className="absolute top-4 left-4 rounded-xl bg-black/70 px-4 py-3 text-white backdrop-blur-sm">
        <h2 className="text-lg font-bold">UK Stadium Explorer</h2>
        <p className="mt-1 text-xs opacity-60">WASD / Arrow keys to move</p>
      </div>

      {/* Stadium popup */}
      {nearbyStadium && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-xl border border-yellow-500/50 bg-black/80 px-6 py-4 text-center text-white backdrop-blur-sm">
          <div className="text-xs font-semibold tracking-wider text-yellow-400 uppercase">
            Stadium Nearby
          </div>
          <div className="mt-1 text-xl font-bold">{nearbyStadium.name}</div>
          <div className="text-sm opacity-80">
            {nearbyStadium.team} — Capacity: {nearbyStadium.capacity}
          </div>
        </div>
      )}
    </div>
  )
}

// Minimap renderer
function drawMinimap(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  state: GameState
) {
  const mmW = 120
  const mmH = 160
  const mmX = canvasW - mmW - 16
  const mmY = 16
  const scaleX = mmW / MAP_COLS
  const scaleY = mmH / MAP_ROWS

  // Background
  ctx.fillStyle = "rgba(0,0,0,0.6)"
  ctx.strokeStyle = "rgba(255,255,255,0.3)"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(mmX - 4, mmY - 4, mmW + 8, mmH + 8, 8)
  ctx.fill()
  ctx.stroke()

  // Tiles
  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      const tile = UK_MAP[r][c]
      if (tile === TileType.Ocean) continue
      switch (tile) {
        case TileType.Grass:
          ctx.fillStyle = "#4a7c3f"
          break
        case TileType.Forest:
          ctx.fillStyle = "#2d5a27"
          break
        case TileType.Mountain:
          ctx.fillStyle = "#7a7a7a"
          break
        case TileType.City:
          ctx.fillStyle = "#b8a050"
          break
      }
      ctx.fillRect(mmX + c * scaleX, mmY + r * scaleY, Math.ceil(scaleX), Math.ceil(scaleY))
    }
  }

  // Stadium dots
  ctx.fillStyle = "#ff4444"
  for (const s of STADIUMS) {
    ctx.beginPath()
    ctx.arc(mmX + s.col * scaleX + scaleX / 2, mmY + s.row * scaleY + scaleY / 2, 2, 0, Math.PI * 2)
    ctx.fill()
  }

  // Player dot
  ctx.fillStyle = "#00ff88"
  ctx.beginPath()
  ctx.arc(
    mmX + state.playerCol * scaleX + scaleX / 2,
    mmY + state.playerRow * scaleY + scaleY / 2,
    3,
    0,
    Math.PI * 2
  )
  ctx.fill()
}

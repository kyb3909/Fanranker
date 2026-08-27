/**
 * 복셀 지도 그리기 — 2D 캔버스.
 *
 * 카메라가 고정이라 WebGL 이 필요 없다. 한 칸은 화면에서 **윗면 사각형 + 앞면
 * 사각형** 두 장으로 끝난다(옆면은 정면 투영이라 보이지 않는다). 지형은 정적이므로
 * 오프스크린에 한 번 굽고 그 뒤로는 복사만 한다 — 매 프레임 도는 루프가 없다.
 * (상시 애니메이션 금지는 평가 3라운드 판정 완료 사항)
 */
import { SNOW_LEVEL, TERRAIN_H, TERRAIN_W } from "./england-terrain"
import {
  cellHeight,
  DEPTH_K,
  HEIGHT_K,
  isRock,
  isSea,
  project,
  type MapTransform,
} from "./map-projection"

/** 앞면은 윗면보다 어둡게 — 이 대비가 복셀의 입체감 전부다 */
const FRONT_SHADE = 0.62

const SEA_A = "#162334"
const SEA_B = "#1a2a3e"
const SAND = ["#cdb87f", "#c2ac73"]
const GRASS = ["#4d8d49", "#548f4d", "#457f41", "#5a9a54"]
const ROCK = ["#8c8f98", "#7b7e87", "#989ea9"]
const SNOW = "#d9dfe8"

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.round(((n >> 16) & 255) * k)
  const g = Math.round(((n >> 8) & 255) * k)
  const b = Math.round((n & 255) * k)
  return `rgb(${r},${g},${b})`
}

function hash(x: number, y: number): number {
  return ((x * 73856093) ^ (y * 19349663)) >>> 0
}

function cellColor(gx: number, gy: number, h: number): string {
  if (h === 0) return ((gx + gy) & 1) === 0 ? SEA_A : SEA_B
  if (isRock(gx, gy)) return h >= SNOW_LEVEL ? SNOW : ROCK[hash(gx, gy) % ROCK.length]
  if (h === 1) return SAND[hash(gx, gy) % SAND.length]
  return GRASS[hash(gx, gy) % GRASS.length]
}

/**
 * 지형을 캔버스에 굽는다. 색이 같은 사각형을 묶어 칠하므로 fillStyle 교체가
 * 칸 수가 아니라 색 수만큼만 일어난다.
 */
export function drawTerrain(ctx: CanvasRenderingContext2D, t: MapTransform) {
  const batch = new Map<string, number[]>()
  const push = (color: string, x: number, y: number, w: number, h: number) => {
    let a = batch.get(color)
    if (!a) {
      a = []
      batch.set(color, a)
    }
    a.push(x, y, w, h)
  }

  const cw = t.s
  const chDepth = t.s * DEPTH_K

  for (let gy = 0; gy < TERRAIN_H; gy++) {
    for (let gx = 0; gx < TERRAIN_W; gx++) {
      const h = cellHeight(gx, gy)
      const p = project(t, gx, gy, h)
      const color = cellColor(gx, gy, h)
      push(color, p.x - 0.5, p.y - 0.5, cw + 1, chDepth + 1)

      if (h > 0) {
        const hFront = gy + 1 < TERRAIN_H ? cellHeight(gx, gy + 1) : 0
        const drop = h - hFront
        if (drop > 0) {
          push(
            shade(color, FRONT_SHADE),
            p.x - 0.5,
            p.y + chDepth - 0.5,
            cw + 1,
            drop * t.s * HEIGHT_K + 1
          )
        }
      }
    }
  }

  for (const [color, rects] of batch) {
    ctx.fillStyle = color
    for (let i = 0; i < rects.length; i += 4) {
      ctx.fillRect(rects[i], rects[i + 1], rects[i + 2], rects[i + 3])
    }
  }
}

// ─── 미니 구장 ───────────────────────────────────────────

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
  base: number
  top: number
  color: string
  /** 청사진(미시공) 블록 — 반투명으로 그린다 */
  ghost?: boolean
}

/** 레벨을 시공 단계로 접는다. 실루엣만으로 단계가 구분되어야 한다 (평가 P0-3) */
export function buildBand(level: number): 0 | 1 | 2 | 3 | 4 {
  if (level >= 10) return 4
  if (level >= 7) return 3
  if (level >= 4) return 2
  if (level >= 2) return 1
  return 0
}

const PAD = "#3b4353"
const PITCH = "#3f9b43"
const ROOF = "#e8e6e0"
const GOLD = "#ffd27a"
const GHOST = "#9ccdff"

const SOLID_TOP = [0.5, 0.95, 1.4, 1.85, 2.3]
const BLUEPRINT_TOP = 2.45

/** 구장 실루엣의 꼭대기 높이 — 라벨 앵커가 여기에 붙는다 */
export function stadiumTopHeight(level: number): number {
  const band = buildBand(level)
  return band === 4 ? SOLID_TOP[4] + 0.45 : BLUEPRINT_TOP
}

/** 레벨이 오를수록 발자국도 커진다 — 지도에서 성장이 크기로도 읽히게 */
export function stadiumScale(level: number): number {
  return 1.45 + (Math.min(level, 10) / 10) * 1.0
}

export function stadiumBoxes(level: number, color: string): Box[] {
  const band = buildBand(level)
  const done = band === 4
  const solid = SOLID_TOP[band]
  const boxes: Box[] = []

  boxes.push({ x0: -2.95, y0: -2.25, x1: 2.95, y1: 2.25, base: 0, top: 0.28, color: PAD })
  boxes.push({ x0: -1.8, y0: -1.3, x1: 1.8, y1: 1.3, base: 0.28, top: 0.5, color: PITCH })

  const stands: [number, number, number, number][] = [
    [-2.45, -2.25, 2.45, -1.3], // 북
    [-2.45, 1.3, 2.45, 2.25], // 남
    [-2.95, -1.3, -2.45, 1.3], // 서
    [2.45, -1.3, 2.95, 1.3], // 동
  ]
  // 터파기 단계는 스탠드 대신 모서리 기둥만 — "아직 땅만 팠다"가 한눈에 보이게
  const corners: [number, number, number, number][] = [
    [-2.95, -2.25, -2.2, -1.45],
    [2.2, -2.25, 2.95, -1.45],
    [-2.95, 1.45, -2.2, 2.25],
    [2.2, 1.45, 2.95, 2.25],
  ]

  const solidParts = band === 0 ? corners : band === 1 ? stands.slice(0, 2) : stands
  for (const [x0, y0, x1, y1] of solidParts) {
    boxes.push({ x0, y0, x1, y1, base: 0.28, top: solid, color })
  }

  if (!done) {
    // 남은 자리는 청사진으로 세워둔다 — 빈 땅도 "될 것"으로 보이게 (PM 출시 조건)
    for (const [x0, y0, x1, y1] of stands) {
      boxes.push({ x0, y0, x1, y1, base: solid, top: BLUEPRINT_TOP, color: GHOST, ghost: true })
    }
  } else {
    const roofY = SOLID_TOP[4]
    const ring: [number, number, number, number][] = [
      [-3.15, -2.5, 3.15, -1.55],
      [-3.15, 1.55, 3.15, 2.5],
      [-3.15, -1.55, -2.35, 1.55],
      [2.35, -1.55, 3.15, 1.55],
    ]
    for (const [x0, y0, x1, y1] of ring) {
      boxes.push({ x0, y0, x1, y1, base: roofY, top: roofY + 0.3, color: ROOF })
    }
    // 금테 — 완공의 표식. 지도·모달·칩에서 같은 기호를 쓴다
    for (const [x0, y0, x1, y1] of ring) {
      boxes.push({ x0, y0, x1, y1, base: roofY + 0.3, top: roofY + 0.45, color: GOLD })
    }
  }
  return boxes
}

export function drawStadium(
  ctx: CanvasRenderingContext2D,
  t: MapTransform,
  gx: number,
  gy: number,
  ground: number,
  level: number,
  color: string
) {
  const sc = stadiumScale(level)
  const boxes = stadiumBoxes(level, color)
  // 뒤에서 앞으로, 아래에서 위로.
  // ⚠️ 앞모서리(y1)로 정렬하면 발자국이 제일 큰 부지가 마지막에 그려져 잔디·스탠드를
  //    통째로 덮는다. 뒷모서리(y0) → 바닥높이(base) 순이라야 겹침이 맞는다.
  boxes.sort((a, b) => a.y0 - b.y0 || a.base - b.base || a.top - b.top)

  for (const b of boxes) {
    const x0 = gx + b.x0 * sc
    const x1 = gx + b.x1 * sc
    const y0 = gy + b.y0 * sc
    const y1 = gy + b.y1 * sc
    const top = ground + b.top
    const base = ground + b.base

    const pTop = project(t, x0, y0, top)
    const pFront = project(t, x0, y1, top)
    const w = (x1 - x0) * t.s
    const depth = (y1 - y0) * t.s * DEPTH_K
    const wallH = (top - base) * t.s * HEIGHT_K

    ctx.globalAlpha = b.ghost ? 0.62 : 1
    ctx.fillStyle = b.color
    ctx.fillRect(pTop.x - 0.4, pTop.y - 0.4, w + 0.8, depth + 0.8)
    if (wallH > 0.2) {
      ctx.fillStyle = b.ghost ? b.color : shade(b.color, FRONT_SHADE)
      ctx.globalAlpha = b.ghost ? 0.42 : 1
      ctx.fillRect(pFront.x - 0.4, pFront.y - 0.4, w + 0.8, wallH + 0.8)
    }
  }
  ctx.globalAlpha = 1
}

/**
 * 바닥 진행률 링 — 다음 레벨까지. 지면 원은 화면에서 타원이 된다.
 * 완공 팀에는 그리지 않는다(상태가 잠겼다는 표시 — 평가 R2-P1-1).
 */
export function drawProgressRing(
  ctx: CanvasRenderingContext2D,
  t: MapTransform,
  gx: number,
  gy: number,
  ground: number,
  level: number,
  pct: number,
  color: string
) {
  if (level >= 10) return
  const r = 3.5 * stadiumScale(level) * t.s
  const c = project(t, gx, gy, ground)
  const cx = c.x + t.s / 2
  const cy = c.y + (t.s * DEPTH_K) / 2
  const lw = Math.max(2, t.s * 0.45)

  ctx.lineWidth = lw
  ctx.strokeStyle = "rgba(242,239,232,0.3)"
  ctx.beginPath()
  ctx.ellipse(cx, cy, r, r * DEPTH_K, 0, 0, Math.PI * 2)
  ctx.stroke()

  if (pct > 0) {
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.ellipse(
      cx,
      cy,
      r,
      r * DEPTH_K,
      0,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * Math.min(1, pct)
    )
    ctx.stroke()
  }
}

/** 더비 점선 — 두 구장을 잇는다. 지형색과 싸우지 않게 밝은 분홍 */
export function drawDerbyLine(
  ctx: CanvasRenderingContext2D,
  t: MapTransform,
  a: { gx: number; gy: number; ground: number },
  b: { gx: number; gy: number; ground: number }
) {
  const pa = project(t, a.gx, a.gy, a.ground + 1.2)
  const pb = project(t, b.gx, b.gy, b.ground + 1.2)
  ctx.save()
  ctx.lineCap = "round"
  ctx.strokeStyle = "rgba(255,130,150,0.34)"
  ctx.lineWidth = Math.max(4, t.s * 0.9)
  ctx.beginPath()
  ctx.moveTo(pa.x, pa.y)
  ctx.lineTo(pb.x, pb.y)
  ctx.stroke()
  ctx.strokeStyle = "#ffb3c0"
  ctx.lineWidth = Math.max(1.5, t.s * 0.34)
  ctx.setLineDash([Math.max(4, t.s * 1.1), Math.max(3, t.s * 0.7)])
  ctx.beginPath()
  ctx.moveTo(pa.x, pa.y)
  ctx.lineTo(pb.x, pb.y)
  ctx.stroke()
  ctx.restore()
}

/** 선택된 구장 강조 — 지면 타원 하이라이트 */
export function drawFocusRing(
  ctx: CanvasRenderingContext2D,
  t: MapTransform,
  gx: number,
  gy: number,
  ground: number,
  level: number
) {
  const r = 4.3 * stadiumScale(level) * t.s
  const c = project(t, gx, gy, ground)
  ctx.save()
  ctx.strokeStyle = "rgba(255,255,255,0.85)"
  ctx.lineWidth = Math.max(2, t.s * 0.4)
  ctx.beginPath()
  ctx.ellipse(c.x + t.s / 2, c.y + (t.s * DEPTH_K) / 2, r, r * DEPTH_K, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

export { isSea }

/**
 * 복셀 지도 그리기 — 2D 캔버스.
 *
 * 카메라가 고정이라 WebGL 이 필요 없다. 한 칸은 화면에서 **윗면 사각형 + 앞면
 * 사각형** 두 장으로 끝난다(옆면은 정면 투영이라 보이지 않는다). 지형은 정적이므로
 * 오프스크린에 한 번 굽고 그 뒤로는 복사만 한다 — 매 프레임 도는 루프가 없다.
 * (상시 애니메이션 금지는 평가 3라운드 판정 완료 사항)
 *
 * 역할 분담 (2026-08-27 운영자 확정):
 *   지도  — 팀 자리는 **핀**으로만 찍는다. 40px 짜리 구장 미니어처는 정보도 없이
 *           지저분하기만 했다.
 *   모달  — 구장 한 채를 3/4 로 세워 크게 보여준다. 여기가 구장을 보는 자리다.
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
import type { BowlConfig } from "./map-teams"

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

// ─── 지도 핀 ─────────────────────────────────────────────

/** 핀 머리 반지름(px). 손가락 하한(44px)은 라벨 칩과 히트 반경이 맡는다 */
const PIN_R = 9
const PIN_LIFT = 2.3

/** 핀 꼭대기까지의 화면 높이 — 라벨 리더선이 여기에 닿는다 */
export const PIN_HEIGHT = PIN_R * PIN_LIFT + PIN_R

/**
 * 팀 자리 핀. 지도에서는 이것만 찍는다.
 * 완공(LV.10)은 금테로 구분한다 — 지도·칩·모달이 같은 기호를 쓴다.
 */
export function drawPin(
  ctx: CanvasRenderingContext2D,
  t: MapTransform,
  gx: number,
  gy: number,
  ground: number,
  color: string,
  opts: { done: boolean; selected: boolean }
) {
  const base = project(t, gx, gy, ground)
  const cx = base.x
  const cy = base.y - PIN_R * PIN_LIFT

  ctx.save()

  // 지면 그림자 — 핀이 어느 칸에 꽂혔는지 알려준다
  ctx.fillStyle = "rgba(0,0,0,0.38)"
  ctx.beginPath()
  ctx.ellipse(cx, base.y, PIN_R * 0.85, PIN_R * 0.34, 0, 0, Math.PI * 2)
  ctx.fill()

  // 다리
  ctx.fillStyle = shade(color, 0.72)
  ctx.beginPath()
  ctx.moveTo(cx - PIN_R * 0.42, cy)
  ctx.lineTo(cx + PIN_R * 0.42, cy)
  ctx.lineTo(cx, base.y)
  ctx.closePath()
  ctx.fill()

  if (opts.selected) {
    ctx.strokeStyle = "rgba(255,255,255,0.55)"
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(cx, cy, PIN_R + 5, 0, Math.PI * 2)
    ctx.stroke()
  }

  // 머리
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(cx, cy, PIN_R, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 2.5
  ctx.strokeStyle = opts.done ? "#ffd27a" : "#f2efe8"
  ctx.stroke()

  // 속 점
  ctx.fillStyle = opts.done ? "#ffd27a" : "rgba(242,239,232,0.9)"
  ctx.beginPath()
  ctx.arc(cx, cy, PIN_R * 0.32, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

// ─── 구장 보울 (모달 전용) ────────────────────────────────
//
// 3D 시안(scratchpad stadium-3d-app.js)의 generate() 를 옮겼다. 치수도 시안 값
// 그대로다 — 잔디 32×21, 보울 37×26, 단 간격 1.22, 초타원 지수는 팀별.
// 시안이 8점을 받은 그림이 이것이라, 근사하지 않고 규칙째로 가져온다.

const M_PX = 32
const M_PZ = 21
const M_ARX = 37
const M_ARZ = 26
const M_STEP = 1.22

/** 관중석 한 단의 높이 (모델 단위) */
const M_TIER_H = 1.1

const APRON_FALLBACK = "#39404f"
const CONCRETE = "#9a9ca2"
const BOX_SEAT = "#232733"
const PITCH_A = "#2f7d3a"
const PITCH_B = "#3b8f46"
const PITCH_LINE = "#e4e4dc"
const ROOF_DECK = "#d4d7dc"
const ROOF_DARK = "#565b66"
const GOLD = "#ffd27a"
const GHOST = "#9ccdff"

/** 모달 시점 — 3/4 로 세워 본다. 깊이를 눌러 관중석 앞면이 보이게 */
const HERO_DEPTH_K = 0.52
const HERO_HEIGHT_K = 1.7
/** 모델을 뜨는 간격 — 작을수록 촘촘하다 */
const HERO_CELL = 1.35

function inSuper(x: number, z: number, rx: number, rz: number, n: number): boolean {
  return Math.pow(Math.abs(x / rx), n) + Math.pow(Math.abs(z / rz), n) <= 1
}

/**
 * 시공률 — 레벨 1 은 터파기(관중석 0단), 레벨 10 은 완공.
 * 단이 하나씩 청사진에서 실물로 바뀌는 것이 "벽돌이 쌓인다"의 시각적 대응이다.
 */
function buildFraction(level: number): number {
  return Math.min(1, 0.06 + ((Math.min(Math.max(level, 1), 10) - 1) / 9) * 0.94)
}

function tierCount(cfg: BowlConfig) {
  const extra = cfg.bigEnd ? (cfg.bigExtra ?? 6) : 0
  return { tiers: cfg.tiers, maxTiers: cfg.tiers + extra }
}

/** 구장 한 채가 차지하는 모델 크기 — 모달이 배율을 역산할 때 쓴다 */
export function stadiumExtent(level: number, cfg: BowlConfig) {
  const { maxTiers } = tierCount(cfg)
  const done = level >= 10
  const rings = maxTiers + (done ? 1.6 : 0)
  return {
    halfX: M_ARX + rings * M_STEP,
    halfZ: M_ARZ + rings * M_STEP,
    topH: (maxTiers + (done ? 2.4 : 0.8)) * M_TIER_H,
    depthK: HERO_DEPTH_K,
    heightK: HERO_HEIGHT_K,
  }
}

interface Column {
  h: number
  color: string
  ghost: boolean
}

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol

/**
 * 구장 한 채를 기둥 격자로 만든다. 격자 한 칸이 화면에서 윗면·앞면 두 장이 되고,
 * 단이 밖으로 갈수록 높아지므로 앞면들이 계단처럼 겹쳐 관중석이 된다.
 */
function buildColumns(cfg: BowlConfig, level: number) {
  const { tiers, maxTiers } = tierCount(cfg)
  const cs = HERO_CELL
  const built = buildFraction(level)
  const done = level >= 10
  const tol = cs / 2

  const outerX = M_ARX + (maxTiers + (done ? 1.6 : 0)) * M_STEP
  const outerZ = M_ARZ + (maxTiers + (done ? 1.6 : 0)) * M_STEP
  const NX = Math.ceil(outerX / cs) + 1
  const NZ = Math.ceil(outerZ / cs) + 1
  const W = NX * 2 + 1
  const grid: (Column | null)[] = new Array(W * (NZ * 2 + 1)).fill(null)
  const put = (i: number, j: number, c: Column) => {
    grid[(j + NZ) * W + (i + NX)] = c
  }

  const inSector = (x: number, z: number) => {
    if (!cfg.bigEnd) return false
    const len = Math.hypot(x, z) || 1
    return (x * cfg.bigEnd[0] + z * cfg.bigEnd[1]) / len > 0.62
  }

  // 잔디 + 에이프런 — 부지는 처음부터 있다 (빈 땅이 아니라 "지을 자리")
  for (let j = -NZ; j <= NZ; j++) {
    for (let i = -NX; i <= NX; i++) {
      const x = i * cs
      const z = j * cs
      const ax = Math.abs(x)
      const az = Math.abs(z)
      if (ax <= M_PX + tol && az <= M_PZ + tol) {
        // 시안의 라인 규칙 — 터치라인·하프웨이·센터서클·페널티·골에어리어
        const line =
          near(ax, M_PX, tol) ||
          near(az, M_PZ, tol) ||
          near(x, 0, tol) ||
          (near(Math.hypot(x, z), 11, tol) && ax > tol) ||
          (ax >= M_PX - 10 - tol && near(az, 12, tol)) ||
          (near(ax, M_PX - 10, tol) && az <= 12 + tol) ||
          (ax >= M_PX - 3 - tol && near(az, 5, tol)) ||
          (near(ax, M_PX - 3, tol) && az <= 5 + tol)
        const stripe = Math.floor((x + M_PX) / 8) % 2 === 0
        put(i, j, { h: 0, color: line ? PITCH_LINE : stripe ? PITCH_A : PITCH_B, ghost: false })
      } else if (inSuper(x, z, M_ARX, M_ARZ, cfg.n)) {
        put(i, j, { h: 0, color: cfg.apron ?? APRON_FALLBACK, ghost: false })
      }
    }
  }

  // 관중석 단 — 안에서 밖으로, 한 단씩 높아진다
  for (let t = 0; t < maxTiers; t++) {
    const rx0 = M_ARX + t * M_STEP
    const rz0 = M_ARZ + t * M_STEP
    const rx1 = rx0 + M_STEP
    const rz1 = rz0 + M_STEP
    const isBuilt = (t + 1) / maxTiers <= built
    const lim = Math.ceil(rx1 / cs) + 1
    const limz = Math.ceil(rz1 / cs) + 1

    for (let j = -limz; j <= limz; j++) {
      for (let i = -lim; i <= lim; i++) {
        if (i < -NX || i > NX || j < -NZ || j > NZ) continue
        const x = i * cs
        const z = j * cs
        if (!inSuper(x, z, rx1, rz1, cfg.n)) continue
        if (inSuper(x, z, rx0, rz0, cfg.n)) continue
        if (t >= tiers && !inSector(x, z)) continue

        let color: string
        if (!isBuilt) color = GHOST
        else if (cfg.boxRow && t === cfg.boxRow) color = BOX_SEAT
        else {
          // 방사형 통로 — 좌석을 끊어 계단이 보이게 한다 (시안 tierType)
          const u = ((((Math.atan2(z, x) * 12) / Math.PI) % 1) + 1) % 1
          const radial = Math.abs(u - 0.5) < 0.05
          color =
            radial || t % 5 === 4 ? CONCRETE : cfg.seat[Math.abs(i * 7 + j * 13) % cfg.seat.length]
        }
        put(i, j, { h: 1 + t, color, ghost: !isBuilt })
      }
    }
  }

  // 지붕 — 완공한 구장만. 데크 위에 금테
  if (done) {
    const rIn = M_ARX + (maxTiers - 0.1) * M_STEP
    const rzIn = M_ARZ + (maxTiers - 0.1) * M_STEP
    const rOut = M_ARX + (maxTiers + 1.6) * M_STEP
    const rzOut = M_ARZ + (maxTiers + 1.6) * M_STEP
    const deck = cfg.roof === "dark" ? ROOF_DARK : ROOF_DECK
    const lim = Math.ceil(rOut / cs) + 1
    const limz = Math.ceil(rzOut / cs) + 1
    for (let j = -limz; j <= limz; j++) {
      for (let i = -lim; i <= lim; i++) {
        if (i < -NX || i > NX || j < -NZ || j > NZ) continue
        const x = i * cs
        const z = j * cs
        if (!inSuper(x, z, rOut, rzOut, cfg.n)) continue
        if (inSuper(x, z, rIn, rzIn, cfg.n)) continue
        const outer = !inSuper(x, z, rOut - M_STEP * 1.2, rzOut - M_STEP * 1.2, cfg.n)
        put(i, j, { h: maxTiers + 2.4, color: outer ? GOLD : deck, ghost: false })
      }
    }
  }

  return { grid, W, NX, NZ, cs }
}

/**
 * 구장 한 채를 그린다 (모달 히어로).
 * origin.scale 은 모델 1 단위가 화면 몇 px 인가.
 */
export function drawStadium(
  ctx: CanvasRenderingContext2D,
  origin: { x: number; y: number; scale: number },
  level: number,
  cfg: BowlConfig
) {
  const { grid, W, NX, NZ, cs } = buildColumns(cfg, level)
  const s = origin.scale
  const cellW = cs * s
  const cellD = cs * s * HERO_DEPTH_K
  const hUnit = M_TIER_H * s * HERO_HEIGHT_K

  const at = (i: number, j: number) =>
    i < -NX || i > NX || j < -NZ || j > NZ ? null : grid[(j + NZ) * W + (i + NX)]

  // 뒤에서 앞으로 — 앞 기둥이 뒤 기둥의 아랫부분을 덮는다
  for (let j = -NZ; j <= NZ; j++) {
    for (let i = -NX; i <= NX; i++) {
      const col = at(i, j)
      if (!col) continue
      const sx = origin.x + i * cellW
      const sy = origin.y + j * cellD - col.h * hUnit

      ctx.globalAlpha = col.ghost ? 0.5 : 1
      ctx.fillStyle = col.color
      ctx.fillRect(sx - 0.4, sy - 0.4, cellW + 0.8, cellD + 0.8)

      const front = at(i, j + 1)
      const drop = col.h - (front ? front.h : 0)
      if (drop > 0) {
        ctx.fillStyle = col.ghost ? col.color : shade(col.color, FRONT_SHADE)
        ctx.globalAlpha = col.ghost ? 0.32 : 1
        ctx.fillRect(sx - 0.4, sy + cellD - 0.4, cellW + 0.8, drop * hUnit + 0.8)
      }
    }
  }
  ctx.globalAlpha = 1
}

/** 더비 점선 — 두 핀을 잇는다. 지형색과 싸우지 않게 밝은 분홍 */
export function drawDerbyLine(
  ctx: CanvasRenderingContext2D,
  t: MapTransform,
  a: { gx: number; gy: number; ground: number },
  b: { gx: number; gy: number; ground: number }
) {
  const pa = project(t, a.gx, a.gy, a.ground)
  const pb = project(t, b.gx, b.gy, b.ground)
  ctx.save()
  ctx.lineCap = "round"
  ctx.strokeStyle = "rgba(255,130,150,0.3)"
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(pa.x, pa.y)
  ctx.lineTo(pb.x, pb.y)
  ctx.stroke()
  ctx.strokeStyle = "#ffb3c0"
  ctx.lineWidth = 2
  ctx.setLineDash([6, 4])
  ctx.beginPath()
  ctx.moveTo(pa.x, pa.y)
  ctx.lineTo(pb.x, pb.y)
  ctx.stroke()
  ctx.restore()
}

export { isSea }

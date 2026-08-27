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

// ─── 구장 보울 ───────────────────────────────────────────
//
// 3D 시안(scratchpad stadium-3d-app.js)의 생성 규칙을 그대로 옮겼다: 초타원 링을
// 한 단씩 밖으로·위로 쌓아 그릇을 만들고, 안쪽은 잔디, 바깥 테두리는 에이프런.
// 상자 몇 개로 흉내내면 지도에서는 넘어가도 모달에서 정체가 드러난다 — 같은 모델을
// 크기만 바꿔 두 곳에 쓴다.

/**
 * 구장 모델의 자체 좌표계 (월드 격자가 아니다).
 *
 * ⚠️ 화면에서 깊이가 DEPTH_K(0.62)만큼 눌리므로 **Z 를 그만큼 늘려서** 만든다.
 *    안 그러면 축구장이 가로로 퍼진 납작한 타원이 된다 (105:68 이 화면에서 2.4:1 이 됨).
 */
const PITCH_RX = 7
const PITCH_RZ = 7.2
const BOWL_RX = 8.4
const BOWL_RZ = 8.7
const TIER_STEP = 0.9
const TIER_STEP_Z = TIER_STEP / DEPTH_K

/** 모델 1칸 = 월드 몇 칸인가 (구장 하나의 반지름이 월드 3칸 남짓이 되도록) */
const WORLD_PER_MODEL = 0.2
/** 모델 높이 1단 = 월드 높이 얼마인가 */
const WORLD_H_PER_MODEL = 0.3

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

function inSuper(x: number, z: number, rx: number, rz: number, n: number): boolean {
  return Math.pow(Math.abs(x / rx), n) + Math.pow(Math.abs(z / rz), n) <= 1
}

/** 지도 위 구장이 차지하는 자리 — 레벨이 올라도 부지는 그대로, 관중석만 자란다 */
export function stadiumScale(level: number): number {
  return 1.35 + (Math.min(level, 10) / 10) * 0.3
}

/** 모델 최대 단수 — 실제 구장의 단수를 지도 크기에 맞게 접는다 */
function modelTiers(cfg: BowlConfig): number {
  return Math.max(3, Math.round(cfg.tiers / 3.4))
}

/**
 * 시공률 — 레벨 1 은 터파기(관중석 0단), 레벨 10 은 완공.
 * 단이 하나씩 실물로 바뀌는 것이 곧 "벽돌이 쌓인다"의 시각적 대응이다.
 */
function buildFraction(level: number): number {
  return Math.min(1, 0.06 + ((Math.min(Math.max(level, 1), 10) - 1) / 9) * 0.94)
}

function extraTiers(cfg: BowlConfig): number {
  return cfg.bigEnd ? Math.max(1, Math.round((cfg.bigExtra ?? 6) / 3.4)) : 0
}

export function stadiumTopHeight(level: number, cfg: BowlConfig): number {
  const roof = level >= 10 ? 1.6 : 0
  return (1 + modelTiers(cfg) + extraTiers(cfg) + roof) * WORLD_H_PER_MODEL
}

/** 구장이 실제로 차지하는 월드 크기 — 모달 배율·라벨 회피 상자가 이 값을 쓴다 */
export function stadiumExtent(level: number, cfg: BowlConfig) {
  const sc = stadiumScale(level)
  const rings = modelTiers(cfg) + extraTiers(cfg) + (level >= 10 ? 1.1 : 0)
  const unit = WORLD_PER_MODEL * sc
  return {
    halfX: (BOWL_RX + rings * TIER_STEP) * unit,
    halfZ: (BOWL_RZ + rings * TIER_STEP_Z) * unit,
    topH: stadiumTopHeight(level, cfg),
  }
}

interface Column {
  h: number
  color: string
  ghost: boolean
}

/**
 * 구장 한 채를 기둥 격자로 만든다. 격자 한 칸이 화면에서 윗면·앞면 두 장이 된다.
 * 단이 밖으로 갈수록 높아지므로 앞면들이 계단처럼 겹쳐 관중석이 된다.
 */
function buildColumns(cfg: BowlConfig, level: number) {
  const tiers = modelTiers(cfg)
  const maxTiers = tiers + extraTiers(cfg)
  const built = buildFraction(level)
  const done = level >= 10

  const MX = Math.ceil(BOWL_RX + maxTiers * TIER_STEP) + 1
  const MZ = Math.ceil(BOWL_RZ + maxTiers * TIER_STEP_Z) + 1
  const W = MX * 2 + 1
  const grid: (Column | null)[] = new Array(W * (MZ * 2 + 1)).fill(null)
  const put = (mx: number, mz: number, c: Column) => {
    grid[(mz + MZ) * W + (mx + MX)] = c
  }

  const inSector = (x: number, z: number) => {
    if (!cfg.bigEnd) return false
    const len = Math.hypot(x, z) || 1
    return (x * cfg.bigEnd[0] + z * cfg.bigEnd[1]) / len > 0.62
  }

  // 잔디 + 에이프런 (부지는 처음부터 있다 — 빈 땅이 아니라 "지을 자리")
  for (let mz = -MZ; mz <= MZ; mz++) {
    for (let mx = -MX; mx <= MX; mx++) {
      if (Math.abs(mx) <= PITCH_RX && Math.abs(mz) <= PITCH_RZ) {
        const ax = Math.abs(mx)
        const az = Math.abs(mz)
        const line =
          mx === 0 || // 하프웨이
          ax === PITCH_RX ||
          az === PITCH_RZ || // 터치라인
          Math.abs(Math.hypot(mx, mz * DEPTH_K) - 2.4) < 0.4 || // 센터서클
          (ax === PITCH_RX - 2 && az <= 3) || // 페널티박스
          (ax >= PITCH_RX - 2 && az === 3)
        const stripe = Math.floor((mx + PITCH_RX) / 2) % 2 === 0
        put(mx, mz, {
          h: 0,
          color: line ? PITCH_LINE : stripe ? PITCH_A : PITCH_B,
          ghost: false,
        })
      } else if (inSuper(mx, mz, BOWL_RX, BOWL_RZ, cfg.n)) {
        put(mx, mz, { h: 0, color: cfg.apron ?? APRON_FALLBACK, ghost: false })
      }
    }
  }

  // 관중석 단 — 안에서 밖으로, 한 단씩 높아진다
  for (let t = 0; t < maxTiers; t++) {
    const rx0 = BOWL_RX + t * TIER_STEP
    const rz0 = BOWL_RZ + t * TIER_STEP_Z
    const rx1 = rx0 + TIER_STEP
    const rz1 = rz0 + TIER_STEP_Z
    const h = 1 + t
    const isBuilt = (t + 1) / maxTiers <= built
    const lim = Math.ceil(rx1) + 1
    const limz = Math.ceil(rz1) + 1

    for (let mz = -limz; mz <= limz; mz++) {
      for (let mx = -lim; mx <= lim; mx++) {
        if (mx < -MX || mx > MX || mz < -MZ || mz > MZ) continue
        if (!inSuper(mx, mz, rx1, rz1, cfg.n)) continue
        if (inSuper(mx, mz, rx0, rz0, cfg.n)) continue
        if (t >= tiers && !inSector(mx, mz)) continue

        let color: string
        if (!isBuilt) color = GHOST
        else if (cfg.boxRow && t === Math.round(cfg.boxRow / 3.4)) color = BOX_SEAT
        else {
          // 방사형 통로 — 좌석 사이를 콘크리트로 끊어 계단이 보이게 한다
          const ang = Math.atan2(mz, mx)
          const radial = Math.abs((((ang * 8) / Math.PI) % 1) - 0.5) < 0.07
          color = radial ? CONCRETE : cfg.seat[hash(mx, mz) % cfg.seat.length]
        }
        put(mx, mz, { h, color, ghost: !isBuilt })
      }
    }
  }

  // 지붕 — 완공한 구장만. 흰 데크 위에 금테 (완공 표식은 지도·칩·모달이 같은 기호를 쓴다)
  if (done) {
    const rIn = BOWL_RX + (maxTiers - 0.1) * TIER_STEP
    const rzIn = BOWL_RZ + (maxTiers - 0.1) * TIER_STEP_Z
    const rOut = BOWL_RX + (maxTiers + 1.5) * TIER_STEP
    const rzOut = BOWL_RZ + (maxTiers + 1.5) * TIER_STEP_Z
    const deck = cfg.roof === "dark" ? ROOF_DARK : ROOF_DECK
    const lim = Math.ceil(rOut) + 1
    const limz = Math.ceil(rzOut) + 1
    for (let mz = -limz; mz <= limz; mz++) {
      for (let mx = -lim; mx <= lim; mx++) {
        if (mx < -MX || mx > MX || mz < -MZ || mz > MZ) continue
        if (!inSuper(mx, mz, rOut, rzOut, cfg.n)) continue
        if (inSuper(mx, mz, rIn, rzIn, cfg.n)) continue
        const outer = !inSuper(mx, mz, rOut - 0.9, rzOut - 0.9, cfg.n)
        put(mx, mz, { h: 1 + maxTiers + 0.6, color: outer ? GOLD : deck, ghost: false })
      }
    }
  }

  return { grid, W, MX, MZ }
}

export function drawStadium(
  ctx: CanvasRenderingContext2D,
  t: MapTransform,
  gx: number,
  gy: number,
  ground: number,
  level: number,
  cfg: BowlConfig
) {
  const sc = stadiumScale(level)
  const { grid, W, MX, MZ } = buildColumns(cfg, level)
  const unit = WORLD_PER_MODEL * sc
  const cellW = unit * t.s
  const cellD = unit * t.s * DEPTH_K
  const hUnit = WORLD_H_PER_MODEL * t.s * HEIGHT_K

  const at = (mx: number, mz: number) =>
    mx < -MX || mx > MX || mz < -MZ || mz > MZ ? null : grid[(mz + MZ) * W + (mx + MX)]

  // 뒤에서 앞으로 — 앞 기둥이 뒤 기둥의 아랫부분을 덮는다
  for (let mz = -MZ; mz <= MZ; mz++) {
    for (let mx = -MX; mx <= MX; mx++) {
      const col = at(mx, mz)
      if (!col) continue
      const wx = gx + mx * unit
      const wy = gy + mz * unit
      const p = project(t, wx, wy, ground + col.h * WORLD_H_PER_MODEL)

      ctx.globalAlpha = col.ghost ? 0.5 : 1
      ctx.fillStyle = col.color
      ctx.fillRect(p.x - 0.4, p.y - 0.4, cellW + 0.8, cellD + 0.8)

      const front = at(mx, mz + 1)
      const drop = col.h - (front ? front.h : 0)
      if (drop > 0) {
        ctx.fillStyle = col.ghost ? col.color : shade(col.color, FRONT_SHADE)
        ctx.globalAlpha = col.ghost ? 0.32 : 1
        ctx.fillRect(p.x - 0.4, p.y + cellD - 0.4, cellW + 0.8, drop * hUnit + 0.8)
      }
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
  const r = 3.4 * stadiumScale(level) * t.s
  const c = project(t, gx, gy, ground)
  const lw = Math.max(2, t.s * 0.42)

  ctx.lineWidth = lw
  ctx.strokeStyle = "rgba(242,239,232,0.3)"
  ctx.beginPath()
  ctx.ellipse(c.x, c.y, r, r * DEPTH_K, 0, 0, Math.PI * 2)
  ctx.stroke()

  if (pct > 0) {
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.ellipse(
      c.x,
      c.y,
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
  const r = 4.1 * stadiumScale(level) * t.s
  const c = project(t, gx, gy, ground)
  ctx.save()
  ctx.strokeStyle = "rgba(255,255,255,0.85)"
  ctx.lineWidth = Math.max(2, t.s * 0.4)
  ctx.beginPath()
  ctx.ellipse(c.x, c.y, r, r * DEPTH_K, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

export { isSea }

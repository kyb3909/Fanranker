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
 *   모달  — 3D 시안에서 미리 구운 스틸(public/stadium/renders/)을 띄운다.
 *           브라우저에서 실시간으로 다시 그리지 않는다 — scripts/render-stadiums.mjs 참조.
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

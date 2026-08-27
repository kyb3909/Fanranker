/**
 * 경기장 지도 투영 — 북쪽이 위인 사투영(oblique).
 *
 * 카메라는 고정이다(자유 회전·핀치줌 없음 — 평가 3라운드에서 판정 완료). 그래서
 * 45° 등축 대신 **정면에서 기울여 내려다보는** 투영을 쓴다. 격자 X 는 화면 X 로
 * 그대로 가고, 격자 Y(깊이)는 DEPTH_K 만큼 눌리고, 높이는 화면 Y 를 끌어올린다.
 * 45° 등축을 쓰면 브리튼 섬이 대각선으로 돌아가 지도로 못 읽힌다.
 *
 * 캔버스와 DOM 라벨이 **같은 변환**을 써야 라벨이 구장 위에 정확히 붙는다.
 * 그래서 변환 계산은 여기 한 곳에만 둔다.
 */
import { TERRAIN, TERRAIN_W, TERRAIN_H } from "./england-terrain"

/** 격자 한 칸의 깊이가 화면에서 차지하는 비율 */
export const DEPTH_K = 0.62
/** 높이 한 단이 화면에서 끌어올리는 비율 */
export const HEIGHT_K = 0.5

export interface MapTransform {
  /** 격자 한 칸의 화면 픽셀 크기 */
  s: number
  ox: number
  oy: number
}

export interface Point {
  x: number
  y: number
}

const SEA_CHAR = "."

/** 한 칸의 높이(단). 바다는 0 */
export function cellHeight(gx: number, gy: number): number {
  if (gx < 0 || gy < 0 || gx >= TERRAIN_W || gy >= TERRAIN_H) return 0
  const c = TERRAIN[gy].charCodeAt(gx)
  if (c === 46) return 0 // '.'
  if (c >= 65) return c - 64 // 'A'~ 암석
  return c - 48 // '1'~ 초지
}

export function isRock(gx: number, gy: number): boolean {
  if (gx < 0 || gy < 0 || gx >= TERRAIN_W || gy >= TERRAIN_H) return false
  return TERRAIN[gy].charCodeAt(gx) >= 65
}

export function isSea(gx: number, gy: number): boolean {
  if (gx < 0 || gy < 0 || gx >= TERRAIN_W || gy >= TERRAIN_H) return true
  return TERRAIN[gy][gx] === SEA_CHAR
}

/** 육지 격자 경계 — fit-bounds 의 기준. 모듈 로드 시 한 번만 훑는다 */
const LAND = (() => {
  let minX = TERRAIN_W
  let maxX = 0
  let minY = TERRAIN_H
  let maxY = 0
  let maxH = 1
  for (let y = 0; y < TERRAIN_H; y++) {
    const row = TERRAIN[y]
    for (let x = 0; x < TERRAIN_W; x++) {
      if (row[x] === SEA_CHAR) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      const h = cellHeight(x, y)
      if (h > maxH) maxH = h
    }
  }
  return { minX, maxX, minY, maxY, maxH }
})()

export const LAND_BOUNDS = LAND

export function project(t: MapTransform, gx: number, gy: number, h: number): Point {
  return {
    x: gx * t.s + t.ox,
    y: (gy * DEPTH_K - h * HEIGHT_K) * t.s + t.oy,
  }
}

/** 화면 좌표 → 지면(높이 0) 격자 좌표. 마커 히트 테스트용 근사 */
export function unproject(t: MapTransform, sx: number, sy: number): Point {
  return {
    x: (sx - t.ox) / t.s,
    y: (sy - t.oy) / (t.s * DEPTH_K),
  }
}

export interface FitOptions {
  /** 라벨이 화면 밖으로 밀려나지 않도록 지도 둘레에 비워두는 여백(px) */
  padX: number
  padTop: number
  padBottom: number
  /** 섬 전체 대신 이 격자 영역에 맞춘다 (좁은 화면에서 구장 쪽으로 당길 때) */
  focus?: { minX: number; maxX: number; minY: number; maxY: number }
}

/**
 * 뷰포트에 섬 전체가 들어오도록 배율·원점을 잡는다.
 *
 * 모바일 세로에서 좌우가 잘리던 것(3라운드 P0-3)이 여기서 잡힌다 — 육지 경계에
 * 라벨 여백을 더한 상자를 통째로 맞춘다.
 */
export function computeTransform(vw: number, vh: number, opts: FitOptions): MapTransform {
  const availW = Math.max(80, vw - opts.padX * 2)
  const availH = Math.max(80, vh - opts.padTop - opts.padBottom)

  const box = opts.focus ?? LAND
  // 배율 1일 때의 투영 크기
  const spanX = box.maxX - box.minX + 1
  const topY = box.minY * DEPTH_K - LAND.maxH * HEIGHT_K
  const bottomY = (box.maxY + 1) * DEPTH_K
  const spanY = bottomY - topY

  const s = Math.min(availW / spanX, availH / spanY)

  const ox = opts.padX + (availW - spanX * s) / 2 - box.minX * s
  const oy = opts.padTop + (availH - spanY * s) / 2 - topY * s
  return { s, ox, oy }
}

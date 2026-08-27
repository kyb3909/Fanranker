/**
 * 라벨 배치 — 겹침 회피.
 *
 * 목업 3라운드에서 같은 지적이 계속 재발했다: 격차 배지가 진행률을 덮고, 완공
 * 뱃지가 구장에 걸리고, 모바일에서 칩이 화면 밖으로 잘렸다. 픽셀을 손으로 밀어
 * 고치면 한 건씩만 잡히고 다음 라운드에 다른 자리에서 다시 터진다 — 그래서
 * 배치를 규칙으로 돌린다.
 *
 * 규칙 셋:
 *  1. 팀 하나의 칩·배지·격차는 **한 상자**다 (세로로 쌓아 한 덩어리로 움직인다).
 *  2. 상자끼리 겹치면 밀어낸다 — 세로를 먼저 쓴다(라벨은 세로로 늘어서는 게 자연스럽다).
 *  3. 상자는 **구장 위에 올라가지 않는다** (구장 화면 상자를 장애물로 둔다).
 *  4. 마지막에 화면 안으로 물린다 — 잘림 금지.
 */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface LabelSeed {
  id: string
  /** 리더 라인이 닿는 지점 (구장 꼭대기) */
  anchor: { x: number; y: number }
  /** 선호 위치 (좌상단 기준) */
  x: number
  y: number
  w: number
  h: number
}

const right = (r: Rect) => r.x + r.w
const bottom = (r: Rect) => r.y + r.h

function overlap(a: Rect, b: Rect, gap: number) {
  const ox = Math.min(right(a), right(b)) - Math.max(a.x, b.x) + gap
  const oy = Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y) + gap
  if (ox <= 0 || oy <= 0) return null
  return { ox, oy }
}

export interface LayoutOptions {
  width: number
  height: number
  /** 화면 가장자리 여백 */
  pad: number
  /** 라벨끼리 최소 간격 */
  gap: number
  /** 라벨이 올라가면 안 되는 화면 영역 (구장 등) */
  obstacles: Rect[]
  iterations?: number
}

/**
 * 선호 위치에서 출발해 겹침이 사라질 때까지 민다.
 * 결정론적이다 — 같은 입력이면 같은 결과라 리렌더마다 라벨이 떨지 않는다.
 */
export function layoutLabels(seeds: LabelSeed[], opts: LayoutOptions): Map<string, Rect> {
  const { width, height, pad, gap, obstacles } = opts
  const iterations = opts.iterations ?? 90

  const rects: (Rect & { id: string })[] = seeds.map((s) => ({
    id: s.id,
    x: s.x,
    y: s.y,
    w: s.w,
    h: s.h,
  }))

  const clamp = (r: Rect) => {
    r.x = Math.max(pad, Math.min(width - pad - r.w, r.x))
    r.y = Math.max(pad, Math.min(height - pad - r.h, r.y))
  }
  rects.forEach(clamp)

  for (let iter = 0; iter < iterations; iter++) {
    let moved = false

    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]
        const b = rects[j]
        const o = overlap(a, b, gap)
        if (!o) continue
        moved = true
        // 세로를 먼저 쓴다 — 가로 침투가 세로보다 확연히 작을 때만 옆으로 민다
        if (o.ox < o.oy * 0.55) {
          const push = o.ox / 2 + 0.5
          const dir = a.x + a.w / 2 <= b.x + b.w / 2 ? -1 : 1
          a.x += push * dir
          b.x -= push * dir
        } else {
          const push = o.oy / 2 + 0.5
          const dir = a.y + a.h / 2 <= b.y + b.h / 2 ? -1 : 1
          a.y += push * dir
          b.y -= push * dir
        }
      }
    }

    for (const r of rects) {
      for (const ob of obstacles) {
        const o = overlap(r, ob, 2)
        if (!o) continue
        moved = true
        // 구장 위로는 올라가지 않는다 — 위/아래 중 가까운 쪽으로 완전히 비켜준다
        const above = ob.y - r.h - 3 - r.y
        const below = bottom(ob) + 3 - r.y
        r.y += Math.abs(above) <= Math.abs(below) ? above : below
      }
    }

    rects.forEach(clamp)
    if (!moved) break
  }

  const out = new Map<string, Rect>()
  for (const r of rects) out.set(r.id, { x: r.x, y: r.y, w: r.w, h: r.h })
  return out
}

/** 리더 라인이 라벨에 닿는 지점 — 앵커에서 가장 가까운 변의 중앙 */
export function leaderPoint(rect: Rect, anchor: { x: number; y: number }) {
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  if (anchor.y > bottom(rect)) return { x: cx, y: bottom(rect) }
  if (anchor.y < rect.y) return { x: cx, y: rect.y }
  return { x: anchor.x < cx ? rect.x : right(rect), y: cy }
}

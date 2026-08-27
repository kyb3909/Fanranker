/**
 * 잉글랜드 복셀 지형 베이크 (/stadium 경기장 지도)
 *
 * `public/map/regions/england-map.webp` 원화의 픽셀을 바다/땅/산으로 분류하고
 * 높이를 계산해 `lib/stadium/england-terrain.ts` 로 굽는다. 런타임에는 이 결과만
 * 읽으므로 지도 진입 비용이 0 이다.
 *
 *   pnpm exec node scripts/bake-england-terrain.mjs
 *
 * 원화가 바뀌지 않는 한 다시 돌릴 일은 없다. 지형 파라미터(아래 상수)를 바꿀 때만
 * 재실행하고 결과 파일을 함께 커밋한다.
 */
import sharp from "sharp"
import { writeFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const SRC = resolve(ROOT, "public/map/regions/england-map.webp")
const OUT = resolve(ROOT, "lib/stadium/england-terrain.ts")

/**
 * 격자 해상도.
 *
 * 화면에서 깊이(Y)를 DEPTH_K(0.62)만큼 누르므로, 세로 칸 수를 그만큼 **늘려서**
 * 굽는다. 그래야 눌린 뒤의 섬 윤곽이 원화 비율과 같아진다 — 105행으로 구우면
 * 브리튼이 가로로 퍼져서 지도로 안 읽힌다.
 */
const W = 158
const H = 169

/** 산 높이 상한. 능선을 만들되 라벨을 가릴 만큼 솟지 않는 선 */
const ROCK_MAX = 5
/** 만년설 캡이 붙는 높이 — 연속성 제약을 통과한 최고봉만 하얗게 (실측 최고 4단) */
const SNOW_AT = 4

/**
 * 템스강 — 원화에 없지만 런던 팀 5개의 위치를 읽히게 하려면 기준선이 필요하다.
 * 운영자 검수에서 "고증"으로 요구된 항목이라 지형에 직접 판다. (하구로 갈수록 넓어짐)
 */
const THAMES = [
  { x: 108, y: 117, w: 2 },
  { x: 118, y: 117, w: 2 },
  { x: 127, y: 116, w: 3 },
  { x: 136, y: 116, w: 4 },
  { x: 145, y: 114, w: 6 },
]

const SEA = 0
const GRASS = 1
const ROCK = 2

async function classify() {
  const { data, info } = await sharp(SRC)
    .resize(W, H, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const ch = info.channels
  const kind = new Uint8Array(W * H)

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * ch
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const mx = Math.max(r, g, b)
      const mn = Math.min(r, g, b)
      const sat = (mx - mn) / (mx + 1e-6)
      let k
      if (b > g && b > r && b > 90) k = SEA // 바다
      else if (mx > 195 && sat < 0.18) k = SEA // 구름 — 원화 위에 떠 있는 레이어
      else if (sat < 0.22 && mx > 110 && mx < 200) k = ROCK // 회색 산
      else if ((g >= r && g > b) || (r > g > b && mx > 90)) k = GRASS
      else k = SEA
      kind[y * W + x] = k
    }
  }
  return kind
}

const at = (arr, x, y) => (x < 0 || y < 0 || x >= W || y >= H ? SEA : arr[y * W + x])

/** 4칸 미만 고립 조각 제거 — 원화의 배·글자 같은 노이즈가 섬으로 남는 걸 막는다 */
function dropSpecks(kind) {
  const seen = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (kind[i] === SEA || seen[i]) continue
      const stack = [i]
      const comp = []
      seen[i] = 1
      while (stack.length) {
        const c = stack.pop()
        comp.push(c)
        const cx = c % W
        const cy = (c / W) | 0
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
          const n = ny * W + nx
          if (kind[n] !== SEA && !seen[n]) {
            seen[n] = 1
            stack.push(n)
          }
        }
      }
      if (comp.length < 4) for (const c of comp) kind[c] = SEA
    }
  }
}

/** 점묘로 흩어진 산 제거 — 이웃 8칸 중 3칸 미만이면 초지로 강등. 산맥만 남는다 */
function despeckleRock(kind) {
  for (let pass = 0; pass < 2; pass++) {
    const next = kind.slice()
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (kind[y * W + x] !== ROCK) continue
        let n = 0
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if ((dx || dy) && at(kind, x + dx, y + dy) === ROCK) n++
        if (n < 3) next[y * W + x] = GRASS
      }
    }
    kind.set(next)
  }
}

function carveThames(kind) {
  for (let s = 0; s < THAMES.length - 1; s++) {
    const a = THAMES[s]
    const b = THAMES[s + 1]
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))
    for (let t = 0; t <= steps; t++) {
      const f = t / steps
      const x = Math.round(a.x + (b.x - a.x) * f)
      const y = Math.round(a.y + (b.y - a.y) * f)
      const w = a.w + (b.w - a.w) * f
      const half = Math.max(0, Math.round(w / 2))
      for (let dy = -half; dy <= half; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= H) continue
        if (at(kind, x, yy) !== SEA) kind[yy * W + x] = SEA
      }
    }
  }
}

/**
 * 높이 계산.
 * 산은 덩어리 안쪽으로 갈수록 높아진다(=능선), 초지는 해안 1단 / 내륙 2단.
 * 마지막에 이웃 간 최대 1단 차 제약을 반복 적용해 "흩뿌린 자갈"이 아니라 계단형
 * 능선이 되게 한다 — 3라운드 평가에서 마인크래프트 빌더가 지적한 항목.
 */
function heights(kind) {
  const h = new Int16Array(W * H)
  // 산: 비-산까지의 체비셰프 거리로 고도 부여
  const dist = new Int16Array(W * H).fill(-1)
  const queue = []
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (kind[i] !== ROCK) {
        dist[i] = 0
        queue.push(i)
      }
    }
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const c = queue[qi]
    const cx = c % W
    const cy = (c / W) | 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = cx + dx
        const ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const n = ny * W + nx
        if (dist[n] === -1) {
          dist[n] = dist[c] + 1
          queue.push(n)
        }
      }
    }
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (kind[i] === SEA) {
        h[i] = 0
        continue
      }
      const coastal =
        at(kind, x - 1, y) === SEA ||
        at(kind, x + 1, y) === SEA ||
        at(kind, x, y - 1) === SEA ||
        at(kind, x, y + 1) === SEA
      if (kind[i] === ROCK) h[i] = Math.min(ROCK_MAX, 2 + dist[i])
      else h[i] = coastal ? 1 : 2
    }
  }

  // 연속성 제약 — 육지 이웃끼리 최대 1단 차 (바다와의 절벽은 허용)
  for (let pass = 0; pass < ROCK_MAX + 2; pass++) {
    let changed = false
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x
        if (kind[i] === SEA) continue
        let lowest = 99
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
          const n = ny * W + nx
          if (kind[n] !== SEA) lowest = Math.min(lowest, h[n])
        }
        if (lowest !== 99 && h[i] > lowest + 1) {
          h[i] = lowest + 1
          changed = true
        }
      }
    }
    if (!changed) break
  }
  return h
}

/** '.'=바다 · '1'~'6'=초지 높이 · 'A'~'F'=암석 높이 (SNOW_AT 이상은 만년설로 그린다) */
function encode(kind, h) {
  const rows = []
  for (let y = 0; y < H; y++) {
    let row = ""
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (kind[i] === SEA) row += "."
      else if (kind[i] === ROCK) row += String.fromCharCode(64 + Math.max(1, h[i]))
      else row += String(Math.max(1, h[i]))
    }
    rows.push(row)
  }
  return rows
}

const kind = await classify()
dropSpecks(kind)
despeckleRock(kind)
carveThames(kind)
dropSpecks(kind)
const h = heights(kind)
const rows = encode(kind, h)

let land = 0
let rock = 0
let peak = 0
for (let i = 0; i < kind.length; i++) {
  if (kind[i] !== SEA) land++
  if (kind[i] === ROCK) rock++
  peak = Math.max(peak, h[i])
}

const body = `/**
 * 잉글랜드 복셀 지형 — 생성 파일. 직접 고치지 말 것.
 *
 *   pnpm exec node scripts/bake-england-terrain.mjs
 *
 * 원화(public/map/regions/england-map.webp)를 ${W}×${H} 격자로 분류해 구운 결과다.
 * 한 글자가 한 칸: '.' 바다 / '1'~'6' 초지 높이 / 'A'~'F' 암석 높이.
 * 육지 ${land}칸(암석 ${rock}) · 최고 ${peak}단.
 */

export const TERRAIN_W = ${W}
export const TERRAIN_H = ${H}

/** 이 높이부터 만년설 캡을 씌운다 */
export const SNOW_LEVEL = ${SNOW_AT}

export const TERRAIN: readonly string[] = [
${rows.map((r) => `  "${r}",`).join("\n")}
]
`

writeFileSync(OUT, body, "utf8")
console.log(`baked ${W}x${H} → ${OUT}`)
console.log(`  land ${land} (rock ${rock}), peak ${peak}`)

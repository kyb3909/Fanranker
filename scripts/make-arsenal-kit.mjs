/**
 * male-basic 프레임의 흰 상의를 아스날 레드로 치환해 male-arsenal 프리셋 생성.
 * - 의류 픽셀 = 무채색(채널 간 차이 ≤14) + 밝기 ≥50
 * - 눈 흰자 제외: 연결 컴포넌트 20px 미만은 건너뜀
 * - 반바지 유지: 의류 영역 하단 22% 는 흰색 그대로
 * - 빨강 램프: 밝기 v → (v, v*0.05, v*0.06) — 하이라이트/그림자 자동 유지
 */

import sharp from "sharp"
import { writeFileSync, readdirSync, mkdirSync } from "fs"
import { join } from "path"

const SRC = join(process.cwd(), "public", "metaverse", "avatars", "male-basic")
const DST = join(process.cwd(), "public", "metaverse", "avatars", "male-arsenal")
const ANIMS = ["walking", "idle", "run", "jump", "bite", "headbut", "kick", "knockback", "pain"]
const MIN_COMPONENT = 20
const SHORTS_RATIO = 0.78 // 의류 bbox 상단 78% = 셔츠(빨강), 나머지 = 반바지(흰색 유지)

function isGarment(r, g, b, a) {
  if (a === 0) return false
  const maxd = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b))
  const v = (r + g + b) / 3
  return maxd <= 14 && v >= 50
}

async function recolor(srcPath, dstPath) {
  const { data, info } = await sharp(srcPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  const buf = Buffer.from(data)

  // 1) 의류 후보 마스크
  const mask = new Uint8Array(width * height)
  for (let p = 0; p < width * height; p++) {
    const i = p * channels
    if (isGarment(buf[i], buf[i + 1], buf[i + 2], buf[i + 3])) mask[p] = 1
  }

  // 2) 연결 컴포넌트 — 작은 덩어리(눈 흰자) 제거
  const label = new Int32Array(width * height).fill(-1)
  const comps = []
  for (let p = 0; p < width * height; p++) {
    if (!mask[p] || label[p] !== -1) continue
    const id = comps.length
    const pixels = []
    const stack = [p]
    label[p] = id
    while (stack.length) {
      const q = stack.pop()
      pixels.push(q)
      const x = q % width
      const y = (q / width) | 0
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
        const np = ny * width + nx
        if (mask[np] && label[np] === -1) {
          label[np] = id
          stack.push(np)
        }
      }
    }
    comps.push(pixels)
  }
  const garment = comps.filter((c) => c.length >= MIN_COMPONENT).flat()
  if (garment.length === 0) {
    writeFileSync(dstPath, await sharp(srcPath).png().toBuffer())
    return
  }

  // 3) bbox → 셔츠/반바지 경계
  let yMin = height, yMax = 0
  for (const p of garment) {
    const y = (p / width) | 0
    if (y < yMin) yMin = y
    if (y > yMax) yMax = y
  }
  const boundary = yMin + Math.round((yMax - yMin) * SHORTS_RATIO)

  // 4) 셔츠 픽셀만 빨강 램프 적용
  for (const p of garment) {
    const y = (p / width) | 0
    if (y > boundary) continue // 반바지: 흰색 유지
    const i = p * channels
    const v = (buf[i] + buf[i + 1] + buf[i + 2]) / 3
    buf[i] = Math.round(Math.min(255, v * 1.05))
    buf[i + 1] = Math.round(v * 0.05)
    buf[i + 2] = Math.round(v * 0.06)
  }

  const out = await sharp(buf, { raw: { width, height, channels } }).png().toBuffer()
  writeFileSync(dstPath, out)
}

for (const anim of ANIMS) {
  const srcDir = join(SRC, anim)
  const dstDir = join(DST, anim)
  mkdirSync(dstDir, { recursive: true })
  for (const f of readdirSync(srcDir).filter((f) => f.endsWith(".png"))) {
    await recolor(join(srcDir, f), join(dstDir, f))
    console.log(`${anim}/${f} done`)
  }
}
console.log("완료.")

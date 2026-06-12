/**
 * Aseprite export 시 투명 배경 없이 내보낸 PNG 프레임의 배경을 제거.
 * 4 코너에서 flood-fill → alpha=0 으로 변환.
 */

import sharp from "sharp"
import { readFileSync, writeFileSync, readdirSync, statSync } from "fs"
import { join } from "path"

const TOLERANCE = 30 // 배경색 ± 허용 오차 (안티앨리어싱 없는 픽셀아트라 작게 설정)

function colorClose(r, g, b, br, bg, bb) {
  return Math.abs(r - br) <= TOLERANCE && Math.abs(g - bg) <= TOLERANCE && Math.abs(b - bb) <= TOLERANCE
}

async function removeBg(filePath) {
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height, channels } = info
  const buf = Buffer.from(data)

  // 코너 색 샘플
  const idx = (x, y) => (y * width + x) * channels
  const [br, bg, bb] = [buf[idx(0, 0)], buf[idx(0, 0) + 1], buf[idx(0, 0) + 2]]

  // flood-fill BFS from all 4 corners
  const visited = new Uint8Array(width * height)
  const queue = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ]

  for (const [sx, sy] of queue) {
    const si = sy * width + sx
    if (visited[si]) continue
    const stack = [[sx, sy]]
    while (stack.length) {
      const [x, y] = stack.pop()
      const pi = y * width + x
      if (x < 0 || x >= width || y < 0 || y >= height) continue
      if (visited[pi]) continue
      const ci = pi * channels
      if (!colorClose(buf[ci], buf[ci + 1], buf[ci + 2], br, bg, bb)) continue
      visited[pi] = 1
      buf[ci + 3] = 0 // alpha = 0
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
    }
  }

  const out = await sharp(buf, { raw: { width, height, channels } }).png().toBuffer()
  writeFileSync(filePath, out)
}

async function processDir(dir) {
  const entries = readdirSync(dir)
  for (const entry of entries) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      await processDir(full)
    } else if (entry.endsWith(".png")) {
      process.stdout.write(`  ${full.replace(process.cwd(), "")} ... `)
      await removeBg(full)
      console.log("done")
    }
  }
}

const avatarRoot = join(process.cwd(), "public", "metaverse", "avatars")
console.log("배경 제거 시작:", avatarRoot)
await processDir(avatarRoot)
console.log("완료.")

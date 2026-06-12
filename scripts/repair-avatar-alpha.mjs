/**
 * remove-avatar-bg.mjs 의 tolerance(±30) 가 캐릭터 그림자 픽셀까지 지운 것 복구.
 * alpha=0 인데 RGB 가 배경색(코너 색)과 거의 다르면 캐릭터 픽셀로 보고 alpha=255 복원.
 * (이전 스크립트가 alpha 만 0 으로 바꾸고 RGB 는 보존했기 때문에 가능)
 */

import sharp from "sharp"
import { writeFileSync, readdirSync, statSync } from "fs"
import { join } from "path"

const STRICT = 6 // 픽셀아트 배경은 단색 — 이 이상 다르면 캐릭터 픽셀

async function repair(filePath) {
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height, channels } = info
  const buf = Buffer.from(data)
  const [br, bg, bb] = [buf[0], buf[1], buf[2]] // corner = 배경색

  let restored = 0
  for (let i = 0; i < buf.length; i += channels) {
    if (buf[i + 3] !== 0) continue
    const diff = Math.max(
      Math.abs(buf[i] - br),
      Math.abs(buf[i + 1] - bg),
      Math.abs(buf[i + 2] - bb)
    )
    if (diff > STRICT) {
      buf[i + 3] = 255
      restored++
    }
  }

  if (restored > 0) {
    const out = await sharp(buf, { raw: { width, height, channels } }).png().toBuffer()
    writeFileSync(filePath, out)
  }
  return restored
}

async function processDir(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      await processDir(full)
    } else if (entry.endsWith(".png")) {
      const n = await repair(full)
      if (n > 0) console.log(`  ${full.replace(process.cwd(), "")}: ${n}px 복원`)
    }
  }
}

const avatarRoot = join(process.cwd(), "public", "metaverse", "avatars")
console.log("alpha 복구 시작:", avatarRoot)
await processDir(avatarRoot)
console.log("완료.")

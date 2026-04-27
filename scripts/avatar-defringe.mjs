/**
 * avatar-defringe.mjs — PixelLab 출력물 노이즈 제거.
 *
 * 두 종류의 PixelLab 산출물 결함을 정리:
 *
 *  Pass 1 — alpha bleed + threshold (가장자리 fringe 제거)
 *    반투명 (alpha 1-254) 픽셀의 RGB 를 인접 opaque 이웃 색으로 덮어쓴 후 alpha 1-bit 화.
 *    PixelLab 출력은 보통 이미 1-bit alpha 라 0건 처리되는 경우가 많음.
 *
 *  Pass 2 — salt noise removal (실루엣 내부 이상 픽셀 제거)
 *    어두운 영역 안에 무작위로 박힌 밝은 픽셀 (예: 네이비 반바지 안에 피부색 점) 을
 *    8-이웃 median 색으로 교체. 픽셀이 이웃 median 보다 luminance 70 이상 밝고
 *    절대값이 140 이상일 때만 salt 로 판단. 큰 밝은 영역 (양말·눈 흰자 등) 은
 *    이웃들도 밝아 median 이 같이 올라가므로 보존됨. 3 passes 반복.
 *
 * 사용:
 *   pnpm node scripts/avatar-defringe.mjs                          # 모든 avatars/ 일괄
 *   pnpm node scripts/avatar-defringe.mjs public/metaverse/avatars/arsenal-home  # 특정 폴더
 *   pnpm node scripts/avatar-defringe.mjs path/to/file.png         # 단일 파일
 *   pnpm node scripts/avatar-defringe.mjs --dry-run                # 변경 없이 통계만
 *   pnpm node scripts/avatar-defringe.mjs --no-salt                # salt 패스 끔 (fringe 만)
 */

import sharp from "sharp"
import { readdir, rename } from "node:fs/promises"
import { join, extname, resolve } from "node:path"
import { argv } from "node:process"

const DEFAULT_ROOT = "public/metaverse/avatars"
const BLEED_PASSES = 3
const ALPHA_THRESHOLD = 128
const SALT_PASSES = 3
const SALT_LUM_DELTA = 70 // 이웃 median 보다 이만큼 밝아야 salt 로 판단
const SALT_LUM_FLOOR = 140 // 절대 luminance 가 이 이상이어야 (어두운 미세 변화는 무시)

async function* walkWebp(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) yield* walkWebp(p)
    else if (extname(entry.name).toLowerCase() === ".webp") yield p
    else if (extname(entry.name).toLowerCase() === ".png") yield p
  }
}

/**
 * alpha bleed + threshold in-place on RGBA Uint8Array.
 * Returns { changed, fringeRemoved } counters.
 */
function defringe(buf, w, h) {
  let promoted = 0
  let removed = 0

  // Pass 1-N: bleed RGB from opaque neighbors into semi-transparent pixels
  for (let pass = 0; pass < BLEED_PASSES; pass++) {
    // Use a copy so this pass doesn't see its own writes
    const snapshot = new Uint8Array(buf)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const a = snapshot[i + 3]
        if (a === 0 || a === 255) continue
        // Find nearest opaque neighbor (4-connected first, then 8-connected)
        const neighbors = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
          [x - 1, y - 1],
          [x + 1, y - 1],
          [x - 1, y + 1],
          [x + 1, y + 1],
        ]
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const ni = (ny * w + nx) * 4
          if (snapshot[ni + 3] === 255) {
            buf[i] = snapshot[ni]
            buf[i + 1] = snapshot[ni + 1]
            buf[i + 2] = snapshot[ni + 2]
            // Don't promote alpha here — let threshold pass decide
            break
          }
        }
      }
    }
  }

  // Final threshold: 1-bit alpha
  for (let i = 0; i < buf.length; i += 4) {
    const a = buf[i + 3]
    if (a === 0 || a === 255) continue
    if (a < ALPHA_THRESHOLD) {
      // make fully transparent — and zero RGB to be tidy
      buf[i + 3] = 0
      removed++
    } else {
      buf[i + 3] = 255
      promoted++
    }
  }

  return { promoted, removed }
}

function lum(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/**
 * Salt noise removal — 한 패스. 어두운 영역 안에 박힌 밝은 outlier 를 이웃 median 색으로 교체.
 * 반환: 교체된 픽셀 수
 */
function saltPass(buf, w, h) {
  const snapshot = new Uint8Array(buf)
  let replaced = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4
      if (snapshot[i + 3] !== 255) continue
      const lc = lum(snapshot[i], snapshot[i + 1], snapshot[i + 2])
      if (lc < SALT_LUM_FLOOR) continue
      // 8-이웃 중 opaque 만 수집
      const nbrs = []
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const ni = ((y + dy) * w + (x + dx)) * 4
          if (snapshot[ni + 3] === 255) {
            nbrs.push({
              r: snapshot[ni],
              g: snapshot[ni + 1],
              b: snapshot[ni + 2],
              lum: lum(snapshot[ni], snapshot[ni + 1], snapshot[ni + 2]),
            })
          }
        }
      }
      if (nbrs.length < 5) continue // edge / 희박한 영역 — 보존
      nbrs.sort((a, b) => a.lum - b.lum)
      const med = nbrs[Math.floor(nbrs.length / 2)]
      if (lc - med.lum > SALT_LUM_DELTA) {
        // salt — median 이웃 색으로 교체
        buf[i] = med.r
        buf[i + 1] = med.g
        buf[i + 2] = med.b
        replaced++
      }
    }
  }
  return replaced
}

function removeSaltNoise(buf, w, h) {
  let total = 0
  for (let p = 0; p < SALT_PASSES; p++) {
    const r = saltPass(buf, w, h)
    total += r
    if (r === 0) break
  }
  return total
}

async function processFile(path, dryRun, runSalt) {
  const img = sharp(path).ensureAlpha()
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  if (channels !== 4) return { skipped: true }

  const buf = Buffer.from(data)
  const { promoted, removed } = defringe(buf, width, height)
  const saltReplaced = runSalt ? removeSaltNoise(buf, width, height) : 0

  if (promoted === 0 && removed === 0 && saltReplaced === 0)
    return { promoted: 0, removed: 0, saltReplaced: 0 }

  if (!dryRun) {
    const tmp = path + ".tmp"
    const isPng = extname(path).toLowerCase() === ".png"
    const out = sharp(buf, { raw: { width, height, channels: 4 } })
    await (isPng ? out.png({ compressionLevel: 9 }) : out.webp({ lossless: true })).toFile(tmp)
    await rename(tmp, path)
  }

  return { promoted, removed, saltReplaced }
}

async function main() {
  const args = argv.slice(2)
  const dryRun = args.includes("--dry-run")
  const runSalt = !args.includes("--no-salt")
  const targets = args.filter((a) => !a.startsWith("--"))
  const roots = targets.length > 0 ? targets : [DEFAULT_ROOT]

  let totalFiles = 0
  let changedFiles = 0
  let totalPromoted = 0
  let totalRemoved = 0
  let totalSalt = 0

  for (const root of roots) {
    const abs = resolve(root)
    const { stat } = await import("node:fs/promises")
    let stats
    try {
      stats = await stat(abs)
    } catch {
      console.error(`[defringe] not found: ${abs}`)
      continue
    }
    console.log(`[defringe] scanning ${abs}${dryRun ? " (dry-run)" : ""} salt=${runSalt}`)
    const files = stats.isDirectory()
      ? (async function* () {
          for await (const f of walkWebp(abs)) yield f
        })()
      : (async function* () {
          yield abs
        })()
    for await (const file of files) {
      totalFiles++
      try {
        const result = await processFile(file, dryRun, runSalt)
        if (result.skipped) continue
        const changed = (result.promoted ?? 0) + (result.removed ?? 0) + (result.saltReplaced ?? 0)
        if (changed > 0) {
          changedFiles++
          totalPromoted += result.promoted ?? 0
          totalRemoved += result.removed ?? 0
          totalSalt += result.saltReplaced ?? 0
          const rel = file.replace(abs + "/", "").replace(abs + "\\", "")
          process.stdout.write(
            `  ${rel}: +${result.promoted} promoted, -${result.removed} fringe, -${result.saltReplaced} salt\n`
          )
        }
      } catch (err) {
        console.error(`  [error] ${file}:`, err.message)
      }
    }
  }

  console.log(
    `\n[defringe] done — files: ${changedFiles}/${totalFiles} changed, ${totalPromoted} promoted, ${totalRemoved} fringe removed, ${totalSalt} salt replaced${dryRun ? " (dry-run, no writes)" : ""}`
  )
}

main().catch((err) => {
  console.error("[defringe] fatal:", err)
  process.exit(1)
})

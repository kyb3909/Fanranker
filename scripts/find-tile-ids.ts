/**
 * LimeZu 통짜 타일셋에서 특정 16×16 타일의 ID 찾기.
 *
 * 분류된 single PNG (예: Deep_Water_1_1.png 16×16) 의 픽셀과
 * 통짜 PNG (modern-exteriors.png 2816×8224) 의 모든 grid 위치를 비교해
 * 일치하는 첫 위치의 Tiled ID 반환 (firstgid=1 기준).
 *
 * 실행: pnpm exec tsx scripts/find-tile-ids.ts
 */

import { resolve } from "node:path"
import sharp from "sharp"

const MAIN_PNG = "public/map/tilesets/modern-exteriors.png"
const COLUMNS = 176
const TILE = 16

const LIMEZU_SINGLES =
  "C:/Users/user/Downloads/Compressed/limezu/modernexteriors-win/Modern_Exteriors_16x16/ME_Theme_Sorter_16x16/1_Terrains_and_Fences_Singles_16x16"

const TARGETS: Array<{ label: string; file: string }> = [
  ...Array.from({ length: 22 }, (_, i) => ({
    label: `Deep_Water_1_${i + 1}`,
    file: `${LIMEZU_SINGLES}/ME_Singles_Terrains_and_Fences_16x16_Deep_Water_1_${i + 1}.png`,
  })),
]

interface RawImage {
  data: Buffer
  width: number
  height: number
  channels: number
}

async function loadRaw(path: string): Promise<RawImage> {
  const { data, info } = await sharp(resolve(path))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height, channels: 4 }
}

function tileMatches(main: RawImage, target: RawImage, tx: number, ty: number): boolean {
  for (let py = 0; py < TILE; py++) {
    for (let px = 0; px < TILE; px++) {
      const mainIdx = ((ty * TILE + py) * main.width + (tx * TILE + px)) * main.channels
      const targetIdx = (py * TILE + px) * target.channels
      for (let c = 0; c < 4; c++) {
        if (main.data[mainIdx + c] !== target.data[targetIdx + c]) return false
      }
    }
  }
  return true
}

async function findId(target: RawImage, main: RawImage): Promise<number | null> {
  const totalRows = Math.floor(main.height / TILE)
  for (let ty = 0; ty < totalRows; ty++) {
    for (let tx = 0; tx < COLUMNS; tx++) {
      if (tileMatches(main, target, tx, ty)) {
        return ty * COLUMNS + tx + 1
      }
    }
  }
  return null
}

async function main() {
  console.log(`통짜 PNG 로드: ${MAIN_PNG}`)
  const mainImg = await loadRaw(MAIN_PNG)
  console.log(`  ${mainImg.width}×${mainImg.height}, ${mainImg.channels}ch`)

  for (const t of TARGETS) {
    const target = await loadRaw(t.file)
    if (target.width !== TILE || target.height !== TILE) {
      console.log(`  ⚠ ${t.label}: 사이즈 ${target.width}×${target.height} (16×16 아님, 스킵)`)
      continue
    }
    process.stdout.write(`검색: ${t.label} … `)
    const t0 = Date.now()
    const id = await findId(target, mainImg)
    const dt = Date.now() - t0
    if (id !== null) {
      const row = Math.floor((id - 1) / COLUMNS)
      const col = (id - 1) % COLUMNS
      console.log(`ID = ${id} (row ${row}, col ${col}) [${dt}ms]`)
    } else {
      console.log(`찾지 못함 [${dt}ms]`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

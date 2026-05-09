/**
 * LimeZu sheet에서 특정 16×16 타일의 ID 자동 검색.
 *
 * 분류된 single PNG의 픽셀과 sheet PNG의 모든 grid 위치를 비교해
 * 일치하는 첫 위치의 Tiled ID 반환 (firstgid 기준).
 *
 * 실행: pnpm exec tsx scripts/find-tile-ids.ts
 */

import { resolve } from "node:path"
import sharp from "sharp"

const TILE = 16

interface RawImage {
  data: Buffer
  width: number
  height: number
  channels: number
}

interface Sheet {
  label: string
  path: string
  columns: number
  firstgid: number
}

const SHEETS: Sheet[] = [
  // 통짜 (잔디·물 위주)
  {
    label: "modern-exteriors",
    path: "public/map/tilesets/modern-exteriors.png",
    columns: 176,
    firstgid: 1,
  },
  // me-camping: Rock·Tree·Stump 등
  { label: "me-camping", path: "public/map/tilesets/me-camping.png", columns: 32, firstgid: 90465 },
  // me-garden: Sprout·Flower·Bush 등
  { label: "me-garden", path: "public/map/tilesets/me-garden.png", columns: 32, firstgid: 96257 },
]

const LIMEZU_BASE =
  "C:/Users/user/Downloads/Compressed/limezu/modernexteriors-win/Modern_Exteriors_16x16/ME_Theme_Sorter_16x16"
const TERRAINS = `${LIMEZU_BASE}/1_Terrains_and_Fences_Singles_16x16`
const CAMPING = `${LIMEZU_BASE}/11_Camping_Singles_16x16`
const GARDEN = `${LIMEZU_BASE}/17_Garden_Singles_16x16`

interface Target {
  label: string
  file: string
  /** 우선 검색할 sheet labels (없으면 전체) */
  preferSheets?: string[]
}

// Grass_Water 9-tile autotile (잔디↔강 transition)
const TARGETS: Target[] = Array.from({ length: 9 }, (_, i) => ({
  label: `Grass_Water_1_${i + 1}`,
  file: `${TERRAINS}/ME_Singles_Terrains_and_Fences_16x16_Grass_Water_1_${i + 1}.png`,
  preferSheets: ["modern-exteriors"],
}))
void CAMPING
void GARDEN

async function loadRaw(path: string): Promise<RawImage> {
  const { data, info } = await sharp(resolve(path))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height, channels: 4 }
}

const PIXEL_TOL = 8

function tileMatches(main: RawImage, target: RawImage, tx: number, ty: number): boolean {
  for (let py = 0; py < TILE; py++) {
    for (let px = 0; px < TILE; px++) {
      const mainIdx = ((ty * TILE + py) * main.width + (tx * TILE + px)) * main.channels
      const targetIdx = (py * TILE + px) * target.channels
      for (let c = 0; c < 4; c++) {
        if (Math.abs(main.data[mainIdx + c] - target.data[targetIdx + c]) > PIXEL_TOL) return false
      }
    }
  }
  return true
}

function findInSheet(target: RawImage, sheet: RawImage, columns: number): number | null {
  const totalRows = Math.floor(sheet.height / TILE)
  for (let ty = 0; ty < totalRows; ty++) {
    for (let tx = 0; tx < columns; tx++) {
      if (tileMatches(sheet, target, tx, ty)) {
        return ty * columns + tx // local index (0-based)
      }
    }
  }
  return null
}

async function main() {
  // 모든 sheet 미리 로드
  const sheets = await Promise.all(
    SHEETS.map(async (s) => ({ ...s, image: await loadRaw(s.path) }))
  )
  console.log("Sheets:")
  for (const s of sheets) {
    console.log(`  ${s.label}: ${s.image.width}×${s.image.height}, firstgid ${s.firstgid}`)
  }
  console.log()

  const results: Array<{ label: string; sheet: string; localIdx: number; gid: number }> = []
  const notFound: string[] = []

  for (const t of TARGETS) {
    const target = await loadRaw(t.file)
    if (target.width !== TILE || target.height !== TILE) {
      console.log(`⚠ ${t.label}: ${target.width}×${target.height} (16×16 아님, skip)`)
      continue
    }
    const order = t.preferSheets
      ? [
          ...sheets.filter((s) => t.preferSheets!.includes(s.label)),
          ...sheets.filter((s) => !t.preferSheets!.includes(s.label)),
        ]
      : sheets
    let found: { sheet: string; localIdx: number; gid: number } | null = null
    for (const s of order) {
      const idx = findInSheet(target, s.image, s.columns)
      if (idx !== null) {
        found = { sheet: s.label, localIdx: idx, gid: s.firstgid + idx }
        break
      }
    }
    if (found) {
      console.log(`✓ ${t.label.padEnd(20)} → ${found.sheet} idx=${found.localIdx} gid=${found.gid}`)
      results.push({ label: t.label, ...found })
    } else {
      console.log(`✗ ${t.label.padEnd(20)} 어느 sheet에도 없음`)
      notFound.push(t.label)
    }
  }

  console.log(
    `\n총 ${results.length}/${TARGETS.length} 발견${notFound.length ? `, 미발견: ${notFound.join(", ")}` : ""}`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

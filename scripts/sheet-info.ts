/**
 * LimeZu 분류 sheet PNG의 pixel dimensions 확인 (16x16 tile 기준 columns/rows 계산).
 */

import sharp from "sharp"
import { resolve } from "node:path"

const SHEETS = ["public/map/tilesets/me-camping.png", "public/map/tilesets/me-garden.png"]

async function main() {
  for (const path of SHEETS) {
    const meta = await sharp(resolve(path)).metadata()
    const w = meta.width ?? 0
    const h = meta.height ?? 0
    console.log(
      `${path}: ${w}×${h}, columns=${Math.floor(w / 16)}, rows=${Math.floor(h / 16)}, tiles=${(w / 16) * (h / 16)}`
    )
  }
}

main()

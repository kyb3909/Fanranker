/**
 * 경기장 스틸샷 굽기 — /stadium 모달 히어로용
 *
 *   pnpm exec node scripts/render-stadiums.mjs
 *
 * 지도 모달에 띄우는 구장 그림은 3D 시안(scripts/stadium-render/)을 헤드리스로
 * 돌려 미리 찍어둔다. 브라우저에서 실시간으로 그리려던 걸 접은 이유:
 *  - 시안의 보울(초타원 링 × 17단 + 파사드 + 지붕, 블록 2만 개)을 2D 캔버스로
 *    다시 만들면 아무리 다듬어도 시안만 못하다. 원본을 그대로 쓰는 게 맞다.
 *  - 그림은 (팀 × 레벨)에만 달렸다. 조합이 60개뿐이라 **전부 미리 구워두면**
 *    주기적 갱신도 필요 없다 — 레벨이 오르면 다음 장이 이미 준비돼 있다.
 *  - 런타임 비용 0. <img> 한 장이라 저사양·구형 기기도 그냥 뜬다.
 *
 * 구장 모양·색이 바뀌거나 팀이 늘면 다시 돌리고 결과 이미지를 함께 커밋한다.
 */
import { chromium } from "playwright"
import sharp from "sharp"
import { mkdirSync, rmSync, readdirSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const HARNESS = resolve(ROOT, "scripts/stadium-render/index.html")
const OUT_DIR = resolve(ROOT, "public/stadium/renders")

/** 지도에 오르는 6팀 — lib/stadium/map-teams.ts 와 짝이 맞아야 한다 */
const TEAMS = [
  { teamId: "epl_arsenal", scene: "emirates" },
  { teamId: "epl_manutd", scene: "oldtrafford" },
  { teamId: "epl_liverpool", scene: "anfield" },
  { teamId: "epl_chelsea", scene: "bridge" },
  { teamId: "epl_mancity", scene: "etihad" },
  { teamId: "epl_tottenham", scene: "spurs" },
]

/** 모달 히어로 비율 (max-w-md × h-56 ≈ 2:1) */
const W = 960
const H = 480

/** 고정 카메라 — 관중석 앞면이 보이는 3/4 시점 */
const CAM = { az: 0.9, pol: 0.95, dist: 232 }

/**
 * 레벨 → 시공률.
 * lib/stadium/voxel-draw.ts 의 buildFraction 과 같은 식이다 — 지도 라벨의 진행률과
 * 그림이 따로 놀지 않게 한 곳에서 정한 값을 양쪽이 쓴다.
 */
function buildFraction(level) {
  return Math.min(1, 0.06 + ((Math.min(Math.max(level, 1), 10) - 1) / 9) * 0.94)
}

/** 프레임이 사실상 단색(=아직 안 그려짐)인지 */
async function isBlank(png) {
  const { data, info } = await sharp(png).resize(48, 24).raw().toBuffer({ resolveWithObject: true })
  const seen = new Set()
  for (let i = 0; i < data.length; i += info.channels) {
    seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])
    if (seen.size > 8) return false
  }
  return true
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: W, height: H } })
await page.goto("file://" + HARNESS.replace(/\\/g, "/"))
await page.waitForFunction("typeof window.__shot === 'function'", { timeout: 30_000 })

// 워밍업 — 첫 장이 첫 페인트 전에 찍혀 백지로 나온 적이 있다.
// 한 번 세워두고 충분히 기다린 뒤 본 촬영을 시작한다.
await page.evaluate(() => window.__shot({ team: "emirates", pct: 0.5, hideUI: true, ghost: false }))
await page.waitForTimeout(800)

mkdirSync(OUT_DIR, { recursive: true })
for (const f of readdirSync(OUT_DIR)) {
  if (f.endsWith(".webp")) rmSync(resolve(OUT_DIR, f))
}

let count = 0
let bytes = 0
for (const team of TEAMS) {
  for (let level = 1; level <= 10; level++) {
    const info = await page.evaluate(
      ([scene, pct, cam, lv]) =>
        // ghost:false — 아직 안 지은 부분은 안 보이게 (운영자 확정). 시안 앱에는
        // 청사진 표시 토글이 있고, 스틸샷은 끈 쪽을 쓴다.
        // level — 전광판은 레벨 6 보상이라 그 전엔 안 달린다. 안 넘기면 스틸만
        // 레벨 3 에도 전광판을 달고 나온다 (입장 화면과 어긋난다).
        window.__shot({ team: scene, pct, level: lv, hideUI: true, ghost: false, ...cam }),
      [team.scene, buildFraction(level), CAM, level]
    )
    // 한 프레임 더 — 지오메트리 교체 직후 첫 렌더가 비는 경우가 있다
    await page.waitForTimeout(180)
    let png = await page.screenshot({ type: "png" })
    // 백지 검출 — 캔버스가 아직 안 그려졌으면 한 번 더 준다.
    // (webp 로 굽고 나면 알아채기 어려워 여기서 잡는다)
    if (await isBlank(png)) {
      await page.waitForTimeout(700)
      png = await page.screenshot({ type: "png" })
      if (await isBlank(png)) throw new Error(`빈 프레임: ${team.teamId} LV.${level}`)
    }
    const out = resolve(OUT_DIR, `${team.teamId}-${level}.webp`)
    const buf = await sharp(png).webp({ quality: 78 }).toBuffer()
    await sharp(buf).toFile(out)
    count++
    bytes += buf.length
    process.stdout.write(
      `\r${team.teamId} LV.${level}  블록 ${info.built}/${info.total}   (${count}/60)   `
    )
  }
}
await browser.close()
console.log(`\n구웠다: ${count}장, ${(bytes / 1024 / 1024).toFixed(1)}MB → public/stadium/renders/`)

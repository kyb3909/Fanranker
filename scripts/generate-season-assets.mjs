/**
 * 시즌 이벤트 랜딩(/season) 이미지 에셋 생성 — OpenAI `gpt-image-2`.
 * 모델은 env `IMAGE_MODEL` 로 덮어쓸 수 있다 (예: gpt-image-1 로 되돌리기).
 *
 * 2026-07-31 에 이 방식으로 만든 애셋을 2026-08-02 대결 2팀 축소에 맞춰 다시 뽑기 위해
 * 스크립트로 남긴다 (그때는 일회성으로 돌려서 재현이 안 됐다).
 *
 * 사용법:
 *   node --env-file=.env scripts/generate-season-assets.mjs hero
 *   node --env-file=.env scripts/generate-season-assets.mjs hero --dry     # 프롬프트만 출력
 *   node --env-file=.env scripts/generate-season-assets.mjs --list
 *
 * 결과는 public/season/ 에 .webp 로 저장한다 (기존 파일은 .bak-<날짜> 로 백업).
 *
 * ⚠️ 구단 엠블럼·실존 선수는 프롬프트에 넣지 않는다 — 라이선스·초상권.
 *    크레스트는 별도 파일(crest-*.png)로 HTML 오버레이한다.
 */

import { writeFileSync, existsSync, copyFileSync, mkdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, "..", "public", "season")
const MODEL = process.env.IMAGE_MODEL || "gpt-image-2"

/** 공통 스타일 — 기존 애셋과 톤을 맞추기 위한 고정 문구 */
const STYLE =
  "dark moody grunge sports poster art, gritty painterly texture, heavy film grain, " +
  "stadium floodlights flaring at the top, silhouetted crowd with raised arms at the bottom, " +
  "confetti and paper shreds in the air, deep shadows, cinematic contrast. " +
  "No text, no letters, no numbers, no logos, no emblems, no crests, no recognizable faces."

const ASSETS = {
  "duel-banner": {
    file: "duel-banner.webp",
    size: "1536x1024",
    prompt:
      "Two anonymous silhouetted rival figures facing each other in profile from opposite sides, " +
      "the LEFT figure backlit in deep crimson red light and smoke, the RIGHT figure backlit in royal blue light and smoke. " +
      "Between them, floating in the center, a single plain white football jersey glowing with golden light " +
      "(completely blank — no badge, no number, no text on it), like a trophy both sides want. " +
      "Tension and energy crackling in the middle where red and blue light collide. " +
      STYLE,
  },
  hero: {
    file: "hero-collage.webp",
    size: "1536x1024",
    prompt:
      "A vertical two-panel split composition. " +
      "LEFT HALF: deep crimson red — supporters waving large red flags, red smoke and light haze. " +
      "RIGHT HALF: royal blue — supporters waving large blue flags, blue smoke and light haze. " +
      "The two halves meet at a hard ragged vertical seam down the exact center of the image, " +
      "like two rival ends of a stadium facing each other. Equal width for both halves. " +
      STYLE,
  },
  "hero-bg": {
    file: "hero-bg.webp",
    size: "1536x1024",
    prompt:
      "A dark burgundy paint splatter texture over a barely visible silhouetted stadium crowd, " +
      "very low contrast, suitable as a dark background behind white text. " +
      "Mostly near-black with burgundy accents. " +
      STYLE,
  },
  "player-kop": {
    file: "player-kop.webp",
    size: "1024x1536",
    prompt:
      "A single anonymous footballer in a plain red kit seen from behind or in dramatic shadow, " +
      "arms raised in celebration, red stadium lighting, no face visible, no badge on the kit. " +
      STYLE,
  },
  "player-blues": {
    file: "player-blues.webp",
    size: "1024x1536",
    prompt:
      "A single anonymous footballer in a plain blue kit seen from behind or in dramatic shadow, " +
      "arms raised in celebration, blue stadium lighting, no face visible, no badge on the kit. " +
      STYLE,
  },
  // 빅4 프로모(맨유) — kop 과 같은 빨강이라 흰 쇼츠·검은 연기로 구분 (2026-08-13)
  "player-devils": {
    file: "player-devils.webp",
    size: "1024x1536",
    prompt:
      "A single anonymous footballer in a plain red shirt and plain white shorts seen from behind or in dramatic shadow, " +
      "arms raised in celebration, deep red stadium lighting with wisps of black smoke curling around, " +
      "no face visible, no badge on the kit. " +
      STYLE,
  },
}

const args = process.argv.slice(2)
const dry = args.includes("--dry")
const names = args.filter((a) => !a.startsWith("--"))

if (args.includes("--list") || names.length === 0) {
  console.log("사용 가능한 애셋:")
  for (const [k, v] of Object.entries(ASSETS)) console.log(`  ${k.padEnd(14)} → ${v.file} (${v.size})`)
  console.log("\n예) node --env-file=.env scripts/generate-season-assets.mjs hero")
  process.exit(0)
}

const apiKey = process.env.OPENAI_API_KEY
if (!apiKey && !dry) {
  console.error("OPENAI_API_KEY 가 없습니다. `node --env-file=.env ...` 로 실행하세요.")
  process.exit(1)
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "")

for (const name of names) {
  const asset = ASSETS[name]
  if (!asset) {
    console.error(`알 수 없는 애셋: ${name} (--list 로 확인)`)
    process.exitCode = 1
    continue
  }

  console.log(`\n── ${name} → ${asset.file} (${asset.size}, ${MODEL})`)
  if (dry) {
    console.log(asset.prompt)
    continue
  }

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      prompt: asset.prompt,
      size: asset.size,
      n: 1,
    }),
  })

  if (!res.ok) {
    console.error(`생성 실패 (${res.status}):`, (await res.text()).slice(0, 500))
    process.exitCode = 1
    continue
  }

  const json = await res.json()
  const b64 = json?.data?.[0]?.b64_json
  if (!b64) {
    console.error("응답에 이미지가 없습니다:", JSON.stringify(json).slice(0, 300))
    process.exitCode = 1
    continue
  }

  const outPath = path.join(OUT_DIR, asset.file)
  if (existsSync(outPath)) {
    const bak = outPath.replace(/\.webp$/, `.bak-${stamp}.webp`)
    copyFileSync(outPath, bak)
    console.log(`  기존 파일 백업 → ${path.basename(bak)}`)
  }

  const png = Buffer.from(b64, "base64")
  await sharp(png).webp({ quality: 88 }).toFile(outPath)
  const kb = Math.round(Buffer.byteLength(png) / 1024)
  console.log(`  저장 완료 → public/season/${asset.file} (원본 ${kb}KB)`)
}

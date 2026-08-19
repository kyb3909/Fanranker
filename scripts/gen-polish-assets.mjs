// 폴리시 에셋 생성 — 빈 상태 일러스트 + 매치센터 밴드 리그 워터마크 (2026-08-20 P2).
//
// 편집 감리 가드레일 (workspace/polish-review-editorial-20260820.md §B):
//   · 팔레트 강제 (빈 상태 = 잉크+버건디+웜페이퍼 2도 인쇄 톤 / 워터마크 = 크림 라인)
//   · 글자는 절대 이미지로 굽지 않는다 · 포토리얼·3D 광택·얼굴 금지
//   · 2048급 생성 → 다운스케일 (AI 디테일 노이즈 제거) → webp
//   · 실제 리그 엠블럼과 유사한 형상 금지 (법무) — 추상 모티프만
//
//   node scripts/gen-polish-assets.mjs --only empty-no-matches
//   node scripts/gen-polish-assets.mjs --empty      # 빈 상태 4종
//   node scripts/gen-polish-assets.mjs --marks      # 워터마크 7종
import "dotenv/config"
import sharp from "sharp"
import { mkdirSync, writeFileSync } from "node:fs"

const RAW_DIR = "public/images/_polish-raw" // 원본 보관 (gitignore) — 조판만 바꿀 때 재생성 방지

/** 빈 상태 — 2도 인쇄 톤 (웜페이퍼 바탕 + 잉크 선 + 버건디 한 점) */
const EMPTY_STYLE =
  "Flat two-tone risograph print illustration on warm ivory paper background (#f7f4ef). " +
  "Dark warm ink (#1a1714) shapes and single-weight lines, exactly one small accent element in deep burgundy (#961e37). " +
  "Subtle paper grain, generous negative space, calm and quiet editorial mood. " +
  "Absolutely NO text, NO letters, NO numbers, NO logos, NO faces, NO photorealism, NO gradients, NO 3d."

const EMPTY = [
  {
    id: "empty-no-matches",
    desc: "이 날짜에는 경기가 없습니다 (/matches)",
    scene:
      "A single football resting on the center spot of an empty pitch seen from a high angle, center circle line arcing across, one tiny burgundy corner flag in the distance.",
  },
  {
    id: "empty-preseason",
    desc: "개막 전 순위표 (/standings)",
    scene:
      "An empty stadium bowl at dawn seen from the halfway line, rows of seats as rhythmic line work, a referee whistle resting on the grass as the single burgundy accent.",
  },
  {
    id: "empty-lineup-wait",
    desc: "라인업 발표 대기 (매치센터)",
    scene:
      "An empty dugout bench and a blank tactics board on a stand, eleven small magnet dots waiting in a row at the board edge, one dot in burgundy.",
  },
  {
    id: "empty-no-results",
    desc: "검색 결과 없음",
    scene:
      "A goal net seen from behind in quiet perspective, the net mesh as fine line work, a single burgundy football far away on the halfway line.",
  },
]

/**
 * 워터마크 — 크림 에칭 라인, 투명 webp (다크 밴드 위 8~12% 불투명으로 깔림).
 * ⚠️ gpt-image-2 는 `background: "transparent"` 를 400 invalid_value 로 거부한다 (2026-08-20 실측
 *    — output_format 조합과 무관). 그래서 **순검정 바탕 + 순백 라인**으로 생성한 뒤,
 *    sharp 에서 휘도를 알파 채널로 승격시켜 진짜 투명 에셋을 만든다 (markOne 참조).
 */
const MARK_STYLE =
  "Minimal etched line illustration, single-weight 2px pure white (#ffffff) line art on a solid pure black (#000000) background. " +
  "Engraving / letterpress style, geometric and austere, generous negative space, composition anchored toward bottom-right. " +
  "Absolutely NO text, NO letters, NO logos, NO emblems, NO badges, NO people, NO fills, NO gradients, NO gray shading."

const MARKS = [
  { id: "mark-epl", scene: "an abstract stadium bowl seen from a high corner, sweeping seating tiers as concentric arcs" },
  { id: "mark-laliga", scene: "abstract Iberian arches and a low geometric sun of thin rays" },
  { id: "mark-seriea", scene: "a rhythm of Roman colosseum arches in two receding tiers" },
  { id: "mark-bundesliga", scene: "bold diagonal pitch lines and a geometric gothic spire silhouette" },
  { id: "mark-ligue1", scene: "an abstract hexagon lattice dissolving into thin lines" },
  // ⚠️ 1차안(사각별 8개 링)은 UEFA 스타볼과 개념이 겹쳐 반려 (2026-08-20 법무 가드레일).
  //    별 모티프 자체를 피하고 "챔스의 밤 = 플러드라이트"로 치환.
  { id: "mark-ucl", scene: "four tall stadium floodlight pylons with crossing diagonal light beams drawn as thin straight lines, night match atmosphere, no stars" },
  { id: "mark-uel", scene: "concentric orbital circles with one small comet line crossing" },
]

async function generate(prompt) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-image-2",
      prompt,
      size: "1536x1024",
      quality: "high",
      n: 1,
    }),
    signal: AbortSignal.timeout(180000),
  })
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`)
  const j = await res.json()
  const b64 = j.data?.[0]?.b64_json
  if (!b64) throw new Error("이미지 없음")
  return Buffer.from(b64, "base64")
}

async function emptyOne(t) {
  const raw = await generate(`${t.scene} ${EMPTY_STYLE}`)
  writeFileSync(`${RAW_DIR}/${t.id}.png`, raw)
  // 720×480 다운스케일 — AI 노이즈 제거 + 용량
  const out = await sharp(raw).resize(720, 480, { fit: "cover" }).webp({ quality: 82 }).toBuffer()
  mkdirSync("public/images/empty", { recursive: true })
  writeFileSync(`public/images/empty/${t.id}.webp`, out)
  console.log(`  ✓ ${t.id} (${Math.round(out.length / 1024)}KB) — ${t.desc}`)
}

async function markOne(t) {
  const raw = await generate(`${t.scene}. ${MARK_STYLE}`)
  writeFileSync(`${RAW_DIR}/${t.id}.png`, raw)
  // 검정 바탕 흰 라인 → 휘도를 알파로 승격 + 크림 단색 채움 = 진짜 투명 워터마크.
  // 1536×1024 → 1200×800 (3:2 그대로라 fit 무관하게 정확히 이 크기).
  const W = 1200
  const H = 800
  const alpha = await sharp(raw)
    .resize(W, H)
    .grayscale()
    .linear(1.15, -8) // 근검정 노이즈를 알파 0 으로 눌러 붙임 (다크 밴드 위 얼룩 방지)
    .extractChannel(0)
    .raw()
    .toBuffer()
  const out = await sharp({
    create: { width: W, height: H, channels: 3, background: { r: 245, g: 239, b: 231 } }, // 크림 #f5efe7
  })
    .joinChannel(alpha, { raw: { width: W, height: H, channels: 1 } })
    .webp({ quality: 80 })
    .toBuffer()
  mkdirSync("public/images/league-marks", { recursive: true })
  writeFileSync(`public/images/league-marks/${t.id}.webp`, out)
  console.log(`  ✓ ${t.id} (${Math.round(out.length / 1024)}KB)`)
}

async function main() {
  mkdirSync(RAW_DIR, { recursive: true })
  const onlyIdx = process.argv.indexOf("--only")
  const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null
  const doEmpty = process.argv.includes("--empty") || (only && EMPTY.some((t) => t.id === only))
  const doMarks = process.argv.includes("--marks") || (only && MARKS.some((t) => t.id === only))

  if (doEmpty) {
    for (const t of EMPTY) {
      if (only && t.id !== only) continue
      await emptyOne(t)
    }
  }
  if (doMarks) {
    for (const t of MARKS) {
      if (only && t.id !== only) continue
      await markOne(t)
    }
  }
  if (!doEmpty && !doMarks) console.log("사용법: --empty | --marks | --only <id>")
}

main().catch((e) => {
  console.error("[fatal]", e)
  process.exit(1)
})

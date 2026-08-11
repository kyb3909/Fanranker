/**
 * 축구 루나 에셋 생성 — 타로 서비스(D:/Projects/tarot)의 루나를 축구 팬 버전으로.
 *
 * ## 왜 "다시 그리기"인가
 * 타로 서비스의 gen-luna-expressions.mts 와 같은 방식(images/edits, 마스크 없음).
 * 얼굴만 인페인팅하면 경계가 티 나고, 고개 기울임·어깨 움직임이 따라오는 표정을 못 만든다.
 * 대신 프롬프트로 프레이밍·캐릭터를 고정하고 결과를 눈으로 검수한다.
 *
 * ## 축구화 방향 (운영자: "포춘텔러스러움은 유지하되 축구적인 느낌")
 * 캐릭터·화풍·구도는 원본 그대로. **소품만 전부 축구로 갈아끼운다** —
 * 수정구 안에 초록 피치와 조명탑, 후드 위에 팀 머플러, 테이블보는 잔디 라인,
 * 배경 커튼에 페넌트, 책은 축구 연감. "점집인데 축구 팬의 점집".
 *
 * 실행:
 *   node scripts/gen-luna-football.mjs --base          # 1단계: 축구 루나 원본
 *   node scripts/gen-luna-football.mjs                 # 2단계: 표정 6종
 *   node scripts/gen-luna-football.mjs focused smile   # 특정 표정만
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import sharp from "sharp"

const SIZE = 1024
const OUT_DIR = "public/luna"
/** 타로 서비스의 원본 루나 — 축구 버전의 씨앗 */
const SEED = "D:/Projects/tarot/public/luna/character.png"
const BASE = `${OUT_DIR}/football.png`

/**
 * 1단계 — 원본 루나를 축구 점집으로.
 * 캐릭터 동일성이 최우선이라 "얼굴·머리·화풍은 절대 유지" 를 먼저 못박고 소품을 지시한다.
 */
const BASE_PROMPT = [
  "Redraw this exact anime fortune-teller illustration, keeping the girl IDENTICAL but changing her surroundings and outfit accents to a football (soccer) theme.",
  "Keep EXACTLY the same: her face and head proportions, the same very large round eyes with almost black irises and a bright white highlight, the same long dark hair with blunt bangs, the same pale skin with soft pink blush, the same gentle closed-mouth expression, the same flat cel-shaded anime art style and line weight, the same framing and camera distance, the same centered composition with her behind a table.",
  "Change the scene to a cozy football fortune-teller's parlour at night:",
  "— She still wears a hood, but it is a deep burgundy football-club hood; a knitted supporter's scarf in burgundy and cream stripes hangs around her neck over the robe, with small tassels.",
  "— The crystal ball on the wooden stand now glows with a tiny green football pitch inside it: white pitch lines, a centre circle, and two glowing floodlight towers, like a stadium held in glass.",
  "— The table cloth is deep green like turf, with faint white pitch markings and a corner arc printed on it.",
  "— On the left, replace the potion bottles with a worn leather football and a candle; on the right, replace the books with a stack of thick football almanacs and a rolled-up fixture list tied with string.",
  "— The background curtain is deep burgundy instead of purple, with small triangular club pennants strung across the top instead of star garlands, and one hanging lantern still on the right.",
  "— Keep a few mystical touches so it still reads as a fortune teller: a crescent moon ornament, faint gold star embroidery on the hood, soft candle glow.",
  "Warm, inviting, slightly magical. Not a stadium photo — still an intimate indoor reading table. No text, no letters, no numbers, no team logos.",
].join(" ")

/** 2단계 — 표정 6종. 슬롯 키는 타로 서비스의 EXPRESSIONS 와 1:1 (재사용 위해 유지). */
const EXPRESSIONS = [
  {
    key: "neutral",
    prompt:
      "Calm and composed. Relaxed eyelids, eyes looking softly at the viewer, small gentle closed mouth, head straight, shoulders settled. Serene.",
  },
  {
    key: "focused",
    prompt:
      "Deep concentration as she reads the cards. Eyelids lowered slightly, brows drawn a little together, lips pressed into a thin serious line, chin dipped a touch so she gazes from under her lashes, leaning in toward the orb. Intent and absorbed.",
  },
  {
    key: "smile",
    prompt:
      "Warm reassuring smile, like a supporter who already knows the result is good. Eyes softly curved into happy crescents, a clear gentle upturned smile, cheeks lifted, head straight, shoulders relaxed.",
  },
  {
    key: "tilt",
    prompt:
      "Puzzled and curious. Head visibly tilted to one side, one eyebrow raised higher than the other, eyes wide with curiosity, mouth small and slightly open as if about to ask a question. Thinking, unsure.",
  },
  {
    key: "worried",
    prompt:
      "Worried and sympathetic, the face of a fan watching the last ten minutes with a one-goal lead. Eyebrows angled up in the middle in a troubled furrow, eyes soft and anxious, mouth a small downward curve, head tipped slightly forward, shoulders drawn in a little.",
  },
  {
    key: "surprised",
    prompt:
      "Startled by what the cards reveal, like a shock result coming in. Eyes opened wide, eyebrows raised high, small round open mouth, head pulled back slightly, shoulders lifted. Caught off guard.",
  },
]

/** 표정 생성 시 장면이 흔들리지 않게 — 축구 소품을 하나씩 다시 못박는다 */
const GUARD = [
  "Redraw this exact anime illustration with a different facial expression for the football fortune-teller girl.",
  "Keep EVERYTHING else identical: the same character design and face proportions, the same very large round eyes with almost black irises and a bright white highlight, the same long dark hair and blunt bangs, the same burgundy hood with gold embroidery, the same knitted burgundy-and-cream supporter's scarf.",
  "Keep the exact same scene: the same burgundy curtain background with triangular pennants, the hanging lantern on the right, the candle and leather football on the left, the stack of football almanacs on the right, the green turf-coloured table with white pitch markings, and the glass orb containing the tiny glowing pitch with floodlights at the same position and the same size.",
  "Keep the exact same framing, camera distance and zoom level — do not zoom in or out, do not crop differently, do not move the character. Same flat cel-shaded anime art style, same line weight, same lighting and warm palette, same pale skin with soft pink blush. No text, no letters, no numbers, no team logos.",
  "Only her expression changes, plus the small natural head and shoulder movement that expression implies.",
  "Expression: ",
].join(" ")

async function edit(imageBuf, prompt, outPath) {
  const form = new FormData()
  form.append("model", "gpt-image-2")
  form.append("image", new Blob([new Uint8Array(imageBuf)], { type: "image/png" }), "luna.png")
  form.append("prompt", prompt)
  form.append("size", `${SIZE}x${SIZE}`)
  form.append("quality", "high")
  form.append("n", "1")

  const t0 = Date.now()
  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(300000),
  })
  const json = await res.json()
  if (!res.ok || !json.data?.[0]?.b64_json) {
    console.error(`  ✗ ${outPath}: ${JSON.stringify(json.error ?? json).slice(0, 200)}`)
    return false
  }
  const png = Buffer.from(json.data[0].b64_json, "base64")
  writeFileSync(outPath, png)
  // 화면이 참조하는 건 webp — PNG 는 장당 1MB+ 라 그대로 두면 저장소가 붓는다
  await sharp(png).webp({ quality: 90 }).toFile(outPath.replace(/\.png$/, ".webp"))
  console.log(`  ✓ ${outPath} (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
  return true
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const argv = process.argv.slice(2)

  if (argv.includes("--base")) {
    if (!existsSync(SEED)) throw new Error(`원본 루나를 찾을 수 없다: ${SEED}`)
    console.log("■ 1단계 — 축구 루나 원본 생성")
    await edit(readFileSync(SEED), BASE_PROMPT, BASE)
    return
  }

  if (!existsSync(BASE)) {
    throw new Error(`축구 루나 원본이 없다. 먼저: node scripts/gen-luna-football.mjs --base`)
  }
  const only = argv.filter((a) => !a.startsWith("--"))
  const targets = only.length ? EXPRESSIONS.filter((e) => only.includes(e.key)) : EXPRESSIONS
  if (!targets.length) throw new Error(`알 수 없는 표정: ${only.join(", ")}`)

  console.log(`■ 2단계 — 표정 ${targets.length}종`)
  const base = readFileSync(BASE)
  for (const exp of targets) {
    await edit(base, GUARD + exp.prompt, `${OUT_DIR}/football-${exp.key}.png`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

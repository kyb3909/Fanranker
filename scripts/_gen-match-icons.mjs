// 매치 라인업 인시던트 아이콘 생성 — OpenAI 이미지 모델 (운영자 지시: "이미지2로")
// 산출: public/match/icons/{goal,red-card,yellow-card,sub-in,sub-out}.png (64px, 투명배경)
import "dotenv/config"
import fs from "node:fs"
import sharp from "sharp"

const KEY = process.env.OPENAI_API_KEY
const STYLE =
  "Minimal flat editorial pictogram for a newspaper sports page. Single centered symbol, clean geometric shapes, no gradients, no shadows, no outline box, no text. Transparent background. Large margin around the symbol."

const ICONS = [
  {
    name: "goal",
    prompt: `${STYLE} A classic soccer ball icon, solid very dark brown-black ink color (#1a1714), pentagon pattern.`,
  },
  {
    name: "red-card",
    prompt: `${STYLE} A single referee red card, slightly tilted rounded rectangle, solid deep red (#c03a3a).`,
  },
  {
    name: "yellow-card",
    prompt: `${STYLE} A single referee yellow card, slightly tilted rounded rectangle, solid amber yellow (#e0a82e).`,
  },
  {
    name: "sub-in",
    prompt: `${STYLE} A substitution-in arrow: one bold arrow pointing right-upward, solid green (#2f7d5b).`,
  },
  {
    name: "sub-out",
    prompt: `${STYLE} A substitution-out arrow: one bold arrow pointing right-downward, solid muted red (#c03a3a).`,
  },
]

fs.mkdirSync("public/match/icons", { recursive: true })

async function gen(model, prompt) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model,
      prompt,
      size: "1024x1024",
      background: "transparent",
      output_format: "png",
      n: 1,
    }),
  })
  const d = await res.json()
  if (!res.ok) throw new Error(`${model}: ${d.error?.message ?? res.status}`)
  const b64 = d.data?.[0]?.b64_json
  if (!b64) throw new Error(`${model}: no image payload`)
  return Buffer.from(b64, "base64")
}

for (const icon of ICONS) {
  let buf
  try {
    buf = await gen("gpt-image-2", icon.prompt)
  } catch (e) {
    console.log(`gpt-image-2 실패(${e.message.slice(0, 80)}) → gpt-image-1 폴백`)
    buf = await gen("gpt-image-1", icon.prompt)
  }
  const out = `public/match/icons/${icon.name}.png`
  await sharp(buf).trim().resize(64, 64, { fit: "inside" }).png().toFile(out)
  console.log("✓", out, fs.statSync(out).size, "bytes")
}

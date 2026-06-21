// bet-slip.png 배경 제거 — 가장자리 flood-fill 로 테두리에 연결된 흰 배경만 투명화.
// 버건디 외곽선 안의 흰 몸통은 enclosed 라 보존됨. 끝나면 512px 로 리사이즈해 저장.
import sharp from "sharp"

const SRC = "public/mascot/bet-slip.png"
const OUT = "public/mascot/bet-slip.png"

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const { width: w, height: h, channels: ch } = info // ch = 4

// 배경 후보 = 모든 채널이 밝음(연한 회색/흰색). 버건디 외곽선(어두움)에서 멈춤.
const isLight = (p) => {
  const i = p * ch
  return data[i] > 222 && data[i + 1] > 222 && data[i + 2] > 222
}

const visited = new Uint8Array(w * h)
const stack = []
// 4 변의 모든 픽셀을 시드로
for (let x = 0; x < w; x++) {
  stack.push(x) // top row (y=0)
  stack.push((h - 1) * w + x) // bottom row
}
for (let y = 0; y < h; y++) {
  stack.push(y * w) // left col
  stack.push(y * w + (w - 1)) // right col
}

let removed = 0
while (stack.length) {
  const p = stack.pop()
  if (visited[p]) continue
  if (!isLight(p)) continue // 외곽선/피사체에 닿음 → 중단
  visited[p] = 1
  data[p * ch + 3] = 0 // 투명
  removed++
  const x = p % w
  const y = (p / w) | 0
  if (x + 1 < w) stack.push(p + 1)
  if (x - 1 >= 0) stack.push(p - 1)
  if (y + 1 < h) stack.push(p + w)
  if (y - 1 >= 0) stack.push(p - w)
}

await sharp(data, { raw: { width: w, height: h, channels: ch } })
  .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9 })
  .toFile(OUT + ".tmp")

// 원자적 교체
const { renameSync } = await import("node:fs")
renameSync(OUT + ".tmp", OUT)

console.log(`배경 제거 완료: ${removed.toLocaleString()}px 투명화 → ${OUT} (512x512)`)

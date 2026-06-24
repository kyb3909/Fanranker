/**
 * 레이어드 아바타 에셋 추출 — 메타버스 런타임 레이어링(꾸미기)용.
 *
 * `Male.aseprite` / `FEMALE.aseprite` 의 레이어를 베이스(몸+머리) · 상의 · 하의 슬롯별로
 * 투명 분리한 뒤, Aseprite 태그(walking/idle/run/jump/bite/headbut/kick/knockback/pain)를
 * 그대로 9개 애니 폴더로 추출한다. 런타임은 base + 장착 상/하의 스프라이트를 같은 프레임으로
 * 겹쳐 그린다 (lib/metaverse/avatar/gandalf-avatar.ts).
 *
 * 출력: public/metaverse/avatars/layered/<base>/<slot-dir>/<anim>/frame_NNN.png
 *   base/                (body + hair)
 *   top/{basic,1t,2t,3t,pink}/
 *   bottom/{basic,blue}/
 *
 * 새 옷을 추가할 때: .aseprite 에 레이어 추가 → 아래 BASES[].sets 에 항목 추가 → 재실행.
 *
 * 사용: node scripts/export-avatar-layers.mjs [male|female|all]
 *   ASEPRITE_PATH 환경변수로 Aseprite 실행 파일 경로 지정 (미설정 시 Steam 기본 경로).
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, cpSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import os from "node:os"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const ASEPRITE =
  process.env.ASEPRITE_PATH ||
  "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Aseprite\\Aseprite.exe"
const OUT_ROOT = join(ROOT, "public", "metaverse", "avatars", "layered")
const ANIMS = ["walking", "idle", "run", "jump", "bite", "headbut", "kick", "knockback", "pain"]

/** 슬롯 구성 — 상/하의 레이어명은 .aseprite 기준. 기본 바지 레이어명만 남녀가 다름. */
const BASES = {
  male: {
    file: join(ROOT, "Male.aseprite"),
    sets: [
      { dir: "base", layers: ["body", "hair"] },
      { dir: "top/basic", layers: ["basic top"] },
      { dir: "top/1t", layers: ["1T"] },
      { dir: "top/2t", layers: ["2T"] },
      { dir: "top/3t", layers: ["3T"] },
      { dir: "top/pink", layers: ["Pink"] },
      { dir: "bottom/basic", layers: ["basicpants_walking"] },
      { dir: "bottom/blue", layers: ["blue pants"] },
    ],
  },
  female: {
    file: join(ROOT, "FEMALE.aseprite"),
    sets: [
      { dir: "base", layers: ["body", "hair"] },
      { dir: "top/basic", layers: ["basic top"] },
      { dir: "top/1t", layers: ["1T"] },
      { dir: "top/2t", layers: ["2T"] },
      { dir: "top/3t", layers: ["3T"] },
      { dir: "top/pink", layers: ["Pink"] },
      { dir: "bottom/basic", layers: ["basicpants"] },
      { dir: "bottom/blue", layers: ["blue pants"] },
    ],
  },
}

/** JS sets 배열 → Lua 테이블 리터럴. */
function setsToLua(sets) {
  return sets
    .map((s) => {
      const layers = s.layers.map((l) => `"${l}"`).join(", ")
      return `  { dir = "${s.dir}", layers = { ${layers} } },`
    })
    .join("\n")
}

function buildLua(outDir, sets) {
  const out = outDir.replaceAll("\\", "/")
  return `local spr = app.activeSprite or app.sprite
if not spr then print("NO_SPRITE") return end
local out = "${out}"
local sets = {
${setsToLua(sets)}
}
local function has(name)
  for _, l in ipairs(spr.layers) do if l.name == name then return true end end
  return false
end
local function setVis(layers)
  local want = {}
  for _, n in ipairs(layers) do want[n] = true end
  for _, l in ipairs(spr.layers) do l.isVisible = want[l.name] == true end
end
local total = 0
for _, set in ipairs(sets) do
  for _, n in ipairs(set.layers) do
    if not has(n) then print("MISSING '" .. n .. "' for " .. set.dir) end
  end
  setVis(set.layers)
  for _, tag in ipairs(spr.tags) do
    local from = tag.fromFrame.frameNumber
    local to = tag.toFrame.frameNumber
    for f = from, to do
      local img = Image(spr.width, spr.height, ColorMode.RGB)
      img:drawSprite(spr, f)
      local path = out .. "/" .. set.dir .. "/" .. tag.name .. "/frame_" .. string.format("%03d", f - from) .. ".png"
      img:saveAs(path)
      total = total + 1
    end
  end
end
print("WROTE " .. total .. " frames -> " .. out)
`
}

function exportBase(name) {
  const cfg = BASES[name]
  if (!cfg) throw new Error(`unknown base: ${name}`)
  if (!existsSync(cfg.file)) throw new Error(`source not found: ${cfg.file}`)

  // Aseprite 의 saveAs 는 비ASCII(한글/공백/괄호) 출력 경로에서 깨지므로, ASCII 임시 폴더에
  // 추출한 뒤 Node 가 실제 public/ 경로(한글 포함 가능)로 복사한다.
  const stageDir = join(os.tmpdir(), `avatar-layers-${name}`)
  rmSync(stageDir, { recursive: true, force: true })
  for (const set of cfg.sets) {
    for (const anim of ANIMS) mkdirSync(join(stageDir, set.dir, anim), { recursive: true })
  }

  const luaPath = join(os.tmpdir(), `export-layers-${name}.lua`)
  writeFileSync(luaPath, buildLua(stageDir, cfg.sets), "utf8")

  console.log(`\n[${name}] ${cfg.file}`)
  const stdout = execFileSync(ASEPRITE, ["-b", cfg.file, "--script", luaPath], {
    encoding: "utf8",
  })
  process.stdout.write(stdout)

  // 임시(ASCII) → 실제 출력 경로 복사
  const outDir = join(OUT_ROOT, name)
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(OUT_ROOT, { recursive: true })
  cpSync(stageDir, outDir, { recursive: true })
  rmSync(stageDir, { recursive: true, force: true })

  // 출력 요약
  for (const set of cfg.sets) {
    const counts = ANIMS.map((a) => readdirSync(join(outDir, set.dir, a)).length)
    console.log(`  ${set.dir.padEnd(13)} ${counts.reduce((x, y) => x + y, 0)} frames`)
  }
}

const arg = (process.argv[2] || "all").toLowerCase()
const targets = arg === "all" ? Object.keys(BASES) : [arg]
for (const t of targets) exportBase(t)
console.log("\n완료. 출력 루트:", OUT_ROOT)

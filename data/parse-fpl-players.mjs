import { readFileSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { TEAMS, PLAYERS } from "./fpl-korean-names.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))

const raw = readFileSync(join(__dirname, "fpl-players-raw.txt"), "utf-8")
const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean)

const positionMap = { GK: "GK", DF: "DF", MF: "MF", FW: "FW" }
let currentPosition = ""
const players = []
let id = 0
let unmapped = []

for (const line of lines) {
  if (positionMap[line]) {
    currentPosition = line
    continue
  }

  const parts = line.split("\t")
  if (parts.length < 3) continue

  const name = parts[0].trim()
  const team = parts[1].trim()
  const costStr = parts[parts.length - 1].trim().replace("£", "")
  const cost = parseFloat(costStr)

  if (!name || !team || isNaN(cost)) continue

  id++

  const krName = PLAYERS[name] || name
  const krTeam = TEAMS[team] || team

  if (!PLAYERS[name]) unmapped.push(name)

  players.push({
    id: `epl-${id}`,
    name: krName,
    nameEn: name,
    team: krTeam,
    teamEn: team,
    position: currentPosition,
    cost,
  })
}

// Generate TypeScript
const tsLines = [
  `import type { Player } from "./types"`,
  ``,
  `export const EPL_PLAYERS: Player[] = [`,
]

for (const p of players) {
  const nameEsc = p.name.replace(/"/g, '\\"')
  const nameEnEsc = p.nameEn.replace(/"/g, '\\"')
  tsLines.push(
    `  { id: "${p.id}", name: "${nameEsc}", nameEn: "${nameEnEsc}", team: "${p.team}", teamEn: "${p.teamEn}", position: "${p.position}", cost: ${p.cost} },`
  )
}

tsLines.push(`]`)
tsLines.push(``)

const outPath = join(__dirname, "..", "lib", "draft", "epl-players.ts")
writeFileSync(outPath, tsLines.join("\n"), "utf-8")

console.log(`✅ ${players.length}명 선수 파싱 완료 → lib/draft/epl-players.ts`)
console.log(`   GK: ${players.filter((p) => p.position === "GK").length}`)
console.log(`   DF: ${players.filter((p) => p.position === "DF").length}`)
console.log(`   MF: ${players.filter((p) => p.position === "MF").length}`)
console.log(`   FW: ${players.filter((p) => p.position === "FW").length}`)

if (unmapped.length > 0) {
  console.log(`\n⚠️ 한국어 매핑 누락 ${unmapped.length}명:`)
  unmapped.forEach((n) => console.log(`   - ${n}`))
}

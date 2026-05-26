import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const raw = fs.readFileSync(path.join(__dirname, "../docs/arsenal_players.csv"), "utf-8")

const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
const [, ...rows] = lines

const players = []
let id = 0
for (const row of rows) {
  const parts = row.split(",")
  if (parts.length < 3) continue
  const name = parts[0].trim()
  const position = parts[1].trim()
  const priceStr = parts[2].replace("$", "").trim()
  const price = parseFloat(priceStr)
  if (!name || !position || isNaN(price)) continue
  if (!["GK", "DF", "MF", "FW"].includes(position)) {
    console.warn(`Unknown position "${position}" for ${name}`)
    continue
  }
  id++
  players.push({
    id: `a${id}`,
    name,
    nameKo: name,
    team: "Arsenal",
    teamKo: "아스널",
    position,
    price,
  })
}

const output = JSON.stringify(players, null, 2)
fs.writeFileSync(path.join(__dirname, "../public/data/arsenal-players.json"), output)

console.log(`Parsed ${players.length} Arsenal players`)
console.log(`  GK: ${players.filter((p) => p.position === "GK").length}`)
console.log(`  DF: ${players.filter((p) => p.position === "DF").length}`)
console.log(`  MF: ${players.filter((p) => p.position === "MF").length}`)
console.log(`  FW: ${players.filter((p) => p.position === "FW").length}`)
console.log(`  price min/max: $${Math.min(...players.map((p) => p.price))} / $${Math.max(...players.map((p) => p.price))}`)

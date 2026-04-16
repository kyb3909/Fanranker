import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { TEAMS, PLAYERS } from "../data/fpl-korean-names.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const raw = fs.readFileSync(path.join(__dirname, "../data/fpl-players-raw.txt"), "utf-8")

const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean)

const positionHeaders = { GK: "GK", DF: "DF", MF: "MF", FW: "FW" }
let currentPos = ""
let id = 0
const players = []

for (const line of lines) {
  if (positionHeaders[line]) {
    currentPos = line
    continue
  }

  const parts = line.split("\t")
  if (parts.length < 3) continue

  const name = parts[0].trim()
  const team = parts[1].trim()
  const priceStr = parts[2].replace("£", "").trim()
  const price = parseFloat(priceStr)

  if (isNaN(price)) continue

  id++
  players.push({
    id: `p${id}`,
    name,
    nameKo: PLAYERS[name] || name,
    team,
    teamKo: TEAMS[team] || team,
    position: currentPos,
    price,
  })
}

const output = JSON.stringify(players, null, 2)
fs.writeFileSync(path.join(__dirname, "../public/data/fpl-players.json"), output)

console.log(`Parsed ${players.length} players`)
console.log(`  GK: ${players.filter((p) => p.position === "GK").length}`)
console.log(`  DF: ${players.filter((p) => p.position === "DF").length}`)
console.log(`  MF: ${players.filter((p) => p.position === "MF").length}`)
console.log(`  FW: ${players.filter((p) => p.position === "FW").length}`)

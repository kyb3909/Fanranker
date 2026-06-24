import { readFileSync, writeFileSync } from "node:fs"

// public/data/arsenal-players.json → arsenal-draft-players.csv
// 엑셀 호환: UTF-8 BOM + CRLF (한글 안 깨짐)
const players = JSON.parse(readFileSync("public/data/arsenal-players.json", "utf8"))

const esc = (v) => {
  const s = String(v ?? "")
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const header = ["id", "이름", "포지션", "몸값"]
const rows = players.map((p) => [p.id, p.nameKo ?? p.name, p.position, p.price])
const csv = "﻿" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n"

writeFileSync("arsenal-draft-players.csv", csv)
console.log(`Wrote ${players.length} players → arsenal-draft-players.csv`)

/**
 * fpl-players.json(EPL 820명) → news_alias_dictionary 시드 (사가 W2, P0 오딧 §2-엔티티).
 *
 * 원칙:
 * - EPL 안에서 성씨가 유일한 선수만 시드한다 — "Silva" 같은 중복 성씨를 넣으면
 *   서로 다른 선수가 한 사가로 병합된다 (병합오류 0 > 커버리지).
 * - 이미 사전에 있는 surface 와 겹치면 건너뜀 (수동 큐레이션 항목이 우선).
 * - id 는 `player_fpl_<id>` — 재실행 upsert 멱등.
 *
 * 실행: pnpm exec tsx scripts/saga-seed-aliases.ts        (드라이런 — 쓰지 않음)
 *       pnpm exec tsx scripts/saga-seed-aliases.ts --write
 */
import "dotenv/config"
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { normalizePlayerKey } from "../lib/saga/identity"

interface FplPlayer {
  id: string
  name: string
  nameKo: string
  team: string
  teamKo: string
}

async function main() {
  const write = process.argv.includes("--write")
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("SUPABASE env 누락")
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const players = JSON.parse(readFileSync("public/data/fpl-players.json", "utf8")) as FplPlayer[]

  // 1) EPL 내 성씨 중복 제거
  const byKey = new Map<string, FplPlayer[]>()
  for (const p of players) {
    const k = normalizePlayerKey(p.name)
    if (!k) continue
    const list = byKey.get(k)
    if (list) list.push(p)
    else byKey.set(k, [p])
  }
  const unique = [...byKey.entries()]
    .filter(([, v]) => v.length === 1)
    .map(([k, v]) => ({
      key: k,
      player: v[0],
    }))
  const dupes = [...byKey.entries()].filter(([, v]) => v.length > 1)
  console.log(
    `fpl ${players.length}명 → 유일 성씨 ${unique.length} / 중복 성씨 제외 ${dupes.length}종`
  )

  // 2) 기존 사전 surface 와 충돌 제거
  const { data: existing } = await supabase
    .from("news_alias_dictionary")
    .select("id, romanized, surfaces")
  const taken = new Set<string>()
  for (const row of existing ?? []) {
    taken.add(normalizePlayerKey(row.romanized))
    for (const s of (row.surfaces as string[]) ?? []) taken.add(normalizePlayerKey(s))
  }
  const fresh = unique.filter(
    ({ key: k, player }) => !taken.has(k) || String(player.id).length === 0
  )
  const skipped = unique.length - fresh.length
  console.log(`기존 사전과 겹침 ${skipped} 제외 → 시드 대상 ${fresh.length}`)

  if (!write) {
    console.log("\n샘플 10건:")
    for (const { key: k, player } of fresh.slice(0, 10)) {
      console.log(`  ${k} → ${player.nameKo} (${player.teamKo})`)
    }
    console.log("\n--write 로 실제 반영")
    return
  }

  // 3) upsert (500건 청크)
  const rows = fresh.map(({ key: k, player }) => ({
    id: `player_fpl_${player.id}`,
    category: "player",
    preferred_ko: player.nameKo,
    romanized: player.name,
    surfaces: [k],
    disambiguation: player.team,
    confidence: 0.6,
    notes: `fpl seed (${player.teamKo})`,
  }))
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from("news_alias_dictionary")
      .upsert(rows.slice(i, i + 500), { onConflict: "id" })
    if (error) throw error
  }
  console.log(`시드 완료: ${rows.length}건`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

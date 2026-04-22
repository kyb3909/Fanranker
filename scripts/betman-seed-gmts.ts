/**
 * Betman 단일 gmTs 시드/백필 — 2026-04 사이트 개편 후 첫 수동 재가동용.
 *
 * 사용:
 *   pnpm exec tsx scripts/betman-seed-gmts.ts 260047
 *
 * 하는 일:
 *   1. betman `gameInfoInq.do` 호출 → { datas, keys } 획득
 *   2. `lib/betman/game-fetcher.ts` 의 parseGames 로 정규화 (승N패 스킵)
 *   3. betman_rounds upsert (기존이면 open 으로 되돌림)
 *   4. betman_games upsert (round_id + game_no) — 이미 종료된 행은 건드리지 않음
 *
 * 한국 IP 필요 — betman 은 해외 IP 차단.
 */

import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { fetchGameData, parseGames } from "../lib/betman/game-fetcher"

const UPSERT_BATCH_SIZE = 100
const ROUND_DEADLINE_DAYS = 7

async function main() {
  const gmTs = process.argv[2]
  if (!gmTs) {
    console.error("usage: tsx scripts/betman-seed-gmts.ts <gmTs>")
    process.exit(1)
  }

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`[betman-seed] fetching gmTs=${gmTs} from betman...`)
  const raw = await fetchGameData(gmTs)
  if (!raw || raw.datas.length === 0) {
    console.error(`[betman-seed] no data returned for gmTs=${gmTs}`)
    process.exit(1)
  }
  console.log(`[betman-seed] raw rows=${raw.datas.length}, keys=${raw.keys.length}`)

  // betman_rounds upsert — 기존 있으면 open 재활성화
  const year = new Date().getFullYear()
  const roundNum = parseInt(gmTs, 10) || 0

  const { data: existing } = await supabase
    .from("betman_rounds")
    .select("id, status")
    .eq("gm_ts", gmTs)
    .maybeSingle()

  let roundId: string
  if (existing) {
    roundId = existing.id
    if (existing.status === "closed") {
      await supabase.from("betman_rounds").update({ status: "open" }).eq("id", roundId)
      console.log(`[betman-seed] reopened existing round ${gmTs} (id=${roundId})`)
    } else {
      console.log(`[betman-seed] using existing round ${gmTs} (id=${roundId})`)
    }
  } else {
    const deadline = new Date()
    deadline.setDate(deadline.getDate() + ROUND_DEADLINE_DAYS)
    deadline.setHours(23, 59, 59, 999)

    const { data: created, error } = await supabase
      .from("betman_rounds")
      .insert({
        gm_ts: gmTs,
        year,
        round: roundNum,
        status: "open",
        deadline: deadline.toISOString(),
      })
      .select("id")
      .single()

    if (error || !created) {
      console.error(`[betman-seed] round insert failed:`, error?.message)
      process.exit(1)
    }
    roundId = created.id
    console.log(`[betman-seed] created round ${gmTs} (id=${roundId})`)
  }

  // Parse
  const games = parseGames(raw, roundId)
  console.log(`[betman-seed] parsed ${games.length} games (non-zero odds, supported types)`)

  if (games.length === 0) {
    console.log(`[betman-seed] nothing to upsert`)
    return
  }

  // 이미 종료된 game_no 스킵
  const { data: finished } = await supabase
    .from("betman_games")
    .select("game_no")
    .eq("round_id", roundId)
    .in("status", ["completed", "cancelled"])

  const finishedSet = new Set((finished || []).map((g: { game_no: number }) => g.game_no))
  const toUpsert = games.filter((g) => !finishedSet.has(g.game_no))
  const skipped = games.length - toUpsert.length
  if (skipped > 0) {
    console.log(`[betman-seed] skipping ${skipped} already-finalized games`)
  }

  // 분포 요약
  const byType = toUpsert.reduce<Record<string, number>>((acc, g) => {
    acc[g.game_type] = (acc[g.game_type] || 0) + 1
    return acc
  }, {})
  const bySport = toUpsert.reduce<Record<string, number>>((acc, g) => {
    acc[g.sport] = (acc[g.sport] || 0) + 1
    return acc
  }, {})
  console.log(`[betman-seed] by type:`, byType)
  console.log(`[betman-seed] by sport:`, bySport)

  let upserted = 0
  let errors = 0
  for (let i = 0; i < toUpsert.length; i += UPSERT_BATCH_SIZE) {
    const batch = toUpsert.slice(i, i + UPSERT_BATCH_SIZE)
    const { error } = await supabase
      .from("betman_games")
      .upsert(batch, { onConflict: "round_id,game_no", ignoreDuplicates: false })

    if (error) {
      console.error(`[betman-seed] batch ${i / UPSERT_BATCH_SIZE} upsert error:`, error.message)
      errors++
    } else {
      upserted += batch.length
    }
  }

  console.log(
    `[betman-seed] done — upserted=${upserted} errors=${errors} (round=${roundId}, gmTs=${gmTs})`
  )
}

main().catch((e) => {
  console.error("[betman-seed] fatal:", e)
  process.exit(1)
})

/**
 * 매핑 shadow 수동 1회 실행 (실록 단계 2) — cron 과 같은 lib 를 호출한다.
 * 로컬 검증·백필용. betman_games 는 절대 쓰지 않는다 (shadow 원칙).
 *
 * 실행: pnpm exec tsx scripts/run-match-mapping-shadow.ts [--limit=15]
 */

import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { runMatchMappingShadow } from "../lib/soccerway/match-mapping"

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.")
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="))
  const limit = limitArg ? Number(limitArg.slice(8)) || 15 : 15
  const discoverArg = process.argv.find((a) => a.startsWith("--discover="))
  const discoverLimit = discoverArg ? Number(discoverArg.slice(11)) || 0 : 6
  const lookbackArg = process.argv.find((a) => a.startsWith("--lookback="))
  const lookbackHours = lookbackArg ? Number(lookbackArg.slice(11)) || 24 : 24

  const supabase = createServiceClient()
  const summary = await runMatchMappingShadow(supabase, {
    limit,
    discoverLimit,
    lookbackHours,
    runId: `manual-${new Date().toISOString()}`,
  })

  console.log(JSON.stringify(summary, null, 2))
}

main().catch((e) => {
  console.error("[fatal]", e)
  process.exit(1)
})

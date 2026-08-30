/**
 * team_dictionary 백필 CLI — 로직은 `lib/lfa/team-backfill.ts` 에 있다.
 *
 * ⚠️ 이 파일은 **얇은 껍데기**다 (2026-08-30). 종전엔 279행짜리 자립 스크립트였고,
 *    그래서 사람이 기억해서 돌려야만 사전이 메워졌다 — 분데스리가 4팀이 미등재로
 *    남아 라인업이 영문으로 나간 사고가 그렇게 났다. 이제 같은 로직을
 *    `/api/cron/team-dictionary-backfill` 이 매일 돌린다.
 *    로직을 고칠 일이 있으면 **lib 쪽**을 고칠 것. 여기 옮겨 적으면 두 벌이 된다.
 *
 * 사용법:
 *   pnpm exec tsx scripts/backfill-team-dictionary-from-lfa.ts [--days=10]        # 미리보기
 *   pnpm exec tsx scripts/backfill-team-dictionary-from-lfa.ts [--days=10] --post # 등재
 */
import { config } from "dotenv"
import { createClient } from "@supabase/supabase-js"
import { resolve } from "node:path"
import { backfillTeamDictionaryFromLfa } from "@/lib/lfa/team-backfill"

config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes("--post")
  const days = Number(args.find((a) => a.startsWith("--days="))?.slice(7) ?? 10)
  const apiKey = process.env.LIVE_FOOTBALL_API_KEY
  if (!apiKey) throw new Error("LIVE_FOOTBALL_API_KEY 없음")

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const r = await backfillTeamDictionaryFromLfa(supabase, { apiKey, days, apply })

  console.log(`사전에 영문명이 없는 팀: ${r.missing.length}개`)
  if (r.missing.length === 0) return
  console.log(
    `\n회수 ${r.found.length}/${r.missing.length}건${apply ? " — 등재합니다" : " (미리보기)"}\n`
  )
  for (const f of r.found) console.log(`  ${f.kr}  →  ${f.en}${f.lfaId ? `  (${f.lfaId})` : ""}`)
  if (r.failedDates.length) console.log(`\nLFA 조회 실패 날짜: ${r.failedDates.join(", ")}`)
  if (r.unresolved.length) console.log(`\n회수 실패(동시 킥오프 등): ${r.unresolved.join(", ")}`)
  if (!apply) console.log("\n--post 를 붙이면 실제 등재합니다. (아래는 미리보기)")
  console.log(`\n라벨 등재: ${r.labelsWritten}건`)
  for (const d of r.dictAdded)
    console.log(`  사전 등재${apply ? "" : " 예정"} ${d.kr}  →  ${d.en}  (${d.id})`)
  for (const kr of r.dictSkipped) console.log(`  사전 등재 보류 ${kr}: LFA 팀 id 없음`)
  console.log(`\nteam_dictionary 신규 등재: ${r.dictAdded.length}건`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

/**
 * 사가 검수 큐 1회 드레인 — 자동 발행 정책(2026-08-04) 소급 적용.
 *
 * saga-extract 크론이 앞으로는 추출 직후 자동 발행하지만, 이미 'queued' 로 쌓인
 * 백로그는 크론이 다시 안 본다. 이 스크립트가 같은 기준(사전 등재 + 확신도 ≥ 0.7 +
 * 한국어 헤드라인 + 여자축구 아님)으로 한 번 훑어 발행한다. 미달 건은 그대로 남아
 * 통합 검수 화면(/admin/news-review)에서 사람이 처리.
 *
 * 실행: pnpm exec tsx scripts/saga-drain-queue.ts [--dry]
 */
import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { buildAliasIndex, canonicalizePlayer, type AliasRow } from "@/lib/saga/canonical"
import { publishReservoirItem, type ReservoirPublishRow } from "@/lib/saga/publish"
import { WOMENS_FOOTBALL_RE } from "@/lib/news/quality-gate"

const MIN_CONFIDENCE = 0.7
const dry = process.argv.includes("--dry")

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  ) as unknown as Parameters<typeof publishReservoirItem>[0]

  const { data: aliasRows } = await supabase
    .from("news_alias_dictionary")
    .select("romanized, preferred_ko, surfaces")
    .eq("category", "player")
  const aliasIndex = buildAliasIndex((aliasRows ?? []) as AliasRow[])

  const { data: queue } = await supabase
    .from("saga_reservoir")
    .select("id, source_url, source, title, headline_kr, extracted, occurred_at")
    .eq("status", "queued")
    .order("occurred_at", { ascending: true })

  let published = 0
  let skipped = 0
  for (const row of (queue ?? []) as ReservoirPublishRow[]) {
    const ex = row.extracted
    const headlineKo = ex?.headline_ko ?? row.headline_kr
    const canon = ex?.player ? canonicalizePlayer(ex.player, aliasIndex) : { matched: false }
    const womens = WOMENS_FOOTBALL_RE.test(
      `${row.title} ${row.headline_kr ?? ""} ${row.source_url}`
    )
    const eligible =
      !!ex && canon.matched && (ex.confidence ?? 0) >= MIN_CONFIDENCE && !!headlineKo && !womens

    if (!eligible) {
      skipped++
      console.log(`  [보류] ${(ex?.player ?? "?").padEnd(24)} ${row.title.slice(0, 60)}`)
      continue
    }
    if (dry) {
      published++
      console.log(`  [발행예정] ${ex.player} — ${headlineKo?.slice(0, 60)}`)
      continue
    }
    try {
      const r = await publishReservoirItem(supabase, row)
      published++
      console.log(
        `  [발행] ${r.sagaTitle}${r.folded ? " (에코 접힘)" : ""} — ${headlineKo?.slice(0, 50)}`
      )
    } catch (e) {
      skipped++
      console.log(`  [실패→보류] ${row.id}: ${(e as Error).message}`)
    }
  }
  console.log(`\n완료: 발행 ${published} / 보류 ${skipped}${dry ? " (드라이런)" : ""}`)
}

main()

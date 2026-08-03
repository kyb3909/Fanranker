/**
 * 사가 W2 드라이런 — 티커 14일치 transfer/rumor 기사를 추출→클러스터까지만 돌리고
 * 리포트를 쓴다. DB 쓰기 0 (PRD 게이트: 오너 육안 검수 통과 전 자동 발행 금지).
 *
 * 실행: pnpm exec tsx scripts/saga-backfill-dryrun.ts
 * 산출: workspace/saga-dryrun-<date>.md
 *
 * 검수 기준 (PRD §6): 선수 식별 ≥95% · 방향 ≥90% · 오병합(다른 선수 한 클러스터) 0건
 */
import "dotenv/config"
import { writeFileSync, mkdirSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { extractTransferBatch, type ExtractInput } from "../lib/saga/extract"
import { clusterBatch, type ClusterInput } from "../lib/saga/cluster"
import { classifyTier } from "../lib/saga/tier"
import { buildAliasIndex, canonicalizePlayer, type AliasRow } from "../lib/saga/canonical"

const WINDOW_KEY = "2026-summer"
const DAYS = 14
const LIMIT = 300
const BATCH = 20

interface TickerRow {
  id: number
  original_title: string | null
  headline_kr: string | null
  category: string | null
  link_url: string | null
  source_id: string | null
  posted_at: string
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("SUPABASE env 누락")
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY 누락")
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const cutoff = new Date(Date.now() - DAYS * 24 * 3600 * 1000).toISOString()
  const { data, error } = await supabase
    .from("news_ticker_items")
    .select("id, original_title, headline_kr, category, link_url, source_id, posted_at")
    .eq("community_slug", "football")
    .in("category", ["transfer", "rumor"])
    .gte("posted_at", cutoff)
    .order("posted_at", { ascending: false })
    .limit(LIMIT)
  if (error) throw error
  const rows = (data ?? []) as TickerRow[]
  console.log(`티커 ${rows.length}건 (${DAYS}일, transfer/rumor)`)

  // ── 추출 (20건 배치) ──
  const inputs: ExtractInput[] = rows.map((r) => ({
    title: r.original_title ?? r.headline_kr ?? "",
    headlineKr: r.headline_kr,
  }))
  const extracted: Awaited<ReturnType<typeof extractTransferBatch>> = []
  for (let i = 0; i < inputs.length; i += BATCH) {
    const batch = await extractTransferBatch(inputs.slice(i, i + BATCH))
    extracted.push(...batch)
    console.log(`  추출 ${Math.min(i + BATCH, inputs.length)}/${inputs.length}`)
  }

  // ── 별칭 정규화 (news_alias_dictionary exact-surface 병합) ──
  const { data: aliasRows } = await supabase
    .from("news_alias_dictionary")
    .select("romanized, preferred_ko, surfaces")
    .eq("category", "player")
  const aliasIndex = buildAliasIndex((aliasRows ?? []) as AliasRow[])
  let aliasMerged = 0

  // ── 클러스터 ──
  const clusterRows: ClusterInput[] = []
  let failed = 0
  let nonTransfer = 0
  let noPlayer = 0
  for (let i = 0; i < rows.length; i++) {
    const ex = extracted[i]
    if (!ex) {
      failed++
      continue
    }
    if (!ex.is_transfer) {
      nonTransfer++
      continue
    }
    if (!ex.player) {
      noPlayer++
      continue
    }
    const canon = canonicalizePlayer(ex.player, aliasIndex)
    if (canon.matched) {
      aliasMerged++
      ex.player = canon.key
      if (canon.ko) ex.player_kr = canon.ko
    }
    clusterRows.push({
      ref: String(rows[i].id),
      title: rows[i].original_title ?? rows[i].headline_kr ?? "",
      extracted: ex,
      tier: classifyTier(rows[i]),
      occurredAt: rows[i].posted_at,
    })
  }
  const groups = clusterBatch(clusterRows, WINDOW_KEY)
  groups.sort((a, b) => b.clusters.length - a.clusters.length)

  // ── 리포트 ──
  const totalClusters = groups.reduce((s, g) => s + g.clusters.length, 0)
  const totalEchoes = groups.reduce(
    (s, g) => s + g.clusters.reduce((t, c) => t + c.echoes.length, 0),
    0
  )
  const lowConf = clusterRows.filter((r) => r.extracted.confidence < 0.6).length

  const lines: string[] = [
    `# 사가 드라이런 리포트 — ${new Date().toISOString().slice(0, 10)}`,
    "",
    `- 입력: 티커 ${rows.length}건 (${DAYS}일, transfer/rumor)`,
    `- 추출 실패(배치 에러): ${failed} / 비이적 기사: ${nonTransfer} / 선수 미식별: ${noPlayer}`,
    `- 사가 후보: **${groups.length}개** / 클러스터(=엔트리): ${totalClusters} / 접힌 에코: ${totalEchoes}`,
    `- 사전 정규화 적중: ${aliasMerged}건 (미적중은 추출 표기 그대로 — 커버리지는 사전이 자라며 해결)`,
    `- 저신뢰(conf<0.6): ${lowConf}건`,
    "",
    `> 검수 기준: 선수 식별 ≥95% · 방향 ≥90% · **오병합 0건** — 아래 표에서 눈으로 확인.`,
    "",
  ]

  for (const g of groups) {
    lines.push(`## ${g.identityKey}  (엔트리 ${g.clusters.length})`)
    for (const c of g.clusters) {
      const tierTag =
        c.origin.tier === "official" ? "🟢오피셜" : c.origin.tier === "tier1" ? "🔵티어1" : "⚪루머"
      lines.push(`- \`${c.clusterKey}\` ${tierTag} conf=${c.origin.extracted.confidence}`)
      lines.push(`  - origin: ${c.origin.title}`)
      for (const e of c.echoes) lines.push(`  - echo: ${e.title}`)
    }
    lines.push("")
  }

  mkdirSync("workspace", { recursive: true })
  const out = `workspace/saga-dryrun-${new Date().toISOString().slice(0, 10)}.md`
  writeFileSync(out, lines.join("\n"), "utf8")
  console.log(`\n리포트: ${out}`)
  console.log(
    `사가 ${groups.length} / 클러스터 ${totalClusters} / 에코 ${totalEchoes} / 실패 ${failed}`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

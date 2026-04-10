// data/agents/scripts/dedupe-run.js
//
// Phase A Dedupe Checker (T0 rule-based)
// enriched → dedupe_checked / duplicate
//
// dedupe_key 일치 그룹 중 가장 오래된 항목만 dedupe_checked로 통과,
// 나머지는 duplicate로 마킹.
// Phase B에서 임베딩 cosine 유사도 보조 추가 예정.

import supabase from '../../crawlers/core/db.js'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

function log(msg) {
  process.stdout.write(`[${new Date().toISOString()}] [dedupe] ${msg}\n`)
}

async function main() {
  const { data: items, error } = await supabase
    .from('news_reservoir')
    .select('id, dedupe_key, created_at, audit')
    .eq('status', 'enriched')
    .order('created_at', { ascending: true })

  if (error) {
    log(`fetch error: ${error.message}`)
    process.exit(1)
  }

  log(`fetched ${items.length} enriched items`)
  if (items.length === 0) return

  // dedupe_key로 그룹화
  const groups = new Map()
  for (const item of items) {
    if (!groups.has(item.dedupe_key)) groups.set(item.dedupe_key, [])
    groups.get(item.dedupe_key).push(item)
  }

  log(`${groups.size} unique dedupe keys`)

  const totals = { unique: 0, duplicate: 0, errors: 0 }

  for (const [key, group] of groups) {
    for (let i = 0; i < group.length; i++) {
      const item = group[i]
      const isFirst = i === 0
      const newStatus = isFirst ? 'dedupe_checked' : 'duplicate'
      const message = isFirst
        ? group.length > 1 ? `kept (${group.length - 1} dups)` : 'unique'
        : `duplicate of ${group[0].id}`

      if (!isFirst) log(`  DUP — ${item.id} (of ${group[0].id})`)

      if (dryRun) {
        if (isFirst) totals.unique++
        else totals.duplicate++
        continue
      }

      const newAudit = [
        ...(item.audit || []),
        {
          at: new Date().toISOString(),
          agent: 'deduplication',
          action: 'check',
          status_from: 'enriched',
          status_to: newStatus,
          tier: 'T0',
          message,
        },
      ]

      const { error: updErr } = await supabase
        .from('news_reservoir')
        .update({ status: newStatus, audit: newAudit })
        .eq('id', item.id)

      if (updErr) {
        log(`  [ERR] ${updErr.message}`)
        totals.errors++
        continue
      }

      if (isFirst) totals.unique++
      else totals.duplicate++
    }
  }

  log('--- totals ---')
  for (const [k, v] of Object.entries(totals)) log(`  ${k.padEnd(10)}: ${v}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

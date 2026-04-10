// data/agents/scripts/assign-run.js
//
// Phase A Assignment (T0 rule-based)
// desk_approved → assigned
//
// Phase A 단일 writer (general_brief)로 라우팅.
// official announcement 또는 high credibility는 priority high.

import supabase from '../../crawlers/core/db.js'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

function log(msg) {
  process.stdout.write(`[${new Date().toISOString()}] [assign] ${msg}\n`)
}

async function main() {
  const { data: items, error } = await supabase
    .from('news_reservoir')
    .select('id, raw, normalized, scores, audit')
    .eq('status', 'desk_approved')
    .order('created_at', { ascending: true })

  if (error) {
    log(`fetch error: ${error.message}`)
    process.exit(1)
  }

  log(`fetched ${items.length} desk_approved items`)
  if (items.length === 0) return

  const totals = { processed: 0, errors: 0, high: 0, normal: 0, low: 0 }

  for (const item of items) {
    const credibility = item.scores?.credibility ?? 0
    const isOfficial = item.normalized?.officialAnnouncement || false

    let priority, deadlineMinutes
    if (isOfficial || credibility >= 0.95) {
      priority = 'high'
      deadlineMinutes = 10
    } else if (credibility < 0.7) {
      priority = 'low'
      deadlineMinutes = 60
    } else {
      priority = 'normal'
      deadlineMinutes = 30
    }

    totals[priority]++

    const assignment = { writer: 'general_brief', priority, deadlineMinutes }

    log(`  ${priority.toUpperCase().padEnd(6)} — ${(item.normalized?.title || item.raw.title).slice(0, 70)}`)

    if (dryRun) continue

    const newAudit = [
      ...(item.audit || []),
      {
        at: new Date().toISOString(),
        agent: 'assignment',
        action: 'assign',
        status_from: 'desk_approved',
        status_to: 'assigned',
        tier: 'T0',
        message: `writer=general_brief priority=${priority}`,
      },
    ]

    const { error: updErr } = await supabase
      .from('news_reservoir')
      .update({ status: 'assigned', assignment, audit: newAudit })
      .eq('id', item.id)

    if (updErr) {
      log(`  [ERR] ${updErr.message}`)
      totals.errors++
      continue
    }
    totals.processed++
  }

  log('--- totals ---')
  for (const [k, v] of Object.entries(totals)) log(`  ${k.padEnd(10)}: ${v}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

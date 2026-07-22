// data/agents/scripts/agg-takedown.js
//
// 출처 측 삭제 요청 대응 (T0)
// 원본 URL 또는 소스 전체 기준으로 발행 글 soft-delete + reservoir 상태 정리.
//
// 사용:
//   node data/agents/scripts/agg-takedown.js --url=https://theqoo.net/hot/12345
//   node data/agents/scripts/agg-takedown.js --source=theqoo        (해당 소스 발행글 전체)
//   node data/agents/scripts/agg-takedown.js --source=theqoo --dry-run

import supabase from '../../crawlers/core/db.js'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const urlArg = args.find((a) => a.startsWith('--url='))?.split('=').slice(1).join('=')
const sourceArg = args.find((a) => a.startsWith('--source='))?.split('=')[1]

function log(msg) {
  process.stdout.write(`[${new Date().toISOString()}] [agg-takedown] ${msg}\n`)
}

async function main() {
  if (!urlArg && !sourceArg) {
    log('사용법: --url=<원본URL> 또는 --source=<소스명>')
    process.exit(1)
  }

  let query = supabase
    .from('agg_reservoir')
    .select('id, source_url, post_id, status')
    .eq('status', 'published')
    .not('post_id', 'is', null)
  if (urlArg) query = query.eq('source_url', urlArg)
  if (sourceArg) query = query.eq('source', sourceArg)

  const { data: items, error } = await query
  if (error) {
    log(`fetch error: ${error.message}`)
    process.exit(1)
  }
  log(`대상 ${items.length}건 (dry=${dryRun})`)

  for (const item of items) {
    log(`  takedown post=${item.post_id} ← ${item.source_url}`)
    if (dryRun) continue
    const { error: pErr } = await supabase
      .from('posts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', item.post_id)
    if (pErr) {
      log(`  [ERR] post delete: ${pErr.message}`)
      continue
    }
    await supabase
      .from('agg_reservoir')
      .update({ status: 'rejected', reject_reason: 'takedown' })
      .eq('id', item.id)
  }
  log('완료')
}

main().catch((e) => {
  log(`FATAL: ${e.message}`)
  process.exit(1)
})

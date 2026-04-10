// data/agents/scripts/verify-phase-a.js
//
// Phase A 스키마 배포 후 건강 체크.
// 사용: env가 로드된 상태에서 `node data/agents/scripts/verify-phase-a.js`

import supabase from '../../crawlers/core/db.js'

async function main() {
  console.log('\n=== Phase A Verification ===\n')

  let allOk = true

  // 1. news_reservoir 총 row 수 (정확한 count)
  const r1 = await supabase
    .from('news_reservoir')
    .select('*', { count: 'exact', head: true })
  if (r1.error) {
    console.log(`[FAIL] news_reservoir: ${r1.error.message}`)
    allOk = false
  } else {
    console.log(`[OK]   news_reservoir: ${r1.count ?? 0} total rows`)
  }

  // 2. news_alias_dictionary 카테고리별 카운트
  const r2 = await supabase.from('news_alias_dictionary').select('category')
  if (r2.error) {
    console.log(`[FAIL] news_alias_dictionary: ${r2.error.message}`)
    allOk = false
  } else {
    const counts = r2.data.reduce((a, r) => ((a[r.category] = (a[r.category] || 0) + 1), a), {})
    const total = r2.data.length
    console.log(`[OK]   news_alias_dictionary: ${total} rows`)
    for (const [cat, n] of Object.entries(counts).sort()) {
      console.log(`         ${cat.padEnd(12)}: ${n}`)
    }
  }

  // 3. news_reservoir_queue_lengths view + 단계별 분포
  const r3 = await supabase.from('news_reservoir_queue_lengths').select('*')
  if (r3.error) {
    console.log(`[FAIL] news_reservoir_queue_lengths view: ${r3.error.message}`)
    allOk = false
  } else if (r3.data.length === 0) {
    console.log(`[OK]   news_reservoir_queue_lengths view: empty reservoir`)
  } else {
    console.log(`[OK]   news_reservoir_queue_lengths view:`)
    for (const q of r3.data) {
      console.log(`         ${String(q.status).padEnd(22)}: ${q.count}`)
    }
  }

  console.log('')
  if (allOk) {
    console.log('Phase A schema: all checks passed')
  } else {
    console.log('[WARN] some checks failed — see above')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

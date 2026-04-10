// data/agents/scripts/cleanup-reservoir.js
//
// Terminal 상태 (credibility_rejected, duplicate) 중 48시간 지난 항목 삭제.
// drafted / desk_held / desk_approved 등은 삭제 대상 아님.
//
// run-cycle.sh 끝에서 자동 호출되거나 단독 실행 가능.

import supabase from '../../crawlers/core/db.js'

const CLEANUP_STATUSES = ['credibility_rejected', 'duplicate']
const TTL_HOURS = 48

function log(msg) {
  process.stdout.write(`[${new Date().toISOString()}] [cleanup] ${msg}\n`)
}

async function main() {
  const cutoff = new Date(Date.now() - TTL_HOURS * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('news_reservoir')
    .delete()
    .in('status', CLEANUP_STATUSES)
    .lt('created_at', cutoff)
    .select('id')

  if (error) {
    log(`ERROR: ${error.message}`)
    process.exit(1)
  }

  const deleted = data?.length ?? 0
  if (deleted > 0) {
    log(`Deleted ${deleted} expired items (${CLEANUP_STATUSES.join(', ')}, >${TTL_HOURS}h)`)
  } else {
    log(`Nothing to clean up`)
  }

  // reservoir 크기 리포트 (간단)
  const { count } = await supabase
    .from('news_reservoir')
    .select('*', { count: 'exact', head: true })

  log(`Reservoir total: ${count ?? '?'} rows`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

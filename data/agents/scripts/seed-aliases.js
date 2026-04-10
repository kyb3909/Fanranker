// data/agents/scripts/seed-aliases.js
//
// Phase A 시드: config/alias-seeds.json을 news_alias_dictionary 테이블에 upsert.
// 멱등성: PRIMARY KEY id 기반 UPSERT. 재실행 안전.
//
// 사용:
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node data/agents/scripts/seed-aliases.js
//
// 또는 프로젝트 루트에서:
//   pnpm --filter ./data/agents seed:aliases
//
// 의존성 노트: 자체 node_modules 없이 data/crawlers/core/db.js의 supabase client를
// 그대로 빌려 쓴다. 두 패키지 모두 ESM. data/crawlers/node_modules의 @supabase/supabase-js가
// 트랜지티브하게 해석된다.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import supabase from '../../crawlers/core/db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SEED_PATH = join(__dirname, '..', 'config', 'alias-seeds.json')

function flatten(seed) {
  const rows = []
  const cats = [
    ['players',      'player'],
    ['teams',        'team'],
    ['coaches',      'coach'],
    ['competitions', 'competition']
  ]
  for (const [key, category] of cats) {
    for (const e of seed[key] || []) {
      rows.push({
        id:             e.id,
        category,
        preferred_ko:   e.preferred_ko,
        romanized:      e.romanized,
        surfaces:       (e.surfaces || []).map((s) => s.toLowerCase()),
        hangul_alts:    e.hangul_alts ?? null,
        disambiguation: e.disambiguation ?? null,
        confidence:     e.confidence,
        ko_first_seen:  e.ko_first_seen ?? null,
        notes:          e.notes ?? null
      })
    }
  }
  return rows
}

async function main() {
  const seed = JSON.parse(readFileSync(SEED_PATH, 'utf8'))
  const rows = flatten(seed)

  console.log(`Seeding ${rows.length} alias entries (seed version=${seed.version}) ...`)

  // 한 방에 upsert. 시드가 수천 개 단위가 되면 chunking 추가.
  const { data, error } = await supabase
    .from('news_alias_dictionary')
    .upsert(rows, { onConflict: 'id' })
    .select('id')

  if (error) {
    console.error('Upsert failed:', error)
    process.exit(1)
  }

  // 카테고리별 집계
  const counts = rows.reduce((acc, r) => {
    acc[r.category] = (acc[r.category] || 0) + 1
    return acc
  }, {})

  console.log(`Done. Upserted ${data?.length ?? 0} rows.`)
  for (const [cat, n] of Object.entries(counts)) {
    console.log(`  ${cat.padEnd(11)}: ${n}`)
  }

  // 확인용 카운트
  const { count, error: countError } = await supabase
    .from('news_alias_dictionary')
    .select('*', { count: 'exact', head: true })

  if (!countError) {
    console.log(`\nnews_alias_dictionary 전체 row 수: ${count}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

// data/agents/scripts/agg-write-run.js
//
// 커뮤니티 애그리게이터 3단계: LLM 재작성 + 페르소나 배정 (T1)
// fetched → drafted | rejected
//
// 원제목/발췌를 재료로 어그로 제목 + 페르소나 말투 소개문을 생성.
// 정치/사건사고/민감 연예 이슈는 여기서 2차 컷 (scout 키워드 필터가 놓친 것).
//
// 사용:
//   node data/agents/scripts/agg-write-run.js
//   node data/agents/scripts/agg-write-run.js --dry-run --limit=3

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import supabase from '../../crawlers/core/db.js'
import { chatWithRetry } from '../../crawlers/core/openai-client.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONFIG = JSON.parse(readFileSync(join(__dirname, '..', 'config', 'aggregator.json'), 'utf8'))
const PROMPT = readFileSync(join(__dirname, '..', 'prompts', 'agg-rewriter.md'), 'utf8')
const TIERS = JSON.parse(readFileSync(join(__dirname, '..', 'config', 'model-tiers.json'), 'utf8'))

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const limitArg = args.find((a) => a.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 10

const MODEL = TIERS.tiers.T1.default.id
const PERSONA_IDS = new Set(CONFIG.personas.map((p) => p.userId))
const FALLBACK_PERSONA = 'user_persona_meme'

function log(msg) {
  process.stdout.write(`[${new Date().toISOString()}] [agg-write] ${msg}\n`)
}

async function main() {
  log(`model=${MODEL} dry=${dryRun} limit=${limit}`)

  const { data: items, error } = await supabase
    .from('agg_reservoir')
    .select('id, source_title, category, body_excerpt, media, audit')
    .eq('status', 'fetched')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    log(`fetch error: ${error.message}`)
    process.exit(1)
  }
  log(`대상 ${items.length}건`)

  const personas = CONFIG.personas.map((p) => ({
    user_id: p.userId,
    nickname: p.nickname,
    tone: p.tone,
    topics: p.topics,
  }))

  let drafted = 0
  let rejected = 0
  for (const item of items) {
    const input = {
      source_title: item.source_title,
      category: item.category,
      excerpt: (item.body_excerpt || '').slice(0, 400),
      media_types: [...new Set((item.media || []).map((m) => m.type))],
      personas,
    }

    let out
    try {
      const response = await chatWithRetry({
        model: MODEL,
        messages: [
          { role: 'system', content: PROMPT },
          { role: 'user', content: JSON.stringify(input) },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 300,
      })
      out = JSON.parse(response.choices[0].message.content)
    } catch (e) {
      log(`  [ERR] LLM: ${e.message} — ${item.source_title.slice(0, 30)}`)
      continue
    }

    const pass = out.decision === 'pass' && out.title && out.intro
    const personaId = PERSONA_IDS.has(out.persona_user_id) ? out.persona_user_id : FALLBACK_PERSONA

    if (dryRun) {
      log(
        pass
          ? `  [DRAFT] (${personaId}) ${out.title} — ${out.intro}`
          : `  [REJECT] ${item.source_title.slice(0, 30)} (${out.reject_reason})`
      )
      continue
    }

    const audit = [
      ...(item.audit || []),
      { at: new Date().toISOString(), stage: 'write', model: MODEL, decision: out.decision },
    ]

    const { error: upErr } = await supabase
      .from('agg_reservoir')
      .update(
        pass
          ? {
              status: 'drafted',
              rewritten: { title: out.title, intro: out.intro, persona_user_id: personaId },
              audit,
            }
          : {
              status: 'rejected',
              reject_reason: `llm: ${out.reject_reason || 'no_output'}`.slice(0, 200),
              audit,
            }
      )
      .eq('id', item.id)
    if (upErr) {
      log(`  [ERR] update: ${upErr.message}`)
      continue
    }
    if (pass) {
      drafted++
      log(`  [DRAFT] (${personaId}) ${out.title}`)
    } else {
      rejected++
      log(`  [REJECT] ${item.source_title.slice(0, 30)} (${out.reject_reason})`)
    }
  }
  log(`drafted ${drafted} / rejected ${rejected} — 검수 대기는 Supabase agg_reservoir status='drafted'`)
}

main().catch((e) => {
  log(`FATAL: ${e.message}`)
  process.exit(1)
})

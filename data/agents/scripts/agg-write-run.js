// data/agents/scripts/agg-write-run.js
//
// 커뮤니티 애그리게이터 3단계: LLM 재작성 (T1) — 라이브 발행용.
// fetched → drafted | rejected
//
// 학습 하니스(agg-train)와 동일한 코어(core/agg-gen.js)를 사용한다:
// 페르소나 사전배정 + 구조 룰렛 + 캐릭터 시트 + 교정 few-shot 주입.
// 즉 agg-train 으로 학습시킨 결과가 그대로 이 발행 품질이 된다.
//
// 사용:
//   node data/agents/scripts/agg-write-run.js
//   node data/agents/scripts/agg-write-run.js --dry-run --limit=3

import supabase from '../../crawlers/core/db.js'
import { chatWithRetry } from '../../crawlers/core/openai-client.js'
import {
  WRITE_MODEL,
  loadCorrections,
  buildSystemPrompt,
  pickPersona,
  pickStructure,
  generatePost,
} from '../core/agg-gen.js'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const limitArg = args.find((a) => a.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 10

function log(msg) {
  process.stdout.write(`[${new Date().toISOString()}] [agg-write] ${msg}\n`)
}

async function main() {
  const corrections = loadCorrections()
  const systemPrompt = buildSystemPrompt(corrections)
  log(`model=${WRITE_MODEL} dry=${dryRun} limit=${limit} 교정주입=${corrections.pairs.length}`)

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

  let drafted = 0
  let rejected = 0
  for (const item of items) {
    const persona = pickPersona(item)
    const structure = pickStructure(item)
    const personaId = persona.userId

    let out
    try {
      out = await generatePost({ item, persona, structure, systemPrompt, chatWithRetry })
    } catch (e) {
      log(`  [ERR] LLM: ${e.message} — ${item.source_title.slice(0, 30)}`)
      continue
    }

    const paragraphs = out.paragraphs
    const pass = out.decision === 'pass' && out.title && paragraphs.length > 0

    if (dryRun) {
      log(
        pass
          ? `  [DRAFT] (${persona.nickname}/${structure}) ${out.title} — ${paragraphs.length}문단`
          : `  [REJECT] ${item.source_title.slice(0, 30)} (${out.reject_reason})`
      )
      continue
    }

    const audit = [
      ...(item.audit || []),
      {
        at: new Date().toISOString(),
        stage: 'write',
        model: WRITE_MODEL,
        decision: out.decision,
        persona: personaId,
        structure,
      },
    ]

    const { error: upErr } = await supabase
      .from('agg_reservoir')
      .update(
        pass
          ? {
              status: 'drafted',
              rewritten: { title: out.title, paragraphs, persona_user_id: personaId },
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

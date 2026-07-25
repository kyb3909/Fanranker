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
  CONFIG,
  WRITE_MODEL,
  loadCorrectionsLive,
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

const DRAFTED_BACKPRESSURE = 50 // 검수 대기가 이만큼 쌓이면 write 스킵 (검수 없이 LLM 비용만 쌓이는 것 방지)

async function main() {
  // 검수 페이지의 교정/반려가 learn 없이 바로 반영되도록 DB 라이브 로드
  const corrections = await loadCorrectionsLive(supabase)
  const systemPrompt = buildSystemPrompt(corrections)
  log(
    `model=${WRITE_MODEL} dry=${dryRun} limit=${limit} 교정주입=${corrections.pairs.length}·반려 ${(corrections.rejects || []).length}`
  )

  const { count: draftedPending } = await supabase
    .from('agg_reservoir')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'drafted')
  if ((draftedPending ?? 0) >= DRAFTED_BACKPRESSURE) {
    log(`검수 대기 ${draftedPending}건 ≥ ${DRAFTED_BACKPRESSURE} — write 스킵 (백프레셔)`)
    return
  }

  const { data: items, error } = await supabase
    .from('agg_reservoir')
    .select('id, source, source_title, category, body_excerpt, media, audit')
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
    // 소스에 personaPool 이 지정돼 있으면 (여돌 소스 → 여돌 페르소나) 풀에서 뽑고, 아니면 토픽 매칭
    const pool = CONFIG.sources[item.source]?.personaPool
    const persona = pool?.length
      ? CONFIG.personas.find(
          (p) => p.userId === pool[Math.floor(Math.random() * pool.length)]
        ) || pickPersona(item)
      : pickPersona(item)
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

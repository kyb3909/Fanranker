// data/agents/scripts/filter-credibility-run.js
//
// Phase A: Credibility Filter runner
//
// - news_reservoir에서 status='ingested' 아이템을 배치로 가져와
//   OpenAI(T1, gpt-4.1-mini)로 credibility/newsworthiness 평가
// - verdict에 따라 status를 credibility_passed / credibility_rejected로 전이
// - audit 로그에 모델/토큰/근거 기록
//
// 사용:
//   node data/agents/scripts/filter-credibility-run.js
//   node data/agents/scripts/filter-credibility-run.js --dry-run
//   node data/agents/scripts/filter-credibility-run.js --limit 5
//
// 의존성: data/crawlers/node_modules/openai 재사용 (트랜지티브 해석)

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import supabase from '../../crawlers/core/db.js'
import openai from '../../crawlers/core/openai-client.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROMPT_PATH = join(__dirname, '..', 'prompts', 'credibility-filter.md')
const TIERS_PATH = join(__dirname, '..', 'config', 'model-tiers.json')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const limitIdx = args.indexOf('--limit')
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : null

function log(msg) {
  const ts = new Date().toISOString()
  process.stdout.write(`[${ts}] [credibility] ${msg}\n`)
}

async function main() {
  const prompt = readFileSync(PROMPT_PATH, 'utf8')
  const tiers = JSON.parse(readFileSync(TIERS_PATH, 'utf8'))
  const cfg = tiers.agentMapping.credibility_filter
  const modelId = tiers.tiers[cfg.tier].default.id
  const batchSize = cfg.batchSize ?? 15

  log(`model=${modelId} tier=${cfg.tier} batchSize=${batchSize} dry=${dryRun}`)

  // Fetch ingested items (+ audit & scores for in-place append)
  let query = supabase
    .from('news_reservoir')
    .select('id, source, urls, raw, audit, scores')
    .eq('status', 'ingested')
    .order('created_at', { ascending: true })

  if (limit) query = query.limit(limit)

  const { data: items, error } = await query
  if (error) {
    log(`Fetch error: ${error.message}`)
    process.exit(1)
  }

  log(`Fetched ${items.length} ingested items`)

  if (items.length === 0) {
    log('Nothing to process')
    return
  }

  const totals = {
    processed: 0,
    passed: 0,
    rejected: 0,
    errors: 0,
    tokens_in: 0,
    tokens_out: 0,
  }

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchNum = Math.floor(i / batchSize) + 1
    log(`Batch ${batchNum}: ${batch.length} items`)

    const input = {
      items: batch.map((r) => ({
        id: r.id,
        title: r.raw.title,
        excerpt: (r.raw.excerpt || '').slice(0, 400),
        domain: r.source.domain || null,
        flair: r.source.flair || null,
        score: r.source.score ?? 0,
        upvoteRatio: r.source.upvoteRatio ?? null,
      })),
    }

    let response
    try {
      response = await openai.chat.completions.create({
        model: modelId,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: JSON.stringify(input) },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      })
    } catch (e) {
      log(`  OpenAI error: ${e.message}`)
      totals.errors += batch.length
      continue
    }

    totals.tokens_in += response.usage?.prompt_tokens ?? 0
    totals.tokens_out += response.usage?.completion_tokens ?? 0

    let parsed
    try {
      parsed = JSON.parse(response.choices[0].message.content)
    } catch (e) {
      log(`  JSON parse error: ${e.message}`)
      totals.errors += batch.length
      continue
    }

    const results = parsed.results || []
    const resultMap = new Map(results.map((r) => [r.id, r]))

    for (const item of batch) {
      const result = resultMap.get(item.id)
      if (!result) {
        log(`  [MISS] no result for ${item.id}`)
        totals.errors++
        continue
      }

      const verdict = result.verdict
      const cred = Number(result.credibility ?? 0)
      const news = Number(result.newsworthiness ?? 0)
      const reason = result.reason || ''

      const newStatus =
        verdict === 'pass' ? 'credibility_passed' : 'credibility_rejected'
      const tag = verdict === 'pass' ? 'PASS  ' : 'REJECT'

      log(
        `  ${tag} c=${cred.toFixed(2)} n=${news.toFixed(2)} — ${item.raw.title.slice(0, 70)}`
      )

      if (verdict === 'pass') totals.passed++
      else totals.rejected++

      if (dryRun) continue

      const now = new Date().toISOString()
      const newAudit = [
        ...(item.audit || []),
        {
          at: now,
          agent: 'credibility_filter',
          action: 'score',
          status_from: 'ingested',
          status_to: newStatus,
          model: modelId,
          tier: 'T1',
          tokens_in_batch: Math.round((response.usage?.prompt_tokens ?? 0) / batch.length),
          tokens_out_batch: Math.round((response.usage?.completion_tokens ?? 0) / batch.length),
          verdict,
          message: reason,
        },
      ]

      const newScores = {
        ...(item.scores || {}),
        credibility: cred,
        newsworthiness: news,
      }

      const { error: updErr } = await supabase
        .from('news_reservoir')
        .update({ status: newStatus, scores: newScores, audit: newAudit })
        .eq('id', item.id)

      if (updErr) {
        log(`  [ERR] update ${item.id}: ${updErr.message}`)
        totals.errors++
        continue
      }

      totals.processed++
    }
  }

  log('--- totals ---')
  for (const [k, v] of Object.entries(totals)) {
    log(`  ${k.padEnd(14)}: ${v}`)
  }

  // Rough cost estimate for gpt-4.1-mini: $0.40/1M input, $1.60/1M output
  const costIn = (totals.tokens_in * 0.40) / 1_000_000
  const costOut = (totals.tokens_out * 1.60) / 1_000_000
  log(`  est cost USD  : $${(costIn + costOut).toFixed(5)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

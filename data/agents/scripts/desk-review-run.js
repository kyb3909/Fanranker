// data/agents/scripts/desk-review-run.js
//
// Phase A Desk Reviewer (T2 LLM, gpt-4.1)
// dedupe_checked → desk_approved / desk_rejected / desk_held / desk_merge
//
// 사용:
//   node data/agents/scripts/desk-review-run.js
//   node data/agents/scripts/desk-review-run.js --dry-run

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import supabase from '../../crawlers/core/db.js'
import openai from '../../crawlers/core/openai-client.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROMPT_PATH = join(__dirname, '..', 'prompts', 'desk-reviewer.md')
const TIERS_PATH = join(__dirname, '..', 'config', 'model-tiers.json')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

function log(msg) {
  process.stdout.write(`[${new Date().toISOString()}] [desk] ${msg}\n`)
}

const STATUS_FROM_DECISION = {
  approve: 'desk_approved',
  reject: 'desk_rejected',
  hold: 'desk_held',
  merge: 'desk_merge',
  request_rewrite: 'normalized', // 재진입 (Phase A는 재진입 카운터 미구현)
  reassign: 'desk_held', // Phase A 단일 writer라 hold로 보냄
}

async function main() {
  const prompt = readFileSync(PROMPT_PATH, 'utf8')
  const tiers = JSON.parse(readFileSync(TIERS_PATH, 'utf8'))
  const cfg = tiers.agentMapping.desk_reviewer
  const modelId = tiers.tiers[cfg.tier].default.id
  const maxOutputTokens = cfg.maxOutputTokens || 300

  log(`model=${modelId} tier=${cfg.tier} dry=${dryRun}`)

  const { data: items, error } = await supabase
    .from('news_reservoir')
    .select('id, source, raw, normalized, entities, unresolved, tags, issue_type, scores, audit')
    .eq('status', 'dedupe_checked')
    .order('created_at', { ascending: true })

  if (error) {
    log(`fetch error: ${error.message}`)
    process.exit(1)
  }

  log(`fetched ${items.length} dedupe_checked items`)
  if (items.length === 0) return

  const totals = {
    processed: 0,
    approve: 0,
    reject: 0,
    hold: 0,
    merge: 0,
    request_rewrite: 0,
    reassign: 0,
    errors: 0,
    tokens_in: 0,
    tokens_out: 0,
  }

  for (const item of items) {
    const input = {
      id: item.id,
      raw: {
        title: item.normalized?.title || item.raw.title,
        excerpt: item.normalized?.excerpt || item.raw.excerpt,
        lang: item.raw.lang || 'en',
      },
      source: {
        subreddit: item.source?.subreddit,
        domain: item.source?.domain,
      },
      scores: {
        credibility: item.scores?.credibility ?? 0,
        newsworthiness: item.scores?.newsworthiness ?? 0,
        namingConfidence: item.scores?.namingConfidence ?? 0,
      },
      tags: item.tags || [],
      issueType: item.issue_type || 'other',
      officialAnnouncement: item.normalized?.officialAnnouncement || false,
      entities: {
        teams: (item.entities?.teams || []).map((t) => t.preferred_ko),
        players: (item.entities?.players || []).map((p) => p.preferred_ko),
        coaches: (item.entities?.coaches || []).map((c) => c.preferred_ko),
        competitions: (item.entities?.competitions || []).map((c) => c.preferred_ko),
      },
      unresolvedNaming: item.unresolved || [],
      dedupeContext: { neighbors: [] },
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
        max_tokens: maxOutputTokens,
      })
    } catch (e) {
      log(`  [ERR] OpenAI: ${e.message}`)
      totals.errors++
      continue
    }

    totals.tokens_in += response.usage?.prompt_tokens ?? 0
    totals.tokens_out += response.usage?.completion_tokens ?? 0

    let parsed
    try {
      parsed = JSON.parse(response.choices[0].message.content)
    } catch (e) {
      log(`  [ERR] JSON parse: ${e.message}`)
      totals.errors++
      continue
    }

    const decision = parsed.decision
    const reason = parsed.reason || ''
    const flags = parsed.flags || { unverified: false, needsManualNaming: false, sensitive: false }

    const newStatus = STATUS_FROM_DECISION[decision] || 'desk_held'
    totals[decision] = (totals[decision] || 0) + 1

    log(`  ${decision.toUpperCase().padEnd(16)} — ${(item.normalized?.title || item.raw.title).slice(0, 70)}`)
    log(`     reason: ${reason}`)

    if (dryRun) continue

    const deskDecision = {
      decision,
      reason,
      flags,
      mergeTargetId: parsed.mergeTargetId || null,
      rewriteHint: parsed.rewriteHint || null,
      decidedAt: new Date().toISOString(),
    }

    const newAudit = [
      ...(item.audit || []),
      {
        at: new Date().toISOString(),
        agent: 'desk_reviewer',
        action: 'review',
        status_from: 'dedupe_checked',
        status_to: newStatus,
        model: modelId,
        tier: 'T2',
        verdict: decision,
        message: reason,
      },
    ]

    const { error: updErr } = await supabase
      .from('news_reservoir')
      .update({ status: newStatus, decision: deskDecision, audit: newAudit })
      .eq('id', item.id)

    if (updErr) {
      log(`  [ERR] update: ${updErr.message}`)
      totals.errors++
      continue
    }
    totals.processed++
  }

  log('--- totals ---')
  for (const [k, v] of Object.entries(totals)) log(`  ${k.padEnd(16)}: ${v}`)

  // gpt-4.1: $2/1M in, $8/1M out
  const cost = (totals.tokens_in * 2 + totals.tokens_out * 8) / 1_000_000
  log(`  est cost USD    : $${cost.toFixed(5)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

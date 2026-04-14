// data/agents/scripts/seo-format-run.js
//
// Phase B SEO Formatter (T1 LLM, gpt-4.1-mini)
// drafted → formatted
//
// Writer의 초안(headline + body)을 커뮤니티 게시판용으로 포맷한다.
// - 목록 제목 다듬기 (title)
// - 카드 미리보기 리드 (lead)
// - 본문 단락 분할 (paragraphs)
// - 게시판별 말머리(flair) AI 자동 선택 (post_flairs 테이블 동적 조회)
//
// 사용:
//   node data/agents/scripts/seo-format-run.js
//   node data/agents/scripts/seo-format-run.js --dry-run

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import supabase from '../../crawlers/core/db.js'
import { chatWithRetry } from '../../crawlers/core/openai-client.js'
import { validateFormatterResult } from '../core/validators.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROMPT_PATH = join(__dirname, '..', 'prompts', 'seo-formatter.md')
const TIERS_PATH = join(__dirname, '..', 'config', 'model-tiers.json')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

function log(msg) {
  process.stdout.write(`[${new Date().toISOString()}] [formatter] ${msg}\n`)
}

// community_slug는 scout가 config 기반으로 item.source.community_slug에 이미 저장함.
// 혹시 legacy 항목이면 subreddit 이름으로 fallback 매핑.
function resolveCommunitySlug(item) {
  if (item.source?.community_slug) return item.source.community_slug
  const sub = (item.source?.subreddit || '').toLowerCase()
  const fallback = {
    soccer: 'football',
    premierleague: 'football',
    laliga: 'football',
    bundesliga: 'football',
    seriea: 'football',
    ligue1: 'football',
    gunners: 'football',
    liverpoolfc: 'football',
    reddevils: 'football',
    chelseafc: 'football',
    mcfc: 'football',
    realmadrid: 'football',
    barca: 'football',
    fcbayern: 'football',
    nba: 'basketball',
    lakers: 'basketball',
    bostonceltics: 'basketball',
    warriors: 'basketball',
    denvernuggets: 'basketball',
    mavericks: 'basketball',
    baseball: 'baseball',
    padres: 'baseball',
    sfgiants: 'baseball',
    dodgers: 'baseball',
    nyyankees: 'baseball',
    redsox: 'baseball',
  }
  return fallback[sub] || null
}

// 게시판별 flair 목록 캐시 (cycle 1회 실행에서 재사용)
const flairCache = new Map()

async function loadFlairs(communitySlug) {
  if (flairCache.has(communitySlug)) return flairCache.get(communitySlug)
  const { data, error } = await supabase
    .from('post_flairs')
    .select('id, name')
    .eq('community_slug', communitySlug)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (error) {
    log(`  [WARN] flair fetch failed for ${communitySlug}: ${error.message}`)
    flairCache.set(communitySlug, [])
    return []
  }
  flairCache.set(communitySlug, data || [])
  return data || []
}

async function main() {
  const prompt = readFileSync(PROMPT_PATH, 'utf8')
  const tiers = JSON.parse(readFileSync(TIERS_PATH, 'utf8'))
  const cfg = tiers.agentMapping.seo_formatter
  const modelId = tiers.tiers[cfg.tier].default.id
  const maxOutputTokens = cfg.maxOutputTokens || 1200

  log(`model=${modelId} tier=${cfg.tier} dry=${dryRun}`)

  const { data: items, error } = await supabase
    .from('news_reservoir')
    .select('id, source, raw, normalized, entities, tags, issue_type, draft, audit')
    .eq('status', 'drafted')
    .order('created_at', { ascending: true })

  if (error) {
    log(`fetch error: ${error.message}`)
    process.exit(1)
  }

  log(`fetched ${items.length} drafted items`)
  if (items.length === 0) return

  const totals = {
    processed: 0,
    formatted: 0,
    rejected_validation: 0,
    no_slug: 0,
    errors: 0,
    tokens_in: 0,
    tokens_out: 0,
  }

  for (const item of items) {
    const communitySlug = resolveCommunitySlug(item)
    if (!communitySlug) {
      log(`  [SKIP] no community_slug mapping for subreddit=${item.source?.subreddit}`)
      totals.no_slug++
      continue
    }

    const flairs = await loadFlairs(communitySlug)
    const allowedFlairIds = flairs.map((f) => f.id)

    const input = {
      id: item.id,
      communitySlug,
      draft: {
        headline: item.draft?.headline || '',
        body: item.draft?.body || '',
      },
      entities: {
        teams: (item.entities?.teams || []).map((t) => ({ preferred_ko: t.preferred_ko })),
        players: (item.entities?.players || []).map((p) => ({ preferred_ko: p.preferred_ko })),
        competitions: (item.entities?.competitions || []).map((c) => ({ preferred_ko: c.preferred_ko })),
      },
      tags: item.tags || [],
      issueType: item.issue_type || 'other',
      flairs: flairs.map((f) => ({ id: f.id, name: f.name })),
    }

    let response
    try {
      response = await chatWithRetry({
        model: modelId,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: JSON.stringify(input) },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
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

    const validation = validateFormatterResult(parsed, allowedFlairIds)
    if (!validation.ok) {
      log(`  [REJECT] ${validation.reason} — ${(item.draft?.headline || '').slice(0, 60)}`)
      totals.rejected_validation++

      if (!dryRun) {
        const newAudit = [
          ...(item.audit || []),
          {
            at: new Date().toISOString(),
            agent: 'seo_formatter',
            action: 'format',
            status_from: 'drafted',
            status_to: 'drafted',
            model: modelId,
            tier: cfg.tier,
            verdict: 'rejected',
            message: validation.reason,
          },
        ]
        await supabase.from('news_reservoir').update({ audit: newAudit }).eq('id', item.id)
      }
      continue
    }

    const flairName = flairs.find((f) => f.id === parsed.flairId)?.name || 'null'
    log(`  FORMAT — [${flairName}] ${parsed.title}`)

    if (dryRun) {
      totals.formatted++
      continue
    }

    const publish = {
      communitySlug,
      title: parsed.title,
      lead: parsed.lead,
      paragraphs: parsed.paragraphs,
      flairId: parsed.flairId || null,
      flairReason: parsed.flairReason || '',
    }

    const newAudit = [
      ...(item.audit || []),
      {
        at: new Date().toISOString(),
        agent: 'seo_formatter',
        action: 'format',
        status_from: 'drafted',
        status_to: 'formatted',
        model: modelId,
        tier: cfg.tier,
        verdict: 'success',
        message: `flair=${flairName} paragraphs=${parsed.paragraphs.length}`,
      },
    ]

    const { error: updErr } = await supabase
      .from('news_reservoir')
      .update({ status: 'formatted', publish, audit: newAudit })
      .eq('id', item.id)

    if (updErr) {
      log(`  [ERR] update: ${updErr.message}`)
      totals.errors++
      continue
    }

    totals.processed++
    totals.formatted++
  }

  log('--- totals ---')
  for (const [k, v] of Object.entries(totals)) log(`  ${k.padEnd(20)}: ${v}`)

  // gpt-4.1-mini: $0.4/1M in, $1.6/1M out
  const cost = (totals.tokens_in * 0.4 + totals.tokens_out * 1.6) / 1_000_000
  log(`  est cost USD        : $${cost.toFixed(5)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

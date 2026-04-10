// data/agents/scripts/enrich-run.js
//
// Phase A Enrichment (T0 rule-based)
// normalized → enriched
//
// 결합 단계: tagging + naming resolver + link collector
// - Naming: alias dictionary 룩업 (LLM 미사용 — Phase A 단순화)
// - Tagging: 키워드 기반 issue type + 한글 태그 부여
// - Links: scout 단계에서 이미 source.urls.socials에 있음 (no-op)
//
// 명시적 deviation: korean-naming-resolver.md prompt는 LLM 호출용으로 두되,
// Phase A test에서는 결정론 lookup이 LLM과 동일한 결과를 내므로 비용 절약.
// dictionary 미스가 누적되면 Phase B에서 LLM resolver로 복귀.

import supabase from '../../crawlers/core/db.js'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

function log(msg) {
  process.stdout.write(`[${new Date().toISOString()}] [enrich] ${msg}\n`)
}

const ISSUE_TAG_KO = {
  transfer: '이적설',
  injury: '부상',
  contract: '계약갱신',
  official: '오피셜',
  interview: '인터뷰',
  discipline: '징계',
  match: '경기',
  club_ops: '클럽운영',
  other: '기타',
}

function tagIssueType(text) {
  const lower = text.toLowerCase()
  if (/\bofficial\b|^we can confirm|\bannounces?\b|\bconfirms?\b|\bextends?\b.*contract/i.test(lower)) return 'official'
  if (/\binjur|setback|out for|sideline|fitness doubt/i.test(lower)) return 'injury'
  if (/\bsuspen|red card|charged with|sanction|\bban\b/i.test(lower)) return 'discipline'
  if (/contract|extension|renew|new deal/i.test(lower)) return 'contract'
  if (/interview|tells?|told|comments?|said|reflects on|speaks/i.test(lower)) return 'interview'
  if (/leaving|will leave|leave\s/i.test(lower)) return 'transfer'
  if (/\bjoin|\bsigning|\bsigned|move to|move from|transfer|bid|deal for|target|interest/i.test(lower)) return 'transfer'
  if (/\d+-\d+|goal|scored|win|loss|draw|defeat|beats?\s/i.test(lower)) return 'match'
  return 'other'
}

async function loadDict() {
  const { data, error } = await supabase
    .from('news_alias_dictionary')
    .select('id, category, preferred_ko, surfaces, confidence')
  if (error) throw new Error(error.message)
  return data || []
}

function buildLookup(dict) {
  const lookup = new Map()
  for (const entry of dict) {
    for (const s of entry.surfaces) {
      lookup.set(s.toLowerCase(), entry)
    }
  }
  return lookup
}

function resolveEntities(candidates, lookup) {
  const cats = ['teams', 'players', 'coaches', 'competitions']
  const resolved = { teams: [], players: [], coaches: [], competitions: [] }
  const unresolved = []
  const catSingular = { teams: 'team', players: 'player', coaches: 'coach', competitions: 'competition' }

  for (const cat of cats) {
    for (const surface of candidates[cat] || []) {
      const entry = lookup.get(surface.toLowerCase())
      if (entry) {
        resolved[cat].push({
          id: entry.id,
          surface,
          preferred_ko: entry.preferred_ko,
          confidence: entry.confidence,
          source: 'dictionary',
        })
      } else {
        unresolved.push({
          category: catSingular[cat],
          surface,
          reason: 'dict miss after normalize scan',
          tentative_ko: null,
        })
      }
    }
  }

  const resolvedCount = Object.values(resolved).flat().length
  const unresolvedCount = unresolved.length
  let namingConfidence
  if (resolvedCount === 0 && unresolvedCount === 0) {
    namingConfidence = 0.0 // 엔티티 자체가 없음 — desk가 hold할 신호
  } else if (unresolvedCount === 0) {
    namingConfidence = 1.0
  } else {
    namingConfidence = Math.max(0, 1.0 - 0.2 * unresolvedCount)
  }

  return { resolved, unresolved, namingConfidence }
}

function buildTags(resolved, issueType) {
  const tags = []
  if (ISSUE_TAG_KO[issueType]) tags.push(ISSUE_TAG_KO[issueType])
  for (const t of resolved.teams) if (t.preferred_ko) tags.push(t.preferred_ko)
  for (const c of resolved.competitions) if (c.preferred_ko) tags.push(c.preferred_ko)
  // 중복 제거 + 6개 cap
  return [...new Set(tags)].slice(0, 6)
}

async function main() {
  const dict = await loadDict()
  const lookup = buildLookup(dict)
  log(`loaded ${dict.length} alias entries`)

  const { data: items, error } = await supabase
    .from('news_reservoir')
    .select('id, raw, normalized, scores, audit')
    .eq('status', 'normalized')
    .order('created_at', { ascending: true })

  if (error) {
    log(`fetch error: ${error.message}`)
    process.exit(1)
  }

  log(`fetched ${items.length} normalized items`)
  if (items.length === 0) return

  const totals = { processed: 0, errors: 0, fully_resolved: 0, partial: 0, no_entities: 0 }

  for (const item of items) {
    const candidates = item.normalized?.candidateEntities || {
      teams: [], players: [], coaches: [], competitions: [],
    }
    const { resolved, unresolved, namingConfidence } = resolveEntities(candidates, lookup)
    const totalEntities = Object.values(resolved).flat().length

    const text = `${item.normalized?.title || item.raw.title} ${item.normalized?.excerpt || item.raw.excerpt || ''}`
    const issueType = tagIssueType(text)
    const tags = buildTags(resolved, issueType)

    if (totalEntities === 0) totals.no_entities++
    else if (unresolved.length > 0) totals.partial++
    else totals.fully_resolved++

    log(
      `  ent=${totalEntities} unr=${unresolved.length} nc=${namingConfidence.toFixed(2)} ` +
        `issue=${issueType} tags=[${tags.join(',')}] — ${(item.normalized?.title || item.raw.title).slice(0, 60)}`
    )

    if (dryRun) {
      totals.processed++
      continue
    }

    const newScores = {
      ...(item.scores || {}),
      namingConfidence,
    }
    const newAudit = [
      ...(item.audit || []),
      {
        at: new Date().toISOString(),
        agent: 'enrichment',
        action: 'enrich',
        status_from: 'normalized',
        status_to: 'enriched',
        tier: 'T0',
        message: `entities=${totalEntities} unresolved=${unresolved.length} issue=${issueType}`,
      },
    ]

    const { error: updErr } = await supabase
      .from('news_reservoir')
      .update({
        status: 'enriched',
        entities: resolved,
        unresolved,
        tags,
        issue_type: issueType,
        scores: newScores,
        audit: newAudit,
      })
      .eq('id', item.id)

    if (updErr) {
      log(`  [ERR] ${updErr.message}`)
      totals.errors++
      continue
    }
    totals.processed++
  }

  log('--- totals ---')
  for (const [k, v] of Object.entries(totals)) log(`  ${k.padEnd(16)}: ${v}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

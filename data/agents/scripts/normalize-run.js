// data/agents/scripts/normalize-run.js
//
// Phase A Normalizer (T0 rule-based)
// credibility_passed → normalized
//
// - 제목 prefix ([Tier 1], [Sami Mokbel], [BREAKING]) 정리
// - alias dictionary 표면 스캔으로 candidate entities 추출
// - officialAnnouncement 플래그 (도메인/패턴 기반)
//
// Phase A 단순화: LLM 없이 결정론으로 처리. 영어 NER 필요한 영역은
// alias dictionary 미스로 처리되어 desk hold로 빠짐 (의도된 동작).

import supabase from '../../crawlers/core/db.js'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

function log(msg) {
  process.stdout.write(`[${new Date().toISOString()}] [normalize] ${msg}\n`)
}

const OFFICIAL_CLUB_DOMAINS = [
  'liverpoolfc.com', 'arsenal.com', 'manutd.com', 'mancity.com',
  'chelseafc.com', 'tottenhamhotspur.com', 'newcastleunited.com',
  'realmadrid.com', 'fcbarcelona.com', 'atleticodemadrid.com',
  'fcbayern.com', 'bvb.de', 'bayer04.de',
  'inter.it', 'acmilan.com', 'juventus.com', 'sscnapoli.it',
  'psg.fr', 'om.fr',
]
const OFFICIAL_ORG_DOMAINS = ['uefa.com', 'fifa.com', 'premierleague.com', 'laliga.com', 'bundesliga.com']

function cleanTitle(t) {
  if (!t) return ''
  // Strip leading [...] prefixes (one or more)
  let cleaned = t
  while (/^\[[^\]]+\]\s*/.test(cleaned)) {
    cleaned = cleaned.replace(/^\[[^\]]+\]\s*/, '')
  }
  return cleaned.trim()
}

function detectOfficial(item) {
  const title = item.raw?.title || ''
  const excerpt = item.raw?.excerpt || ''
  const domain = (item.source?.domain || '').toLowerCase()

  if (/\[official\]/i.test(title)) return true
  if (/^official:?\s/i.test(title)) return true
  if (/^we can confirm/i.test(excerpt)) return true
  if (/\bannounces?\b|\bconfirms?\b/i.test(title) && /club|today|sign|join|extend/i.test(title)) return true

  if (OFFICIAL_CLUB_DOMAINS.some((d) => domain === d || domain.endsWith('.' + d))) return true
  if (OFFICIAL_ORG_DOMAINS.some((d) => domain === d || domain.endsWith('.' + d))) return true

  return false
}

async function loadDict() {
  const { data, error } = await supabase
    .from('news_alias_dictionary')
    .select('id, category, preferred_ko, surfaces, confidence')
  if (error) throw new Error(error.message)
  return data || []
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findCandidates(text, dict) {
  const lower = text.toLowerCase()
  const found = { teams: [], players: [], coaches: [], competitions: [] }
  const catMap = { player: 'players', team: 'teams', coach: 'coaches', competition: 'competitions' }

  for (const entry of dict) {
    for (const surface of entry.surfaces) {
      // Word-boundary match around the surface (allows hyphens, periods, etc as boundaries)
      const re = new RegExp(`(?:^|[^a-z0-9])${escapeRegex(surface)}(?:[^a-z0-9]|$)`, 'i')
      if (re.test(lower)) {
        const arr = found[catMap[entry.category]]
        if (!arr.some((c) => c.id === entry.id)) {
          arr.push({ id: entry.id, surface })
        }
        break
      }
    }
  }
  return found
}

async function main() {
  const dict = await loadDict()
  log(`loaded ${dict.length} alias entries`)

  const { data: items, error } = await supabase
    .from('news_reservoir')
    .select('id, source, raw, audit')
    .eq('status', 'credibility_passed')
    .order('created_at', { ascending: true })

  if (error) {
    log(`fetch error: ${error.message}`)
    process.exit(1)
  }

  log(`fetched ${items.length} credibility_passed items`)
  if (items.length === 0) return

  const totals = { processed: 0, errors: 0, with_candidates: 0, official: 0 }

  for (const item of items) {
    const cleaned = cleanTitle(item.raw.title)
    const text = `${cleaned} ${item.raw.excerpt || ''}`
    const candidates = findCandidates(text, dict)
    const candidateCount = Object.values(candidates).reduce((a, b) => a + b.length, 0)
    if (candidateCount > 0) totals.with_candidates++

    const officialAnnouncement = detectOfficial(item)
    if (officialAnnouncement) totals.official++

    const normalized = {
      title: cleaned,
      excerpt: (item.raw.excerpt || cleaned).slice(0, 350),
      candidateEntities: {
        teams: candidates.teams.map((c) => c.surface),
        players: candidates.players.map((c) => c.surface),
        coaches: candidates.coaches.map((c) => c.surface),
        competitions: candidates.competitions.map((c) => c.surface),
      },
      officialAnnouncement,
    }

    const tag = officialAnnouncement ? 'OFFICIAL' : '        '
    log(`  ${tag} c=${candidateCount} — ${cleaned.slice(0, 70)}`)

    if (dryRun) {
      totals.processed++
      continue
    }

    const newAudit = [
      ...(item.audit || []),
      {
        at: new Date().toISOString(),
        agent: 'news_normalizer',
        action: 'normalize',
        status_from: 'credibility_passed',
        status_to: 'normalized',
        tier: 'T0',
        message: `candidates=${candidateCount} official=${officialAnnouncement}`,
      },
    ]

    const { error: updErr } = await supabase
      .from('news_reservoir')
      .update({ status: 'normalized', normalized, audit: newAudit })
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

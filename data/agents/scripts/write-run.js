// data/agents/scripts/write-run.js
//
// Phase A Summary Writer (T3 LLM, gpt-4.1)
// assigned → drafted
//
// 한국어 뉴스 브리프 생성. style-guide.md 룰 강제.
// 출력 후 한글 포함 검증 (포스트체크) — 비한글 출력은 fail.
//
// 사용:
//   node data/agents/scripts/write-run.js
//   node data/agents/scripts/write-run.js --dry-run

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import supabase from '../../crawlers/core/db.js'
import { chatWithRetry } from '../../crawlers/core/openai-client.js'
import { validateWriterResult } from '../core/validators.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROMPT_PATH = join(__dirname, '..', 'prompts', 'summary-writer.md')
const TIERS_PATH = join(__dirname, '..', 'config', 'model-tiers.json')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

const HANGUL = /[가-힣]/

function log(msg) {
  process.stdout.write(`[${new Date().toISOString()}] [writer] ${msg}\n`)
}

// "sports.yahoo.com에 따르면" 같은 도메인 노출 방지 — 통용되는 한글 매체명으로.
// 매핑에 없는 도메인은 그대로 넘긴다 (모델이 아는 매체면 알아서 표기).
const MEDIA_NAME_KO = {
  'theathletic.com': '디 애슬레틱',
  'theguardian.com': '가디언',
  'bbc.com': 'BBC',
  'bbc.co.uk': 'BBC',
  'skysports.com': '스카이 스포츠',
  'sports.yahoo.com': '야후 스포츠',
  'yahoo.com': '야후 스포츠',
  'independent.co.uk': '인디펜던트',
  'telegraph.co.uk': '텔레그래프',
  'nytimes.com': '뉴욕타임스',
  'goal.com': '골닷컴',
  'espn.com': 'ESPN',
  'foxsports.com': '폭스 스포츠',
  'footmercato.net': '풋 메르카토',
  'fabrizio-romano.com': '파브리치오 로마노',
  'caughtoffside.com': '코트오프사이드',
  '90min.com': '90min',
  'givemesport.com': '기브미스포트',
  'lequipe.fr': '레키프',
  'marca.com': '마르카',
  'as.com': 'AS',
  'sport.es': '스포르트',
  'mundodeportivo.com': '문도 데포르티보',
  'fabrizioromano': '파브리치오 로마노',
  'football.london': '풋볼 런던',
  'liverpoolecho.co.uk': '리버풀 에코',
  'manchestereveningnews.co.uk': '맨체스터 이브닝 뉴스',
  'mirror.co.uk': '미러',
  'dailymail.co.uk': '데일리 메일',
  'thesun.co.uk': '더 선',
  'times.co.uk': '더 타임스',
  'thetimes.com': '더 타임스',
}

function mediaNameKo(domain) {
  if (!domain) return 'unknown'
  const d = domain.replace(/^www\./, '').toLowerCase()
  return MEDIA_NAME_KO[d] || d
}

// "오늘의 떡밥"(홈 카드뉴스) 자격 판정 — 장문 재구성은 떡밥행 아이템에만 적용한다
// (운영 결정 2026-07-29: 게시판 목록용 일반 브리프는 3~6문장이면 충분, 카드로 떠서
// 눌러 읽는 글만 원문 기반 상세 기사가 필요).
// 카드 자격 = lib/feed/cardnews.ts 의 이미지 폴백이 성립하는 글:
// youtube 소셜(썸네일 폴백) / image 소셜 / og_image. 인스타·X 임베드만 있는 글과
// 순수 텍스트 글은 카드에서 걸러지므로 여기서도 짧은 브리프로 남긴다.
function isForCardNews(item) {
  const socials = item.urls?.socials || []
  if (socials.some((s) => s?.type === 'youtube' || s?.type === 'image')) return true
  return !!item.urls?.og_image
}

function draftHashOf(headline, body) {
  return createHash('sha1').update(headline + '\n' + body, 'utf8').digest('hex').slice(0, 16)
}

function validateKorean(headline, body) {
  if (!headline || !HANGUL.test(headline)) {
    return { ok: false, reason: 'headline missing Hangul' }
  }
  if (!body || !HANGUL.test(body)) {
    return { ok: false, reason: 'body missing Hangul' }
  }
  // 헤드라인 길이 (관대하게 30자까지 허용 — 25 권장이지만 간혹 넘침)
  if (headline.length > 35) {
    return { ok: false, reason: `headline too long (${headline.length} chars)` }
  }
  // 본문 길이: 100~1300자 허용 (articleBody 있으면 권장 500~1000,
  // title/excerpt 뿐이면 200~500 이 자연스러움 — 팩트 없이 늘리면 환각이다)
  if (body.length < 100 || body.length > 1300) {
    return { ok: false, reason: `body length out of range (${body.length} chars)` }
  }
  return { ok: true }
}

async function main() {
  const prompt = readFileSync(PROMPT_PATH, 'utf8')
  const tiers = JSON.parse(readFileSync(TIERS_PATH, 'utf8'))
  const cfg = tiers.agentMapping.summary_writer
  const modelId = tiers.tiers[cfg.tier].default.id
  const maxOutputTokens = cfg.maxOutputTokens || 1500

  log(`model=${modelId} tier=${cfg.tier} dry=${dryRun}`)

  const { data: items, error } = await supabase
    .from('news_reservoir')
    .select('id, source, urls, raw, normalized, entities, tags, issue_type, scores, decision, audit')
    .eq('status', 'assigned')
    .order('created_at', { ascending: true })

  if (error) {
    log(`fetch error: ${error.message}`)
    process.exit(1)
  }

  log(`fetched ${items.length} assigned items`)
  if (items.length === 0) return

  const totals = {
    processed: 0,
    drafted: 0,
    rejected_korean: 0,
    rejected_validation: 0,
    errors: 0,
    tokens_in: 0,
    tokens_out: 0,
  }

  for (const item of items) {
    const credibility = item.scores?.credibility ?? 0
    const officialAnnouncement = item.normalized?.officialAnnouncement || false
    const unverified =
      !officialAnnouncement && credibility < 0.9 && !(item.decision?.flags?.unverified === false)

    const input = {
      id: item.id,
      issueType: item.issue_type || 'other',
      officialAnnouncement,
      tags: item.tags || [],
      entities: {
        teams: (item.entities?.teams || []).map((t) => ({ preferred_ko: t.preferred_ko })),
        players: (item.entities?.players || []).map((p) => ({
          preferred_ko: p.preferred_ko,
          alt: p.surface,
        })),
        coaches: (item.entities?.coaches || []).map((c) => ({
          preferred_ko: c.preferred_ko,
          alt: c.surface,
        })),
        competitions: (item.entities?.competitions || []).map((c) => ({
          preferred_ko: c.preferred_ko,
        })),
      },
      facts: {
        title: item.normalized?.title || item.raw.title,
        excerpt: item.normalized?.excerpt || item.raw.excerpt || '',
        // 기사 본문 앞부분 (영어 원문) — **오늘의 떡밥(카드뉴스)행 아이템에만** 주입.
        // 카드 자격 없는 글은 articleBody 없이 기존 짧은 브리프(3~6문장)로 나간다.
        articleBody: isForCardNews(item)
          ? (item.raw?.articleText || '').slice(0, 2800) || null
          : null,
        sourceMedia: mediaNameKo(item.source?.domain),
        credibility,
        unverified,
      },
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
        temperature: 0.3,
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

    const headline = parsed.headline || ''
    const body = parsed.body || ''
    const citations = parsed.citations || []
    const unverifiedFlags = parsed.unverifiedFlags || []

    // 한글 + 길이 검증
    const validation = validateKorean(headline, body)
    if (!validation.ok) {
      log(`  [REJECT] ${validation.reason} — ${(item.raw.title || '').slice(0, 60)}`)
      log(`     headline: ${headline}`)
      if (validation.reason.includes('Hangul')) totals.rejected_korean++
      else totals.rejected_validation++

      if (!dryRun) {
        // assigned 상태 그대로 두고 audit만 남김 (재시도 가능)
        const newAudit = [
          ...(item.audit || []),
          {
            at: new Date().toISOString(),
            agent: 'summary_writer',
            action: 'write',
            status_from: 'assigned',
            status_to: 'assigned',
            model: modelId,
            tier: 'T3',
            verdict: 'rejected',
            message: validation.reason,
          },
        ]
        await supabase.from('news_reservoir').update({ audit: newAudit }).eq('id', item.id)
      }
      continue
    }

    log(`  DRAFT — ${headline}`)
    log(`     ${body.slice(0, 100)}${body.length > 100 ? '...' : ''}`)

    if (dryRun) {
      totals.drafted++
      continue
    }

    const draft = {
      headline,
      body,
      citations,
      unverifiedFlags,
      draftHash: draftHashOf(headline, body),
    }

    const newAudit = [
      ...(item.audit || []),
      {
        at: new Date().toISOString(),
        agent: 'summary_writer',
        action: 'write',
        status_from: 'assigned',
        status_to: 'drafted',
        model: modelId,
        tier: 'T3',
        verdict: 'success',
        message: `headline=${headline.length}c body=${body.length}c`,
      },
    ]

    const { error: updErr } = await supabase
      .from('news_reservoir')
      .update({ status: 'drafted', draft, audit: newAudit })
      .eq('id', item.id)

    if (updErr) {
      log(`  [ERR] update: ${updErr.message}`)
      totals.errors++
      continue
    }

    totals.processed++
    totals.drafted++
  }

  log('--- totals ---')
  for (const [k, v] of Object.entries(totals)) log(`  ${k.padEnd(20)}: ${v}`)

  // gpt-4.1: $2/1M in, $8/1M out
  const cost = (totals.tokens_in * 2 + totals.tokens_out * 8) / 1_000_000
  log(`  est cost USD        : $${cost.toFixed(5)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

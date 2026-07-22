// data/agents/scripts/agg-publish-run.js
//
// 커뮤니티 애그리게이터 4단계: 발행 (T0, LLM 없음)
// approved → published
//
// 검수(사람이 Supabase에서 drafted → approved로 전환)된 항목만 발행.
// 페르소나 계정으로 자유게시판에 TipTap 글 insert.
// posts.source_url/source_name 채움 → 상세 페이지 "출처 · 원문 보기" + 삭제 요청 대응.
// 안전장치: 일일 발행 cap + 페르소나별 cap (aggregator.json limits).
//
// 사용:
//   node data/agents/scripts/agg-publish-run.js
//   node data/agents/scripts/agg-publish-run.js --dry-run --limit=3

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import supabase from '../../crawlers/core/db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONFIG = JSON.parse(readFileSync(join(__dirname, '..', 'config', 'aggregator.json'), 'utf8'))

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const limitArg = args.find((a) => a.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null

function log(msg) {
  process.stdout.write(`[${new Date().toISOString()}] [agg-publish] ${msg}\n`)
}

/** 문단 배열 + 미디어 → TipTap doc.
 *  레이아웃: 첫 문단 → 미디어 → 나머지 문단 (팩트 전달형 — 우리 글만 읽어도 내용 전달).
 *  구버전 draft(intro 단일 문장)도 처리. */
function buildTipTapDoc(rewritten, media) {
  const paragraphs = Array.isArray(rewritten.paragraphs)
    ? rewritten.paragraphs
    : rewritten.intro
      ? [rewritten.intro]
      : []
  const para = (text) => ({
    type: 'paragraph',
    content: [{ type: 'text', text: String(text).slice(0, 2000) }],
  })
  const content = []
  if (paragraphs[0]) content.push(para(paragraphs[0]))
  for (const m of media) {
    if (m.type === 'image' && m.rehosted_url) {
      content.push({ type: 'image', attrs: { src: m.rehosted_url } })
    } else if (m.type === 'youtube') {
      const yt = m.url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
      content.push({
        type: 'embed',
        attrs: {
          provider: 'youtube',
          url: m.url,
          thumbnail_url: yt ? `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg` : undefined,
        },
      })
    } else if (m.type === 'x') {
      content.push({ type: 'embed', attrs: { provider: 'x', url: m.url } })
    }
  }
  for (const text of paragraphs.slice(1)) content.push(para(text))
  return { type: 'doc', content }
}

async function todayPublishCounts() {
  // KST 자정 기준 오늘 발행분
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000)
  const kstMidnightUtc = new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) - 9 * 3600 * 1000
  ).toISOString()
  const { data, error } = await supabase
    .from('agg_reservoir')
    .select('rewritten')
    .eq('status', 'published')
    .gte('published_at', kstMidnightUtc)
  if (error) throw new Error(error.message)
  const byPersona = {}
  for (const row of data) {
    const p = row.rewritten?.persona_user_id
    if (p) byPersona[p] = (byPersona[p] || 0) + 1
  }
  return { total: data.length, byPersona }
}

async function main() {
  log(`dry=${dryRun} limit=${limit ?? 'none'}`)

  const counts = await todayPublishCounts()
  const { dailyPublishCap, publishPerPersonaPerDay } = CONFIG.limits
  if (counts.total >= dailyPublishCap) {
    log(`오늘 발행 cap(${dailyPublishCap}) 도달 — 종료`)
    return
  }

  let query = supabase
    .from('agg_reservoir')
    .select('id, source, source_url, rewritten, media, audit')
    .eq('status', 'approved')
    .order('created_at', { ascending: true })
  if (limit) query = query.limit(limit)
  const { data: items, error } = await query
  if (error) {
    log(`fetch error: ${error.message}`)
    process.exit(1)
  }
  log(`승인 대기 발행분 ${items.length}건 (오늘 이미 ${counts.total}건 발행)`)

  let published = 0
  for (const item of items) {
    if (counts.total + published >= dailyPublishCap) {
      log(`일일 cap 도달 — 나머지는 내일`)
      break
    }
    const rw = item.rewritten
    if (!rw?.title || !rw?.persona_user_id) {
      log(`  [ERR] rewritten 누락: ${item.id}`)
      continue
    }
    const personaCount = counts.byPersona[rw.persona_user_id] || 0
    if (personaCount >= publishPerPersonaPerDay) {
      log(`  [SKIP] ${rw.persona_user_id} 오늘 cap(${publishPerPersonaPerDay}) — ${rw.title.slice(0, 30)}`)
      continue
    }

    const content = buildTipTapDoc(rw, item.media || [])
    log(`  PUBLISH (${rw.persona_user_id}, nodes ${content.content.length}) ${rw.title}`)
    if (dryRun) {
      published++
      continue
    }

    // 출처는 공개 표기하지 않는다 (운영자 방침 2026-07-22).
    // 원본 추적은 agg_reservoir.source_url(내부 전용)로만 — takedown은 post_id 매핑으로 동작.
    const { data: postRow, error: insErr } = await supabase
      .from('posts')
      .insert({
        user_id: rw.persona_user_id,
        community_slug: CONFIG.board.communitySlug,
        title: rw.title,
        content,
      })
      .select('id')
      .single()
    if (insErr) {
      log(`  [ERR] posts insert: ${insErr.message}`)
      continue
    }

    const { error: upErr } = await supabase
      .from('agg_reservoir')
      .update({
        status: 'published',
        post_id: postRow.id,
        published_at: new Date().toISOString(),
        audit: [
          ...(item.audit || []),
          { at: new Date().toISOString(), stage: 'publish', post_id: postRow.id },
        ],
      })
      .eq('id', item.id)
    if (upErr) log(`  [WARN] reservoir update 실패 (post는 발행됨): ${upErr.message}`)

    counts.byPersona[rw.persona_user_id] = personaCount + 1
    published++
  }
  log(`발행 ${published}건 완료`)
}

main().catch((e) => {
  log(`FATAL: ${e.message}`)
  process.exit(1)
})

// data/agents/scripts/agg-train.js
//
// 페르소나 글 품질 학습 하니스 (라이브 발행과 완전 분리 — DB posts 안 건드림).
// 루프: gen(생성→DB 적재) → /admin/agg-training 에서 통과/교정/반려 → learn(교정 회수) → gen 반복.
// 만족스러워지면 그대로 라이브 파이프라인(agg-write-run)이 같은 프롬프트+교정을 사용.
//
// 사용:
//   node data/agents/scripts/agg-train.js gen [--n=8] [--resample]
//     → fixture.json(고정 소재)로 생성 후 agg_training_entries 에 새 라운드 적재
//       (검수는 https://gongnori.fan/admin/agg-training 에서)
//   node data/agents/scripts/agg-train.js learn
//     → 페이지에서 검수된 corrected/rejected 를 config/agg-corrections.json 에 누적
//   node data/agents/scripts/agg-train.js learn --file=workspace/agg-training/round-<ts>.md
//     → (구버전 호환) 리뷰 md 파일에서 교정/반려를 회수
//   node data/agents/scripts/agg-train.js status
//     → 라운드/검수 대기/누적 교정 현황

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CONFIG,
  loadCorrections,
  saveCorrections,
  buildSystemPrompt,
  pickPersona,
  pickStructure,
  generatePost,
  ensureDir,
} from '../core/agg-gen.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..', '..')
const TRAIN_DIR = join(REPO_ROOT, 'workspace', 'agg-training')
const FIXTURE_PATH = join(TRAIN_DIR, 'fixture.json')

const args = process.argv.slice(2)
const cmd = args[0]
const nArg = args.find((a) => a.startsWith('--n='))
const N = nArg ? parseInt(nArg.split('=')[1], 10) : 8
const fileArg = args.find((a) => a.startsWith('--file='))?.split('=').slice(1).join('=')
const resample = args.includes('--resample')

function log(msg) {
  process.stdout.write(`[agg-train] ${msg}\n`)
}

async function db() {
  const { default: supabase } = await import('../../crawlers/core/db.js')
  return supabase
}

// 리뷰 파일 파싱 마커 (구버전 md 호환)
const ENTRY_RE = /════════ \[(\d+)\][\s\S]*?(?=════════ \[|$)/g

/** 고정 소재(fixture) 로드/생성 — 같은 소재로 라운드를 반복해야 개선이 보인다 */
async function loadFixture() {
  if (existsSync(FIXTURE_PATH) && !resample) {
    return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))
  }
  const supabase = await db()
  // 이미지/본문이 있는 소재를 상태 무관하게 샘플 (학습은 발행과 무관)
  const { data, error } = await supabase
    .from('agg_reservoir')
    .select('source_title, category, body_excerpt, media')
    .not('body_excerpt', 'is', null)
    .order('created_at', { ascending: false })
    .limit(N)
  if (error) throw new Error(error.message)
  ensureDir(TRAIN_DIR)
  writeFileSync(FIXTURE_PATH, JSON.stringify(data, null, 2))
  log(`fixture ${data.length}건 생성 → ${FIXTURE_PATH}`)
  return data
}

async function cmdGen() {
  const { chatWithRetry } = await import('../../crawlers/core/openai-client.js')
  const fixture = await loadFixture()
  const corrections = loadCorrections()
  const systemPrompt = buildSystemPrompt(corrections)
  log(
    `생성 시작 — 소재 ${fixture.length}건, 누적 교정 ${corrections.pairs.length}·반려 ${(corrections.rejects || []).length}건 주입`
  )

  const entries = []
  for (const item of fixture) {
    const persona = pickPersona(item)
    const structure = pickStructure(item)
    try {
      const out = await generatePost({ item, persona, structure, systemPrompt, chatWithRetry })
      if (out.decision === 'reject') {
        log(`  [reject] ${item.source_title.slice(0, 30)} (${out.reject_reason})`)
        continue
      }
      entries.push({ item, persona, structure, out })
      log(`  [ok] (${persona.nickname}/${structure}) ${out.title}`)
    } catch (e) {
      log(`  [err] ${item.source_title.slice(0, 30)}: ${e.message}`)
    }
  }
  if (entries.length === 0) {
    log('생성된 글이 없습니다.')
    return
  }

  const supabase = await db()
  const { data: maxRow } = await supabase
    .from('agg_training_entries')
    .select('round')
    .order('round', { ascending: false })
    .limit(1)
    .maybeSingle()
  const round = (maxRow?.round || 0) + 1

  const rows = entries.map((e) => ({
    round,
    source_title: e.item.source_title,
    category: e.item.category,
    body_excerpt: e.item.body_excerpt,
    media: e.item.media || [],
    persona: e.persona.nickname,
    structure: e.structure,
    angle: e.out.angle || null,
    ai_title: e.out.title,
    ai_body: e.out.paragraphs.join('\n\n'),
  }))
  const { error } = await supabase.from('agg_training_entries').insert(rows)
  if (error) throw new Error(error.message)
  log(`라운드 ${round} — ${rows.length}건 적재 완료.`)
  log(`검수: https://gongnori.fan/admin/agg-training (통과/교정/반려)`)
  log(`검수 후: node data/agents/scripts/agg-train.js learn`)
}

/** DB에서 검수 완료분(corrected/rejected, 미회수)을 corrections.json 으로 회수 */
async function cmdLearnDb() {
  const supabase = await db()
  const { data, error } = await supabase
    .from('agg_training_entries')
    .select('id, source_title, persona, ai_title, ai_body, fix_title, fix_body, reject_reason, status')
    .in('status', ['corrected', 'rejected'])
    .is('learned_at', null)
    .order('round', { ascending: true })
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    log('회수할 검수 결과가 없습니다. (페이지에서 교정/반려한 것만 학습됩니다)')
    return
  }

  const store = loadCorrections()
  if (!Array.isArray(store.rejects)) store.rejects = []
  let corrected = 0
  let rejectedN = 0
  for (const e of data) {
    if (e.status === 'rejected') {
      store.rejects.push({ source_title: e.source_title, reason: e.reject_reason || '' })
      rejectedN++
      log(`  반려: "${e.source_title.slice(0, 30)}" (${e.reject_reason || '이유없음'})`)
      continue
    }
    store.pairs.push({
      persona: e.persona,
      before: { title: e.ai_title, paragraphs: (e.ai_body || '').split(/\n\n+/) },
      after: { title: e.fix_title, paragraphs: (e.fix_body || '').split(/\n\n+/) },
      note: '',
    })
    corrected++
    log(`  교정: (${e.persona}) "${e.ai_title.slice(0, 24)}" → "${(e.fix_title || '').slice(0, 24)}"`)
  }
  saveCorrections(store)

  const { error: markErr } = await supabase
    .from('agg_training_entries')
    .update({ learned_at: new Date().toISOString() })
    .in('id', data.map((e) => e.id))
  if (markErr) throw new Error(markErr.message)
  log(
    `교정 ${corrected}건 / 반려 ${rejectedN}건 회수 → 누적 교정 ${store.pairs.length}·반려 ${store.rejects.length}건. 다음 gen 부터 반영됩니다.`
  )
}

// ── 구버전 md 리뷰 파일 호환 ──────────────────────────────────────────────
function parseEntry(block) {
  const grab = (startMarker, endMarker) => {
    const s = block.indexOf(startMarker)
    if (s === -1) return null
    const from = s + startMarker.length
    const e = endMarker ? block.indexOf(endMarker, from) : -1
    return block.slice(from, e === -1 ? undefined : e).trim()
  }
  const personaLine = grab('페르소나: ', '\n') || ''
  const persona = personaLine.split(' / ')[0].trim()
  const sourceTitle = grab('소재: ', '\n')
  const aiTitle = grab('■ AI 제목\n', '\n\n■ AI 본문')
  const aiBody = grab('■ AI 본문\n', '\n\n┈┈┈')
  const fixTitle = grab('✎ 제목: ', '\n')
  const fixBody = grab('✎ 본문:\n', null)
  return { persona, sourceTitle, aiTitle, aiBody, fixTitle, fixBody: fixBody ? fixBody.trim() : null }
}

function cmdLearnFile() {
  const path = join(REPO_ROOT, fileArg.replace(/^.*community[\\/]/, ''))
  const raw = readFileSync(existsSync(fileArg) ? fileArg : path, 'utf8')
  const store = loadCorrections()
  if (!Array.isArray(store.rejects)) store.rejects = []
  let corrected = 0
  let rejectedN = 0
  const blocks = raw.match(ENTRY_RE) || []
  for (const block of blocks) {
    const e = parseEntry(block)
    if (!e.aiTitle || e.fixTitle === null || e.fixBody === null) continue

    // 반려: ✎ 제목이 [반려] 로 시작 → 소재 부적합 신호로 학습
    const rejectMatch = e.fixTitle.trim().match(/^\[반려\]\s*(.*)$/)
    if (rejectMatch) {
      store.rejects.push({ source_title: e.sourceTitle || '', reason: rejectMatch[1] || '' })
      rejectedN++
      log(`  반려: "${(e.sourceTitle || '').slice(0, 30)}" (${rejectMatch[1] || '이유없음'})`)
      continue
    }

    const titleChanged = e.fixTitle.trim() !== e.aiTitle.trim()
    const bodyChanged = e.fixBody.trim() !== (e.aiBody || '').trim()
    if (!titleChanged && !bodyChanged) continue // 그대로 둔 것 = 학습 안 함
    store.pairs.push({
      persona: e.persona,
      before: { title: e.aiTitle, paragraphs: (e.aiBody || '').split(/\n\n+/) },
      after: { title: e.fixTitle, paragraphs: e.fixBody.split(/\n\n+/) },
      note: '',
    })
    corrected++
    log(`  교정: (${e.persona}) "${e.aiTitle.slice(0, 24)}" → "${e.fixTitle.slice(0, 24)}"`)
  }
  saveCorrections(store)
  log(
    `교정 ${corrected}건 / 반려 ${rejectedN}건 추가 → 누적 교정 ${store.pairs.length}·반려 ${store.rejects.length}건. 다음 gen 부터 반영됩니다.`
  )
}

async function cmdStatus() {
  const store = loadCorrections()
  log(`누적 교정 ${store.pairs.length}건 / 반려 ${(store.rejects || []).length}건`)
  const byPersona = {}
  for (const p of store.pairs) byPersona[p.persona] = (byPersona[p.persona] || 0) + 1
  for (const [k, v] of Object.entries(byPersona)) log(`  ${k}: ${v}`)
  log(`페르소나 ${CONFIG.personas.length}명, 프롬프트에 최근 8건 few-shot 주입`)
  try {
    const supabase = await db()
    const { data } = await supabase
      .from('agg_training_entries')
      .select('round, status, learned_at')
    const pending = (data || []).filter((r) => r.status === 'pending').length
    const unlearned = (data || []).filter(
      (r) => (r.status === 'corrected' || r.status === 'rejected') && !r.learned_at
    ).length
    const maxRound = Math.max(0, ...(data || []).map((r) => r.round))
    log(`라운드 ${maxRound} — 검수 대기 ${pending}건, learn 회수 대기 ${unlearned}건`)
  } catch {
    log('(DB 조회 실패 — env 확인)')
  }
}

async function main() {
  switch (cmd) {
    case 'gen':
      await cmdGen()
      break
    case 'learn':
      if (fileArg) cmdLearnFile()
      else await cmdLearnDb()
      break
    case 'status':
      await cmdStatus()
      break
    default:
      log('명령: gen [--n=8] [--resample] | learn [--file=<md>] | status')
      process.exit(1)
  }
}

main().catch((e) => {
  log(`FATAL: ${e.message}`)
  process.exit(1)
})

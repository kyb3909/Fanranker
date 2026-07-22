// data/agents/scripts/agg-train.js
//
// 페르소나 글 품질 학습 하니스 (라이브 발행과 완전 분리 — DB posts 안 건드림).
// 루프: gen(생성) → 운영자가 리뷰 파일 직접 교정 → learn(교정 학습) → gen 반복.
// 만족스러워지면 그대로 라이브 파이프라인(agg-write-run)이 같은 프롬프트+교정을 사용.
//
// 사용:
//   node data/agents/scripts/agg-train.js gen [--n=8] [--resample]
//     → workspace/agg-training/ 에 fixture.json(고정 소재) + round-<ts>.md(리뷰용) 생성
//   node data/agents/scripts/agg-train.js learn --file=workspace/agg-training/round-<ts>.md
//     → 리뷰 파일에서 (AI초안 ≠ 교정) 쌍을 뽑아 config/agg-corrections.json 에 누적
//   node data/agents/scripts/agg-train.js status
//     → 누적 교정 수 확인

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

// 리뷰 파일 파싱 마커
const ENTRY_RE = /════════ \[(\d+)\][\s\S]*?(?=════════ \[|$)/g

/** 고정 소재(fixture) 로드/생성 — 같은 소재로 라운드를 반복해야 개선이 보인다 */
async function loadFixture() {
  if (existsSync(FIXTURE_PATH) && !resample) {
    return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))
  }
  const { default: supabase } = await import('../../crawlers/core/db.js')
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

function renderReview(entries) {
  const lines = [
    `# 페르소나 글 학습 라운드`,
    ``,
    `> 사용법: 각 글의 **✎ 제목 / ✎ 본문**을 직접 고치세요. 좋으면 그대로 두면 됩니다.`,
    `> 고친 것만 정답으로 학습됩니다. 다 고쳤으면 저장 후:`,
    `> \`node data/agents/scripts/agg-train.js learn --file=<이 파일 경로>\``,
    ``,
  ]
  entries.forEach((e, i) => {
    const body = e.out.paragraphs.join('\n\n')
    lines.push(
      `════════ [${i + 1}] ════════`,
      `소재: ${e.item.source_title}`,
      `페르소나: ${e.persona.nickname} / 구조: ${e.structure} / 각도: ${e.out.angle || '-'}`,
      ``,
      `■ AI 제목`,
      e.out.title,
      ``,
      `■ AI 본문`,
      body,
      ``,
      `┈┈┈ 교정 (아래를 고치세요. 좋으면 그대로) ┈┈┈`,
      ``,
      `✎ 제목: ${e.out.title}`,
      ``,
      `✎ 본문:`,
      body,
      ``,
      ``
    )
  })
  return lines.join('\n')
}

async function cmdGen() {
  const { chatWithRetry } = await import('../../crawlers/core/openai-client.js')
  const fixture = await loadFixture()
  const corrections = loadCorrections()
  const systemPrompt = buildSystemPrompt(corrections)
  log(`생성 시작 — 소재 ${fixture.length}건, 누적 교정 ${corrections.pairs.length}건 주입`)

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

  ensureDir(TRAIN_DIR)
  // 파일명은 라운드 수로 (Date 안 씀 — 결정적). 기존 round 파일 수 + 1
  const roundNum = Date.now() // 파일명 유일성만 필요, node 스크립트라 Date OK
  const outPath = join(TRAIN_DIR, `round-${roundNum}.md`)
  writeFileSync(outPath, renderReview(entries))
  log(`리뷰 파일 → ${outPath}`)
  log(`이제 이 파일을 열어 ✎ 부분을 고친 뒤, learn 으로 학습시키세요.`)
}

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
  const aiTitle = grab('■ AI 제목\n', '\n\n■ AI 본문')
  const aiBody = grab('■ AI 본문\n', '\n\n┈┈┈')
  const fixTitle = grab('✎ 제목: ', '\n')
  const fixBody = grab('✎ 본문:\n', null)
  return { persona, aiTitle, aiBody, fixTitle, fixBody: fixBody ? fixBody.trim() : null }
}

function cmdLearn() {
  if (!fileArg) {
    log('사용법: learn --file=<리뷰 md 경로>')
    process.exit(1)
  }
  const path = join(REPO_ROOT, fileArg.replace(/^.*community[\\/]/, ''))
  const raw = readFileSync(existsSync(fileArg) ? fileArg : path, 'utf8')
  const store = loadCorrections()
  let added = 0
  const blocks = raw.match(ENTRY_RE) || []
  for (const block of blocks) {
    const e = parseEntry(block)
    if (!e.aiTitle || e.fixTitle === null || e.fixBody === null) continue
    const titleChanged = e.fixTitle.trim() !== e.aiTitle.trim()
    const bodyChanged = e.fixBody.trim() !== (e.aiBody || '').trim()
    if (!titleChanged && !bodyChanged) continue // 그대로 둔 것 = 학습 안 함
    store.pairs.push({
      persona: e.persona,
      before: { title: e.aiTitle, paragraphs: (e.aiBody || '').split(/\n\n+/) },
      after: { title: e.fixTitle, paragraphs: e.fixBody.split(/\n\n+/) },
      note: '',
    })
    added++
    log(`  학습: (${e.persona}) "${e.aiTitle.slice(0, 24)}" → "${e.fixTitle.slice(0, 24)}"`)
  }
  saveCorrections(store)
  log(`교정 ${added}건 추가 → 누적 ${store.pairs.length}건. 다음 gen 부터 반영됩니다.`)
}

function cmdStatus() {
  const store = loadCorrections()
  log(`누적 교정 ${store.pairs.length}건`)
  const byPersona = {}
  for (const p of store.pairs) byPersona[p.persona] = (byPersona[p.persona] || 0) + 1
  for (const [k, v] of Object.entries(byPersona)) log(`  ${k}: ${v}`)
  log(`페르소나 ${CONFIG.personas.length}명, 프롬프트에 최근 8건 few-shot 주입`)
}

async function main() {
  switch (cmd) {
    case 'gen':
      await cmdGen()
      break
    case 'learn':
      cmdLearn()
      break
    case 'status':
      cmdStatus()
      break
    default:
      log('명령: gen [--n=8] [--resample] | learn --file=<md> | status')
      process.exit(1)
  }
}

main().catch((e) => {
  log(`FATAL: ${e.message}`)
  process.exit(1)
})

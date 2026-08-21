// data/agents/scripts/learn-from-edits.js
//
// 교정 학습 (Hermes 루프의 결정론 파트)
// 운영자가 발행된 봇 기사를 수정하면, 발행 원본(news_reservoir.publish)과
// 현재 게시글(posts.content)의 diff 에서 **표기 교정**(선수명·매체명·음차·단어)을
// 추출해 news_alias_dictionary 에 자동 등록한다.
//
// - 원본은 reservoir 에 보존돼 있으므로 별도 수정 이력 테이블이 필요 없다.
// - 규칙성 표기만 학습한다 (문체 교정은 범위 밖 — 잘못 일반화하면 위험).
// - 같은 게시글의 같은 버전은 재학습하지 않는다 (audit 에 content hash 기록).
//
// 사용:
//   node data/agents/scripts/learn-from-edits.js            # 실제 등록
//   node data/agents/scripts/learn-from-edits.js --dry-run  # 감지·추출만
//   (env 는 crawlers/.env 자동 로드 — hermes cron/수동 실행 어디서든 동작)

import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', '..', 'crawlers', '.env') })

const { default: supabase } = await import('../../crawlers/core/db.js')
const { chatWithRetry } = await import('../../crawlers/core/openai-client.js')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
/** 이미 학습한 버전도 다시 처리 (등록 실패분 재시도용) */
const force = args.includes('--force')
const LOOKBACK_DAYS = 14
const MODEL = 'gpt-4.1-mini'

function log(msg) {
  process.stdout.write(`[${new Date().toISOString()}] [edit-learner] ${msg}\n`)
}

/** TipTap JSON → 문단 텍스트 (임베드·이미지 제외) */
function tiptapText(node, out = []) {
  if (!node) return out
  if (node.type === 'paragraph') {
    const t = (node.content || []).map((c) => c.text || '').join('')
    if (t.trim()) out.push(t.trim())
  }
  for (const c of node.content || []) tiptapText(c, out)
  return out
}

const norm = (s) => s.replace(/\s+/g, ' ').trim()

// audit 은 발행 경로마다 형태가 다르다: 파이프라인은 배열, hermes/admin 은 객체.
// 학습 기록을 남길 때 상대 형태의 기존 데이터를 덮지 않도록 읽기/쓰기를 분리한다.
function auditEntries(audit) {
  if (Array.isArray(audit)) return audit
  if (audit && Array.isArray(audit.edit_learner_runs)) return audit.edit_learner_runs
  return []
}

function auditWithEntry(audit, entry) {
  if (Array.isArray(audit)) return [...audit, entry]
  return {
    ...(audit || {}),
    edit_learner_runs: [...(audit?.edit_learner_runs || []), entry],
  }
}

const EXTRACT_PROMPT = `너는 한국 스포츠 뉴스룸의 교열 기록원이다. 봇이 발행한 기사(원본)와 운영자가 수정한 최종본(수정본)을 비교해서, **표기 교정만** 추출한다.

추출 대상 (category):
- player / team / coach / competition: 인명·팀명·대회명 한글 표기 교정 (예: "바르콜라" → "바르콜라"가 아니라 "바콜라" → "바르콜라" 같은 실제 변경만)
- media: 언론사·매체 표기 교정 (예: "foxsports.com" → "폭스 스포츠")
- term: 축구 용어·일반 단어의 표기/음차 교정 (예: "위닝골" → "결승골")

규칙:
1. 원본과 수정본에서 **실제로 바뀐 표기만** 추출한다. 바뀌지 않은 것은 절대 포함하지 않는다.
2. 문장 구조 변경·내용 추가/삭제·조사 수정은 표기 교정이 아니다 — 제외.
3. wrong 은 원본에 실제로 등장한 문자열 그대로, correct 는 수정본의 대응 문자열 그대로.
4. 확실하지 않으면 빼라. 잘못된 규칙 하나가 모든 기사에 전파된다.

출력 (JSON only):
{"corrections": [{"wrong": "...", "correct": "...", "category": "player|team|coach|competition|media|term", "romanized": "원어/로마자 표기 (아는 경우만, 예: ter Stegen)", "evidence": "수정본에서 해당 부분 한 구절"}]}
교정이 없으면 {"corrections": []}`

function slugify(s) {
  const ascii = s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return ascii || createHash('sha1').update(s, 'utf8').digest('hex').slice(0, 10)
}

/** `[Marca]` → `Marca` — 대괄호는 표기가 아니라 제목에서 표기가 놓이는 자리다 */
function stripLabelBrackets(s) {
  return s.replace(/^\[\s*/, '').replace(/\s*\]$/, '').trim()
}

async function upsertCorrection(c, sourcePostId) {
  const wrong = c.wrong.trim()
  const correct = c.correct.trim()
  if (!wrong || !correct || wrong === correct) return 'skipped'

  // 1) 같은 preferred_ko 항목이 있으면 surface 추가
  const { data: existing } = await supabase
    .from('news_alias_dictionary')
    .select('id, surfaces, preferred_ko')
    .eq('preferred_ko', correct)
    .limit(1)

  const surface = wrong.toLowerCase()
  if (existing && existing.length > 0) {
    const row = existing[0]
    if ((row.surfaces || []).includes(surface)) return 'known'
    if (!dryRun) {
      await supabase
        .from('news_alias_dictionary')
        .update({
          surfaces: [...(row.surfaces || []), surface],
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
    }
    return 'surface_added'
  }

  // 2) 사전이 틀린 표기를 대표값으로 갖고 있던 경우 — 그 항목 자체를 교정한다.
  //    (예: 사전 preferred_ko="테르 슈테겐" 인데 운영자가 "테어 슈테겐" 으로 고침)
  //    옛 표기는 surface 로 내려 남겨서, 원문에 그 철자가 나와도 계속 매칭된다.
  const { data: staleEntry } = await supabase
    .from('news_alias_dictionary')
    .select('id, surfaces, preferred_ko')
    .eq('preferred_ko', wrong)
    .limit(1)

  if (staleEntry && staleEntry.length > 0) {
    const row = staleEntry[0]
    if (!dryRun) {
      await supabase
        .from('news_alias_dictionary')
        .update({
          preferred_ko: correct,
          surfaces: [...new Set([...(row.surfaces || []), surface])],
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
    }
    return 'entry_corrected'
  }

  // 3) 신규 항목
  if (!dryRun) {
    // romanized 는 NOT NULL — LLM 이 준 원어 표기 > ASCII 원문 > 빈 문자열
    const romanized =
      (c.romanized || '').trim() || (/^[\x00-\x7F]+$/.test(wrong) ? wrong : '')
    const { error } = await supabase.from('news_alias_dictionary').insert({
      id: `${c.category}_learned_${slugify(wrong)}`,
      category: c.category,
      preferred_ko: correct,
      romanized,
      surfaces: [surface],
      confidence: 0.9,
      notes: `learned-from-edit post=${sourcePostId} at=${new Date().toISOString()}`,
    })
    if (error) {
      // id 충돌 등 — 로그만 남기고 계속
      log(`  [WARN] insert failed (${c.category}/${wrong}): ${error.message}`)
      return 'error'
    }
  }
  return 'inserted'
}

/** 학습된 규칙 목록 (검토·롤백용) */
async function listLearned() {
  const { data } = await supabase
    .from('news_alias_dictionary')
    .select('id, category, preferred_ko, surfaces, romanized, updated_at')
    .ilike('notes', 'learned-from-edit%')
    .order('category')
  log(`운영자 수정에서 학습된 규칙: ${(data || []).length} 건`)
  for (const d of data || []) {
    log(`  [${d.category}] ${JSON.stringify(d.surfaces)} → "${d.preferred_ko}"   (id: ${d.id})`)
  }
  log('삭제: node data/agents/scripts/learn-from-edits.js --forget <id>')
}

/** 잘못 학습된 규칙 제거 */
async function forget(id) {
  const { error } = await supabase.from('news_alias_dictionary').delete().eq('id', id)
  log(error ? `삭제 실패: ${error.message}` : `삭제됨: ${id}`)
}

async function main() {
  if (args.includes('--list')) return listLearned()
  const forgetIdx = args.indexOf('--forget')
  if (forgetIdx >= 0) return forget(args[forgetIdx + 1])

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString()
  const { data: items, error } = await supabase
    .from('news_reservoir')
    .select('id, publish, audit, raw, draft')
    .eq('status', 'published')
    .gte('updated_at', since)

  if (error) {
    log(`fetch error: ${error.message}`)
    process.exit(1)
  }

  const totals = { checked: 0, edited: 0, corrections: 0, inserted: 0, surface_added: 0, known: 0 }
  const learnedSummary = []

  for (const item of items || []) {
    // 발행 경로가 둘이다: 파이프라인 publish-run(publish.postId) / admin 검수·hermes(publish.post_id)
    const postId = item.publish?.postId || item.publish?.post_id
    if (!postId) continue
    totals.checked++

    const { data: post } = await supabase
      .from('posts')
      .select('id, title, content, deleted_at')
      .eq('id', postId)
      .maybeSingle()
    if (!post || post.deleted_at) continue

    // 원본(수정 전) 복원 — 우선순위:
    // 1. publish.pre_edit  (admin 검수가 편집 발행 시 보존해주는 원본 — 라우트 수정으로 신설)
    // 2. publish.title/paragraphs  (파이프라인 발행 원본)
    // 3. raw.title + draft.content  (hermes/구 스캐너 rows — draft 는 편집본으로 덮일 수
    //    있어 제목만은 raw 를 신뢰. 본문 diff 는 pre_edit 없으면 no-op 이 안전)
    let originalTitle = ''
    let originalBody = []
    if (item.publish?.pre_edit) {
      originalTitle = item.publish.pre_edit.title || ''
      originalBody = tiptapText(item.publish.pre_edit.content)
    } else if (item.publish?.paragraphs?.length) {
      originalTitle = item.publish.title || ''
      originalBody = item.publish.paragraphs
    } else {
      originalTitle = item.raw?.title || item.draft?.title || ''
      originalBody = tiptapText(item.draft?.content)
    }
    const originalText = norm([originalTitle, ...originalBody].join('\n'))
    const currentText = norm([post.title, ...tiptapText(post.content)].join('\n'))
    if (!originalText || !currentText || originalText === currentText) continue

    // 같은 버전 재학습 방지 — 현재 내용 해시가 이미 학습됐으면 skip
    const auditList = auditEntries(item.audit)
    const contentHash = createHash('sha1').update(currentText, 'utf8').digest('hex').slice(0, 12)
    const alreadyLearned = auditList.some(
      (a) => a?.agent === 'edit_learner' && a?.message?.includes(contentHash)
    )
    if (alreadyLearned && !force) continue

    totals.edited++
    log(`edited post 감지: ${post.title.slice(0, 50)}`)

    let parsed
    try {
      const response = await chatWithRetry({
        model: MODEL,
        messages: [
          { role: 'system', content: EXTRACT_PROMPT },
          {
            role: 'user',
            content: JSON.stringify({ 원본: originalText, 수정본: currentText }),
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 800,
      })
      parsed = JSON.parse(response.choices[0].message.content)
    } catch (e) {
      log(`  [ERR] extract: ${e.message}`)
      continue
    }

    // ── 환각 가드 ────────────────────────────────────────────────────────
    // LLM 을 "저자"가 아니라 "추출기"로 묶는다. 실측에서 원문에 없는 표기를
    // 지어낸 사례가 나왔다 ("알렉스 스콧"→"알렉스 스캇", Gvardiol 의 로마자를
    // "Guardiola" 로). 사전은 한 번 오염되면 모든 기사에 전파되므로,
    // 양쪽 텍스트에 실제로 존재하는 문자열만 통과시킨다.
    const inOriginal = (s) => originalText.includes(s)
    const inCurrent = (s) => currentText.includes(s)
    const corrections = []
    for (const c of parsed.corrections || []) {
      if (!c.wrong || !c.correct || !c.category) continue
      const wrong = String(c.wrong).trim()
      const correct = String(c.correct).trim()
      if (!inOriginal(wrong)) {
        log(`  [SKIP] 원본에 없는 표기: "${wrong}"`)
        totals.rejected_hallucination = (totals.rejected_hallucination || 0) + 1
        continue
      }
      if (!inCurrent(correct)) {
        log(`  [SKIP] 수정본에 없는 표기: "${correct}" (운영자가 쓴 표기가 아님)`)
        totals.rejected_hallucination = (totals.rejected_hallucination || 0) + 1
        continue
      }
      // romanized 도 어느 한쪽 텍스트에 등장할 때만 신뢰한다
      const roman = String(c.romanized || '').trim()
      const romanOk = roman && (inOriginal(roman) || inCurrent(roman))
      // 대괄호는 제목에서 라벨이 놓이는 **자리**지 표기가 아니다. 환각 가드는 원문
      // 그대로여야 통과하므로 여기서(가드 뒤) 벗긴다 — 2026-08-22 사고: `[Marca]` →
      // `[마르카]` 가 등재돼 라벨 교정이 대괄호를 덧씌워 제목이 `[[마르카]]` 로 나갔다.
      const wrongTerm = stripLabelBrackets(wrong)
      const correctTerm = stripLabelBrackets(correct)
      if (!wrongTerm || !correctTerm || wrongTerm === correctTerm) continue
      if (/[[\]]/.test(wrongTerm) || /[[\]]/.test(correctTerm)) {
        log(`  [SKIP] 대괄호 잔존: "${wrong}" → "${correct}"`)
        continue
      }
      corrections.push({
        ...c,
        wrong: wrongTerm,
        correct: correctTerm,
        romanized: romanOk ? stripLabelBrackets(roman) : '',
      })
    }

    for (const c of corrections) {
      const result = await upsertCorrection(c, postId)
      totals[result] = (totals[result] || 0) + 1
      if (result === 'inserted' || result === 'surface_added' || result === 'entry_corrected') {
        totals.corrections++
        learnedSummary.push(`[${c.category}] "${c.wrong}" → "${c.correct}" (${result})`)
        log(`  LEARNED [${c.category}] "${c.wrong}" → "${c.correct}" (${result})`)
      }
    }

    // audit 에 학습 기록 (해시 포함 — 재학습 방지)
    if (!dryRun) {
      const newAudit = auditWithEntry(item.audit, {
        at: new Date().toISOString(),
        agent: 'edit_learner',
        action: 'learn',
        tier: 'T2',
        message: `hash=${contentHash} corrections=${corrections.length}`,
      })
      await supabase.from('news_reservoir').update({ audit: newAudit }).eq('id', item.id)
    }
  }

  log('--- totals ---')
  for (const [k, v] of Object.entries(totals)) log(`  ${k.padEnd(14)}: ${v}`)
  if (learnedSummary.length > 0) {
    log('--- 학습된 규칙 ---')
    for (const s of learnedSummary) log(`  ${s}`)
  }
}

await main()

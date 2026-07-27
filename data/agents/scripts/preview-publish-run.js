// data/agents/scripts/preview-publish-run.js
//
// 경기 프리뷰 2단계: 드라이톤 재작성(T1) + 봇 발행 — docs/PRD-match-preview.md
// extracted → published | (LLM/insert 실패 시 error 기록 후 extracted 유지)
//
// 컴플라이언스가 이 스크립트의 존재 이유다:
// soccerway 원문에는 해외 도박 스트리밍(Where to Watch)·북메이커·배당 문구가 섞여 있어
// "그대로 번역" 금지 — 팩트(수치·팀명)만 보존하고 해당 요소는 전부 제거한다.
//
// 발행 대상: community_slug 'match-preview' (is_active=false → 담벼락 미노출,
// 오늘의 경기 위젯·예측 카드·직접 URL 로만 진입).
//
// 사용:
//   node data/agents/scripts/preview-publish-run.js
//   node data/agents/scripts/preview-publish-run.js --dry-run --limit=1

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', '..', 'crawlers', '.env') })

const { default: supabase } = await import('../../crawlers/core/db.js')
const { chatWithRetry } = await import('../../crawlers/core/openai-client.js')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const limitArg = args.find((a) => a.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 10

const MODEL = process.env.PREVIEW_MODEL || 'gpt-4.1-mini'
const BOT_USER_ID = 'user_bot_preview_kr'
const COMMUNITY_SLUG = 'match-preview'

function log(msg) {
  process.stdout.write(`[${new Date().toISOString()}] [preview-publish] ${msg}\n`)
}

const SYSTEM_PROMPT = `너는 한국 축구 커뮤니티의 경기 프리뷰 작성자다. 영문 통계 프리뷰 원문을 받아 한국어 프리뷰 글로 재작성한다.

[톤]
- 팩트 와이어체(드라이 톤). 감상·질문·과장·이모지 금지. 수치와 팀명·선수명은 원문 그대로 보존.
- 팀명·선수명·리그명은 한국 축구 팬 커뮤니티에서 통용되는 한국어 표기 사용 (예: Tottenham→토트넘, Premier League→프리미어리그, MLS 는 MLS 유지).

[구성 — 문단 순서. 도입·마무리는 일반 문단이고, 가운데 4개 섹션만 "◆ 섹션명 — 내용" 형식]
1. (도입, ◆ 없음) 대진·리그·킥오프 정보만 1문단 (원문 날짜는 dd.mm.yyyy 형식이니 "M월 D일"로 변환)
2. "◆ 최근 폼 — " 양 팀 순위·승점·최근 5경기·직전 경기
3. "◆ 주목할 선수 — " 팀별 핵심 득점원
4. "◆ 상대 전적 — " 최근 맞대결 요약 + 흥미로운 홈/원정 득실 통계 (장황하면 압축)
5. "◆ 포인트 — " 원문의 Hot Stats/Streaks 중 떡밥 가치 높은 것 2~4개를 항목당 1문장으로
6. (마무리, ◆ 없음) 데이터 기반 승률(있으면 "데이터 기준 홈 승 41%·무 30%·원정 승 29%" 형식)과 예상 전개 1문장
"도입"·"마무리" 같은 구성 지시어를 본문에 쓰지 말 것.

[금지 — 반드시 제거]
- 중계·시청 정보(Where to Watch) 전체, 북메이커·베팅사이트명, 배당률 숫자, "bet/betting" 계열 표현
- "Generated automatically" 등 메타 문구, 원문에 없는 사실 추가 금지

JSON 으로만 응답: {"title": "...", "paragraphs": ["...", ...]}
- title 형식: "[프리뷰] {홈팀} vs {원정팀} — {리그}" (한국어 팀명)
- paragraphs: 문단 배열 (◆ 섹션명 줄도 하나의 문단)`

function buildTipTapDoc(paragraphs) {
  return {
    type: 'doc',
    content: paragraphs
      .filter((t) => String(t).trim())
      .map((text) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: String(text).slice(0, 2000) }],
      })),
  }
}

async function rewrite(row) {
  const res = await chatWithRetry({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `경기: ${row.home_team} vs ${row.away_team} (${row.league})\n\n원문:\n${row.raw_text}`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.4,
  })
  const out = JSON.parse(res.choices[0].message.content)
  if (!out.title || !Array.isArray(out.paragraphs) || out.paragraphs.length < 4) {
    throw new Error('LLM 출력 형식 불량')
  }
  // 컴플라이언스 하드 가드 — LLM 이 지시를 어겨도 여기서 걸러 발행 차단
  const joined = [out.title, ...out.paragraphs].join(' ')
  const banned = /1xbet|betclic|megapari|paripesa|melbet|22bet|spinbetter|betera|bookmaker|배당률|베팅사이트/i
  if (banned.test(joined)) throw new Error('금지 표현 검출 — 발행 차단')
  return out
}

async function main() {
  log(`model=${MODEL} dry=${dryRun} limit=${limit}`)

  const { data: rows, error } = await supabase
    .from('match_previews')
    .select('id, soccerway_mid, home_team, away_team, league, raw_text, audit')
    .eq('status', 'extracted')
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) {
    log(`select error: ${error.message}`)
    process.exit(1)
  }
  log(`대상 ${rows.length}건`)

  for (const row of rows) {
    try {
      const rw = await rewrite(row)
      log(`  ${rw.title} (문단 ${rw.paragraphs.length})`)
      if (dryRun) {
        for (const p of rw.paragraphs) log(`    | ${p.slice(0, 120)}`)
        continue
      }

      const { data: postRow, error: insErr } = await supabase
        .from('posts')
        .insert({
          user_id: BOT_USER_ID,
          community_slug: COMMUNITY_SLUG,
          title: rw.title,
          content: buildTipTapDoc(rw.paragraphs),
        })
        .select('id')
        .single()
      if (insErr) throw new Error(`posts insert: ${insErr.message}`)

      const { error: upErr } = await supabase
        .from('match_previews')
        .update({
          status: 'published',
          rewritten: rw,
          post_id: postRow.id,
          published_at: new Date().toISOString(),
          error: null,
          audit: [
            ...(row.audit || []),
            { at: new Date().toISOString(), stage: 'publish', post_id: postRow.id, model: MODEL },
          ],
        })
        .eq('id', row.id)
      if (upErr) log(`  [WARN] row update 실패 (post 는 발행됨): ${upErr.message}`)
      log(`  → published post ${postRow.id}`)
    } catch (e) {
      log(`  [ERR] ${row.soccerway_mid}: ${e.message}`)
      await supabase.from('match_previews').update({ error: e.message.slice(0, 300) }).eq('id', row.id)
    }
  }
  log('완료')
}

main().catch((e) => {
  log(`FATAL: ${e.message}`)
  process.exit(1)
})

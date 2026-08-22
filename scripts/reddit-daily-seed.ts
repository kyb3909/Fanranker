/**
 * 레딧 데일리 스레드 → 담벼락 시드 글 (2026-08-21 운영자 요청)
 *
 * r/Gunners 같은 팀 서브레딧의 Daily Discussion 스레드 댓글은 사실상 낱개 게시글이다.
 * 그 댓글들을 **번역이 아니라 각색**해 한국 축덕 말투의 담벼락 글로 만든다.
 *
 * 정책 (운영자 2026-08-21):
 * - **자기 팀 이야기 위주만** — 타 팀·타 팬덤 조롱/공격/도발은 배제 (그런 건 독립
 *   게시판용). 감상·의견·드립·추억·질문만, 루머·이적설 등 사실 주장성 댓글 제외.
 * - 기본은 미리보기(dry) — 변환 결과만 출력. `--post` 를 붙여야 실제 등록.
 * - 등록 명의는 페르소나 3계정 로테이션 (한 계정 도배 방지).
 *
 * 사용법:
 *   pnpm exec tsx scripts/reddit-daily-seed.ts <레딧 스레드 URL> [--limit=6] [--post] [--board=...]
 *   예) pnpm exec tsx scripts/reddit-daily-seed.ts https://www.reddit.com/r/Gunners/comments/1vtd3pf/... --limit=6
 *
 * 게시판 라우팅 (2026-08-23 팀 보드 13개 연결): --board 를 안 주면 서브레딧의 팀 게시판
 * (SUB_MAP — r/chelseafc→/community/chelsea 등)으로 자동 라우팅. 보드 없는 팀(뉴캐슬·PSG)과
 * 미등록 서브레딧은 football 폴백. --board=football 로 강제하면 종전과 동일.
 *
 * 수집 경로 (2026-08-21 실측): 로컬·VPS 모두 레딧 JSON 은 403, **스레드 RSS + VPS**만
 * 뚫린다 → `scripts/vultr-exec.py` 로 VPS 에서 curl. 레딧 예산은 IP당 60초 1건 —
 * 이 스크립트는 실행당 1건만 쓴다 (스캐너 cron 과 예산을 나눠 쓰므로 연타 금지).
 */

import { config } from "dotenv"
import { createClient } from "@supabase/supabase-js"
import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
import { chatParams } from "../lib/llm/openai-params"

config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

const MODEL = process.env.SEED_MODEL || "gpt-4.1-mini"
const REDDIT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

/** 등록 명의 로테이션 — 실재하는 페르소나 프로필 (물복숭아·치킨무·자야되는데) */
const PERSONAS = ["user_persona_light", "user_persona_meme", "user_persona_dawn"]

/**
 * 서브레딧 → 팀 라벨(LLM 컨텍스트·말머리) + 팀 게시판 (2026-08-23 팀 보드 연결).
 * board 는 categories slug — lib/constants/team-boards.ts 레지스트리와 동기.
 * 팀 보드가 없는 팀(뉴캐슬·PSG)은 football 폴백.
 */
const SUB_MAP: Record<string, { team: string; board: string }> = {
  gunners: { team: "아스날", board: "arsenal" },
  liverpoolfc: { team: "리버풀", board: "liverpool" },
  chelseafc: { team: "첼시", board: "chelsea" },
  reddevils: { team: "맨유", board: "manutd" },
  manchesterunited: { team: "맨유", board: "manutd" },
  mcfc: { team: "맨시티", board: "mancity" },
  coys: { team: "토트넘", board: "tottenham" },
  nufc: { team: "뉴캐슬", board: "football" },
  realmadrid: { team: "레알", board: "realmadrid" },
  barca: { team: "바르샤", board: "barcelona" },
  atletico: { team: "아틀레티코", board: "atletico" },
  fcbayern: { team: "뮌헨", board: "bayern" },
  borussiadortmund: { team: "도르트문트", board: "dortmund" },
  acmilan: { team: "밀란", board: "milan" },
  juve: { team: "유벤투스", board: "juventus" },
  fcintermilan: { team: "인테르", board: "inter" },
  psg: { team: "PSG", board: "football" },
}

function textToTipTapJson(text: string): object {
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 10)
  return {
    type: "doc",
    content: paragraphs.map((p) => ({
      type: "paragraph",
      content: [{ type: "text", text: p.slice(0, 5000) }],
    })),
  }
}

/**
 * VPS 경유 레딧 RSS — 로컬 직통은 레딧이 막는다 (2026-08-21 실측). 호출 1회 = 예산 1건.
 * ⚠️ VPS IP 예산은 뉴스 스캐너 cron(15분마다 ~12건)과 공유라 429 가 일상이다 —
 *    429 는 빈 본문으로 온다(2026-08-23 실측). 80초 쉬고 재시도해 빈 틈에 끼어든다.
 */
async function fetchRedditRssViaVps(url: string, attempts = 6): Promise<string> {
  for (let i = 1; ; i++) {
    const remote = `sleep 2; curl -s -H 'User-Agent: ${REDDIT_UA}' '${url}'`
    const out = execFileSync("py", ["-3", "scripts/vultr-exec.py", "--timeout", "60", remote], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    })
    if (out.includes("<entry>")) return out
    if (i >= attempts) {
      throw new Error(`RSS 수집 실패 (429/빈 응답 ${attempts}회): ${out.slice(0, 120)}`)
    }
    console.log(`  레딧 예산 대기 (${i}/${attempts}) — 80초 후 재시도…`)
    await sleep(80_000)
  }
}

function fetchThreadRssViaVps(sub: string, threadId: string): Promise<string> {
  return fetchRedditRssViaVps(
    `https://www.reddit.com/r/${sub}/comments/${threadId}/.rss?sort=top&limit=80`
  )
}

/**
 * 데일리 토론 스레드 자동 탐색 (2026-08-23 운영자: "각 게시판마다 데일리 스레드에서").
 * hot RSS 에서 제목에 daily 가 들어간 첫 스레드 — 예산 1건 소비하므로 --sub 모드는
 * 실행당 총 2건(hot + 스레드)을 쓴다. 사이에 65초를 쉰다.
 */
async function findDailyThreadViaVps(
  sub: string
): Promise<{ threadId: string; title: string } | null> {
  const xml = await fetchRedditRssViaVps(`https://www.reddit.com/r/${sub}/hot/.rss?limit=25`)
  for (const e of xml.split("<entry>").slice(1)) {
    const t = e.match(/<title>([\s\S]*?)<\/title>/)?.[1]
    const link = e.match(
      /href="https:\/\/www\.reddit\.com\/r\/[^/]+\/comments\/([a-z0-9]+)\//i
    )?.[1]
    if (!t || !link) continue
    const title = decodeEntities(t)
    // "Daily Discussion" 류만 — Match Thread(경기 불판)는 감상이 실시간 파편이라 제외
    if (/\bdaily\b/i.test(title) && !/match\s*(thread|day)/i.test(title)) {
      return { threadId: link, title }
    }
  }
  return null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#32;/g, " ")
    .replace(/&amp;/g, "&")
}

/** RSS → 후보 댓글 텍스트. 첫 entry(글 본문)·링크/짤 의존·너무 짧거나 긴 것 제외 */
function extractComments(xml: string): string[] {
  const entries = xml.split("<entry>").slice(2) // [0]=헤더, [1]=스레드 본문 글
  const out: string[] = []
  for (const e of entries) {
    const m = e.match(/<content type="html">([\s\S]*?)<\/content>/)
    if (!m) continue
    let t = decodeEntities(m[1])
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/submitted by\s+\/u\/.*$/i, "")
      .trim()
    // 링크·이미지가 본체인 댓글은 각색 재료가 못 된다
    if (/https?:\/\//.test(t)) continue
    if (t.length < 40 || t.length > 700) continue
    out.push(t)
    if (out.length >= 20) break
  }
  return out
}

interface SeedPost {
  title: string
  body: string
}

async function rewriteWithLlm(
  team: string,
  comments: string[],
  limit: number
): Promise<SeedPost[]> {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error("OPENAI_API_KEY 가 .env 에 없습니다")

  const sys = `너는 한국 축구 커뮤니티의 골수 ${team} 팬 유저다. 해외 팬 커뮤니티의 댓글들을 받아, 그중 좋은 것을 골라 **한국 축덕 말투의 짧은 게시글**로 각색한다.

## 채택 기준 (여기 걸리면 무조건 제외)
- **${team} 자기 팀 이야기만** — 타 팀·타 팬덤을 조롱/공격/도발하는 내용은 제외한다 (타 팀 언급 자체는 되지만, 비하가 본체면 탈락).
- **타 팀이 주인공인 것도 제외** — 타 팀 다큐 감상, 타 팀 선수 신변잡기처럼 ${team} 얘기가 아닌 것.
- 이적 루머·라인업 뇌피셜 등 **사실 주장이 본체인 것 제외** — 감상·의견·드립·추억·가벼운 질문만.
- 링크·짤 없이는 말이 안 되는 것 제외.
- **같이 떠들 수 있는 주제를 우선 채택** — 의견이 갈리거나, 질문이거나, 답글이 붙을 만한 것.
  혼잣말 감상보다 "너희는 어떻게 생각하냐"가 되는 재료가 좋다 (운영자 2026-08-23).

## 각색 규칙
- **번역이 아니라 각색** — 원문을 재료로 새로 쓴 글처럼. 원문 문장 구조를 따라가지 마라.
- 말투: 한국 축구 커뮤 반말체. "~냐", "~임", "~지", "ㅋㅋ" 허용. 이모지 금지. 존댓말 금지.
- **톤은 순한 맛** — 시비조·저격·욕설·과격한 표현 금지. 비판도 가볍고 유쾌하게, 다정한
  축덕 수다처럼 (운영자 2026-08-23: "말투를 너무 과격하게는 하지 말고").
- 제목: 구어체 한 줄 (낚시 금지, 물음/감탄형 환영). 본문: 1~3문장, 짧을수록 좋다.
- 선수·감독·구단 이름은 한국 축구 미디어 정착 표기만 쓴다. 예: Gyökeres→요케레스, Ødegaard→외데고르, Bournemouth→본머스, Tottenham→토트넘, Mertesacker→메르테자커. **음차가 확신이 안 서면 한글로 지어내지 말고 원어 그대로 둔다** (틀린 음차가 최악이다).
- 최대 ${limit}개만 골라라. 좋은 게 없으면 적게 골라도 된다.

JSON 으로만 답하라: {"posts":[{"title":"...","body":"..."}]}`

  const user = comments.map((c, i) => `[${i + 1}] ${c}`).join("\n\n")

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      // 직접 temperature/max_tokens 를 적지 않는다 — 모델 교체 시 400 (chatParams 규약)
      ...chatParams(MODEL, { temperature: 0.8, max_tokens: 2000 }),
    }),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as { choices: { message: { content: string } }[] }
  const parsed = JSON.parse(data.choices[0].message.content) as { posts?: SeedPost[] }
  return (parsed.posts ?? []).filter((p) => p.title?.trim() && p.body?.trim()).slice(0, limit)
}

async function main() {
  const args = process.argv.slice(2)
  const url = args.find((a) => !a.startsWith("--"))
  const doPost = args.includes("--post")
  const limit = Number(args.find((a) => a.startsWith("--limit="))?.slice(8) ?? 6)
  const boardArg = args.find((a) => a.startsWith("--board="))?.slice(8)
  const subArg = args.find((a) => a.startsWith("--sub="))?.slice(6)

  let sub: string
  let threadId: string
  if (subArg && !url) {
    // --sub 모드: 데일리 스레드 자동 탐색 (예산 2건 — hot 1 + 스레드 1, 사이 65초)
    sub = subArg
    const daily = await findDailyThreadViaVps(sub)
    if (!daily) {
      console.error(`r/${sub}: hot 상위 25개에서 데일리 스레드를 못 찾았습니다 — 건너뜀.`)
      process.exit(2)
    }
    console.log(`r/${sub} 데일리 발견: "${daily.title}" (${daily.threadId}) — 예산 대기 65초…`)
    await sleep(65_000)
    threadId = daily.threadId
  } else {
    const m = url?.match(/reddit\.com\/r\/([^/]+)\/comments\/([a-z0-9]+)/i)
    if (!m) {
      console.error(
        "사용법: pnpm exec tsx scripts/reddit-daily-seed.ts <레딧 스레드 URL 또는 --sub=서브레딧> [--limit=6] [--post]"
      )
      process.exit(1)
    }
    ;[, sub, threadId] = m
  }
  const mapped = SUB_MAP[sub.toLowerCase()]
  const team = mapped?.team ?? sub
  // --board 명시가 최우선, 없으면 서브레딧의 팀 게시판, 그것도 없으면 football
  const board = boardArg ?? mapped?.board ?? "football"

  console.log(
    `[r/${sub}] 스레드 ${threadId} → ${team} 팬 글 → /community/${board} (${doPost ? "실제 등록" : "미리보기"})`
  )
  const xml = await fetchThreadRssViaVps(sub, threadId)
  const comments = extractComments(xml)
  console.log(`후보 댓글 ${comments.length}건 → LLM 선별·각색 중 (${MODEL})…\n`)
  if (comments.length === 0) {
    console.error("각색할 댓글이 없습니다 (전부 링크/짤이거나 스레드가 한산).")
    process.exit(1)
  }

  const posts = await rewriteWithLlm(team, comments, limit)
  if (posts.length === 0) {
    console.error("LLM 이 채택한 댓글이 0건입니다 (타 팀 공격·루머만 있었을 수 있음).")
    process.exit(1)
  }

  posts.forEach((p, i) => {
    console.log(`── ${i + 1}. ${p.title}`)
    console.log(`   ${p.body.replace(/\n/g, " / ")}\n`)
  })

  if (!doPost) {
    console.log(`미리보기 ${posts.length}건 — 등록하려면 --post 를 붙여 다시 실행하세요.`)
    return
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  // 팀 말머리가 있으면 붙인다 (없으면 말머리 없이).
  // ⚠️ community_slug 필터 필수 — 종전엔 이름만 봐서 football 보드의 flair_id 가
  // 팀 게시판 글에 붙을 수 있었다 (팀 보드엔 말머리가 없으므로 결과는 "말머리 없음")
  const { data: flair } = await supabase
    .from("post_flairs")
    .select("id")
    .eq("community_slug", board)
    .eq("name", team)
    .limit(1)
    .maybeSingle()

  let inserted = 0
  for (const [i, p] of posts.entries()) {
    const { error } = await supabase.from("posts").insert({
      user_id: PERSONAS[i % PERSONAS.length],
      community_slug: board,
      title: p.title.slice(0, 200),
      content: textToTipTapJson(p.body),
      ...(flair?.id ? { flair_id: flair.id } : {}),
    })
    if (error) {
      console.error(`  등록 실패: ${p.title.slice(0, 40)} — ${error.message}`)
      continue
    }
    inserted++
  }
  console.log(`등록 완료: ${inserted}/${posts.length}건 → ${board} 게시판`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

#!/usr/bin/env node
/**
 * news-scanner.mjs — 축구 뉴스 스캐너 (결정적 스캔 + OpenAI 작성)
 *
 * 흐름: 5대리그+인기클럽 서브레딧 RSS(hot) → 잡담/오래됨/중복 컷 → OpenAI 가
 *      "축구 뉴스 vs 잡담"만 판별 + 한국어 작성 (신뢰도/중요도로 거르지 않음 — 사람 검수 몫)
 *      → 트윗이면 /api/oembed, 기사면 /api/og 로 보강 → /api/news/agent-draft 로 초안 적재.
 * 발행은 안 함. /admin/news-review 에서 사람이 검수·발행 (fail-closed).
 * 소스 목록·상한: SUBREDDITS / SCANNER_MAX_LLM(기본 30) / SCANNER_THROTTLE_MS(기본 6000).
 *
 * 단일 파일·무의존(Node18+). reddit 은 JSON 차단 → curl + RSS(Atom) 로 우회(기존 크롤러 방식).
 * Vultr cron 에서 `node news-scanner.mjs`.
 *
 * env: OPENAI_API_KEY, CRON_SECRET, BASE_URL(기본 https://gongnori.fan),
 *      SEEN_FILE(기본 ./news-scanner-seen.json), SCANNER_MODEL(기본 gpt-4o-mini)
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { execFileSync } from "node:child_process"

const BASE_URL = (process.env.BASE_URL || "https://gongnori.fan").replace(/\/$/, "")
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const CRON_SECRET = process.env.CRON_SECRET
const SEEN_FILE = process.env.SEEN_FILE || "./news-scanner-seen.json"
const MODEL = process.env.SCANNER_MODEL || "gpt-4o-mini"
// 원문 본문을 확보한 기사는 장문(500~1,000자)으로 쓴다 — 지시 이행이 더 정확한 모델 사용.
// 본문 없는 글은 기존 MODEL 로 짧게 (비용 유지).
const MODEL_LONG = process.env.SCANNER_MODEL_LONG || "gpt-4.1-mini"
const DRY_RUN = process.env.SCANNER_DRY_RUN === "1" // 초안 적재 없이 판별 로그만 (테스트용)

const LOOKBACK_HOURS = 24 // 이보다 오래된 글은 무시 (신선도)
const MAX_LLM_PER_RUN = Number(process.env.SCANNER_MAX_LLM || 30) // run 당 OpenAI 호출 상한 (비용 가드)
const RSS_LIMIT = 40
const THROTTLE_MS = Number(process.env.SCANNER_THROTTLE_MS || 6000) // 서브레딧 간 간격 (reddit rate limit 회피)
const UA = "gongnori.fan news-scanner/1.0"
// reddit 은 Node TLS 지문/JSON 을 차단 → curl + 브라우저 UA + RSS 로 우회 (기존 크롤러와 동일)
const REDDIT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

// 수집 소스: r/soccer 종합 + 5대리그 + 인기 클럽. 이적설만이 아니라 축구 뉴스 전반을 폭넓게 긁는다.
// 관련성/품질 판단은 사람 검수(/admin/news-review)로 이관 — 여기서는 명백한 잡담만 컷.
const SUBREDDITS = [
  "soccer",
  "PremierLeague",
  "LaLiga",
  "Bundesliga",
  "seriea",
  "ligue1",
  "Gunners",
  "LiverpoolFC",
  "reddevils",
  "chelseafc",
  "MCFC",
  "coys",
  "ManchesterUnited",
  "realmadrid",
  "Barca",
  "FCBayern",
]

// 잡담/스레드 컷
const SKIP_AUTHORS = new Set(["AutoModerator", "2soccer2bot", "MatchThreadder"])
const SKIP_PATTERNS = [
  /^daily discussion$/i,
  /^free talk/i,
  /match thread/i,
  /^monday moan/i,
  /^\[?(megathread|match thread)\]?/i,
  /weekly.*(thread|discussion|megathread)/i,
  /monthly.*(thread|discussion|megathread)/i,
  /^(meta|mod) (post|announcement)/i,
]

function log(...a) {
  console.log(`[${new Date().toISOString()}]`, ...a)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 한글 표기 교정 — gpt-4o-mini 가 자주 음차 오류를 내는 팀/선수명을 LLM 출력 후처리로 강제.
// 프롬프트만으론 반복 오역이 남아서(예: Bournemouth→"보르넘"), 마지막에 결정적으로 치환한다.
// 새 오표기를 발견하면 여기 한 줄만 추가하면 이후 전부 교정됨.
const KOREAN_FIXES = [
  [/보르넘|본머쓰|보른머스|본머프/g, "본머스"], // Bournemouth
]

/**
 * 레딧을 출처로 표기하지 않는다.
 *
 * 레딧은 소식을 **발견한 경로**이지 출처가 아니다. "[레딧] 아시아 투어 명단" 같은
 * 제목은 우리가 남의 글을 퍼온 것처럼 보이게 만든다(사용자 지적 2026-07-29).
 * 프롬프트로만 막으면 새는 걸 이미 겪었으므로(매체명 표기 사례) 코드에서 잘라낸다.
 */
function stripRedditAttribution(title) {
  if (typeof title !== "string") return title
  // 선두의 [레딧]/[Reddit]/[r/soccer] 류 제거 — 여러 번 붙어도 전부
  let out = title.replace(/^\s*(?:\[\s*(?:레딧|reddit|r\/[a-z0-9_]+)\s*\]\s*)+/gi, "")
  // "[레딧 - 로마노]" 처럼 안에 섞인 경우엔 레딧 부분만 덜어낸다
  out = out.replace(/\[\s*(?:레딧|reddit)\s*[-·|]\s*/gi, "[")
  return out.trim() || title.trim()
}
function applyKoreanFixes(s) {
  if (typeof s !== "string" || !s) return s
  let out = s
  for (const [re, to] of KOREAN_FIXES) out = out.replace(re, to)
  return out
}

function loadSeen() {
  try {
    if (existsSync(SEEN_FILE)) return new Set(JSON.parse(readFileSync(SEEN_FILE, "utf8")))
  } catch (e) {
    log("seen load 실패:", e.message)
  }
  return new Set()
}
function saveSeen(seen) {
  try {
    writeFileSync(SEEN_FILE, JSON.stringify([...seen].slice(-2000)))
  } catch (e) {
    log("seen save 실패:", e.message)
  }
}

// ── reddit RSS (Atom) ───────────────────────────────────────────────
function curlText(url) {
  return execFileSync(
    "curl",
    ["-s", "-L", "-H", `User-Agent: ${REDDIT_UA}`, "--max-time", "20", url],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
  )
}
function extractTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))
  return m ? m[1].trim() : null
}
function extractAttr(xml, tag, attr) {
  const m = xml.match(new RegExp(`<${tag}[^>]*${attr}="([^"]*)"[^>]*/?>`))
  return m ? m[1] : null
}
function extractNestedTag(xml, parent, child) {
  const pm = xml.match(new RegExp(`<${parent}>[\\s\\S]*?<\\/${parent}>`))
  return pm ? extractTag(pm[0], child) : null
}
function decodeHTML(str) {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
}
function parseAtomFeed(xml) {
  const entries = []
  const re = /<entry>([\s\S]*?)<\/entry>/g
  let m
  while ((m = re.exec(xml)) !== null) {
    const block = m[1]
    const id = (extractTag(block, "id") || "").replace("t3_", "")
    const title = decodeHTML(extractTag(block, "title") || "")
    const link = extractAttr(block, "link", "href") || ""
    const published = extractTag(block, "published") || extractTag(block, "updated") || ""
    const author = extractNestedTag(block, "author", "name") || ""
    // content HTML 안의 [link] 앵커에서 외부 URL 추출
    const content = decodeHTML(extractTag(block, "content") || "")
    let contentLink = null
    const lm = content.match(/\[link\]<\/a>/)
    if (lm) {
      const hm = content.slice(0, lm.index).match(/href="([^"]+)"[^>]*>\s*$/)
      if (hm && !hm[1].includes("reddit.com/r/")) contentLink = hm[1]
    }
    entries.push({ id, title, permalink: link, url: contentLink, author, published })
  }
  return entries
}
function fetchSubreddit(sub) {
  const url = `https://www.reddit.com/r/${sub}/hot.rss?limit=${RSS_LIMIT}`
  let xml
  try {
    xml = curlText(url)
  } catch {
    throw new Error(`curl reddit 실패 (r/${sub})`)
  }
  if (!xml || !xml.includes("<entry")) throw new Error(`RSS 차단/비정상 응답 (r/${sub})`)
  return parseAtomFeed(xml).map((e) => ({ ...e, subreddit: sub }))
}

// ── 소스 분류 ───────────────────────────────────────────────────────
function isExternalArticle(u) {
  try {
    const h = new URL(u).hostname.replace(/^www\./, "")
    if (/reddit\.com|redd\.it|x\.com|twitter\.com|youtube\.com|youtu\.be|instagram\.com/.test(h))
      return false
    if (/\.(jpg|jpeg|png|gif|webp|mp4|gifv)$/i.test(u)) return false
    return true
  } catch {
    return false
  }
}
function isTweet(u) {
  return /(?:twitter\.com|x\.com)\/\w+\/status(?:es)?\/\d+/i.test(u || "")
}

// ── 기사 원문 본문 추출 ──────────────────────────────────────────────
// 왜: LLM 에 제목·링크만 주면 2~3문장짜리 껍데기 기사밖에 안 나온다("제목밖에 없다").
// 원문 문단을 팩트 재료로 주면 인용·이적료·계약기간·일정까지 담긴 기사가 된다.
// readability 라이브러리 없이 <p> 수집 + 보일러플레이트 컷으로 최소 구현.
const BOILERPLATE_P =
  /cookie|subscri|newsletter|sign up|sign in|log in|all rights reserved|privacy policy|terms of (use|service)|follow us|download the app|advertis|getty images|©|enable javascript|update your browser|whitelist your extensions|verify (that )?you are|are you a robot|captcha|browser (check|settings)|ad blocker|please disable/i

function extractArticleText(html) {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<template[\s\S]*?<\/template>/gi, "")

  const paragraphs = []
  const pRegex = /<p\b[^>]*>([\s\S]*?)<\/p>/gi
  let m
  let total = 0
  while ((m = pRegex.exec(stripped)) !== null && total < 2800) {
    const text = decodeHTML(m[1].replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim()
    if (text.length < 40 || BOILERPLATE_P.test(text)) continue
    paragraphs.push(text)
    total += text.length
  }
  return paragraphs.length ? paragraphs.join("\n").slice(0, 2800) : null
}

/**
 * 기사 URL → 본문 앞부분(~2,800자). 실패(페이월·JS렌더·차단)하면 null —
 * 그 경우 기존처럼 짧은 기사로 나간다 (팩트 없이 길이를 늘리면 환각이다).
 */
async function fetchArticleBody(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": REDDIT_UA },
      signal: AbortSignal.timeout(12000),
      redirect: "follow",
    })
    if (!res.ok) return null
    // 뉴스 사이트는 헤더/스크립트 프리앰블이 커서 본문 <p> 가 한참 뒤에 나온다
    // (BBC 실측 첫 <p> 가 157KB 지점) → 450KB 까지 읽는다.
    const reader = res.body.getReader()
    let html = ""
    while (html.length < 450000) {
      const { done, value } = await reader.read()
      if (done) break
      html += new TextDecoder().decode(value)
    }
    reader.cancel()
    return extractArticleText(html)
  } catch {
    return null
  }
}

/** OpenAI: 게시할 만한 신선한 주요 이적설인지 판별 + 한국어 초안 작성 (JSON) */
async function judgeAndWrite(post, examples = [], articleBody = null) {
  const sourceKind = isTweet(post.url) ? "tweet" : isExternalArticle(post.url) ? "article" : "none"
  // few-shot — 검수자가 실제로 고친 사례를 예시로 주입해 표기/스타일을 학습시킨다.
  const fewshot = examples.length
    ? `\n\n## 최근 검수 교정 예시 (원본 → 발행본)\n검수자가 아래처럼 다듬었다. 같은 표기·스타일(특히 팀·선수·기자명 한글 표기)을 따르라:\n${examples
        .map((e) => `- "${e.from}" → "${e.to}"`)
        .join("\n")}`
    : ""
  const sys = `너는 한국 축구 커뮤니티의 뉴스 에디터다. 레딧 축구 글 하나를 받아 "정보성 축구 소식인가 vs 순수 잡담인가"만 가른다. 기본값은 통과(worthy=true)이고, 애매하면 통과시킨다. 최종 취사선택은 사람 편집자가 검수에서 한다.

worthy=true (폭넓게): 이적·영입·계약·부상·복귀·감독 선임/경질·경기 결과·기록·수상/후보·공식 발표·구단/선수 근황·유망주·한국 선수 등 축구와 관련해 사실 정보가 담긴 것이면 전부. 무명 선수·유망주·미확정 루머·낮은 신뢰도도 관련 있으면 통과. 신뢰도/중요도가 낮다고 버리지 마라 — 그 판단은 사람 몫이다.

worthy=false (좁게, 정보가 0인 것만): 순수 밈·짤·GIF·팬아트·움짤, 정보 없는 단순 감탄/응원("wow", "amazing"), 개인 SNS 좋아요/반응 캡처, 라이브 경기 중계 스레드, 설문/의견 질문글, 오래된 떡밥 재탕. 애매하면 false 말고 true.

- 톤: 한국어, 드라이한 팩트 와이어체("~라고 합니다", "~로 전해집니다"). AI 티 나는 감상/질문/평가 금지.
- 분량은 **주어진 재료의 양**으로 정한다:
  · 아래 "기사 원문"이 있으면 → **6~12문장, 500~1,000자**. 발언 인용, 이적료·계약 기간·경기 기록 같은 수치, 배경 경위, 다음 일정까지 원문에 있는 디테일을 충실히 옮긴다. 문단은 빈 줄로 나눈다. 두세 줄 요약으로 끝내지 마라.
  · 원문이 없으면(제목·링크뿐) → 기존대로 **2~3문장**. **재료가 없는데 길이를 채우려고 상상으로 살을 붙이는 것이 최악이다** — 짧은 게 맞다.
- 기사 원문에 없는 사실은 절대 추가하지 않는다. 원문 말미의 무관한 조각(다른 경기 홍보·구독 안내)은 무시한다.
- 제목: 출처가 **분명할 때만** "[출처] 핵심" 형식 (예: "[로마노] 아스날, OOO 영입 추진").
  출처로 쓸 수 있는 것은 **기자·언론사·구단** 뿐이다.
  ⛔ **레딧은 출처가 아니다.** 우리가 소식을 발견한 경로일 뿐이므로 "[레딧]", "[Reddit]",
  "[r/soccer]" 같은 표기는 절대 쓰지 마라. 출처가 불명확하면 **대괄호 없이 제목만** 써라
  (예: "아시아 투어 참가 선수 명단 공개").
- 팀/선수 한글 표기는 한국 축구 미디어의 정착된 표기를 따른다 (예: Bournemouth=본머스, Tottenham=토트넘, Wolverhampton=울버햄튼). 억지 음차 금지. 확신 없으면 영문 원어를 그대로 쓴다.
- 미확정 루머는 단정하지 말 것.
- credibility/importance 는 1~5로 매기되(검수자 참고용), 이 값으로 worthy 를 정하지는 마라.${fewshot}
JSON 으로만 답하라: {"worthy":bool,"reason":str,"title":str,"summary":str,"tags":[str],"credibility":1-5,"importance":1-5}`
  const user = `제목: ${post.title}
출처유형: ${sourceKind}
링크: ${post.url || "(없음/self)"}${
    articleBody ? `\n\n## 기사 원문 (영어, 발췌)\n${articleBody}` : ""
  }`

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(articleBody ? 60000 : 30000),
    body: JSON.stringify({
      model: articleBody ? MODEL_LONG : MODEL,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    }),
  })
  if (!res.ok) throw new Error(`openai ${res.status}: ${await res.text().catch(() => "")}`)
  const data = await res.json()
  return JSON.parse(data.choices[0].message.content)
}

/** 트윗 → oembed 임베드 노드 */
async function buildTweetEmbed(url) {
  const res = await fetch(`${BASE_URL}/api/oembed?url=${encodeURIComponent(url)}&includeHtml=true`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) return null
  const d = await res.json().catch(() => null)
  if (!d?.html) return null
  return {
    type: "embed",
    attrs: {
      url: d.url || url,
      html: d.html,
      provider: d.provider || "x",
      title: d.title || null,
      thumbnail_url: d.thumbnail_url || null,
      author_name: d.author_name || null,
    },
  }
}

/** 기사 → og 이미지 노드 + 요약 */
async function buildArticleOg(url) {
  const res = await fetch(`${BASE_URL}/api/og?url=${encodeURIComponent(url)}&summarize=1`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) return {}
  const d = await res.json().catch(() => ({}))
  return { imageNode: d?.image ? { type: "image", attrs: { src: d.image } } : null, ogSummary: d?.summary || null }
}

function buildContent(summary, mediaNode) {
  const paras = String(summary || "")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((t) => ({ type: "paragraph", content: [{ type: "text", text: t }] }))
  const content = [...paras]
  if (mediaNode) content.push(mediaNode)
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] }
}

/** few-shot 학습용 — 검수자가 제목을 고친 최근 사례(원본→발행본) 조회 */
async function fetchCorrectionExamples() {
  if (!CRON_SECRET) return []
  try {
    const res = await fetch(`${BASE_URL}/api/news/correction-examples`, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return []
    const d = await res.json().catch(() => ({}))
    return Array.isArray(d?.examples) ? d.examples : []
  } catch {
    return []
  }
}

async function postDraft(payload) {
  const res = await fetch(`${BASE_URL}/api/news/agent-draft`, {
    method: "POST",
    headers: { Authorization: `Bearer ${CRON_SECRET}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify(payload),
  })
  const d = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, d }
}

async function main() {
  if (!OPENAI_API_KEY || (!CRON_SECRET && !DRY_RUN)) {
    log("환경변수 누락: OPENAI_API_KEY / CRON_SECRET 필요 (DRY_RUN 시 CRON_SECRET 생략 가능)")
    process.exit(1)
  }
  const seen = loadSeen()
  const cutoff = Date.now() - LOOKBACK_HOURS * 3600 * 1000

  // 모든 소스에서 신규 후보 수집. 키워드(이적) 컷은 제거 — 축구 뉴스 전반을 폭넓게.
  // 밈/스레드/사담만 SKIP_PATTERNS·SKIP_AUTHORS 로 1차 컷, 나머지 판단은 LLM+사람 검수.
  const candidates = []
  const dedup = new Set()
  let fetchedSubs = 0
  for (const sub of SUBREDDITS) {
    let entries
    try {
      entries = fetchSubreddit(sub)
      fetchedSubs++
    } catch (e) {
      log(`fetch 실패 (r/${sub}):`, e.message)
      await sleep(THROTTLE_MS)
      continue
    }
    for (const p of entries) {
      if (!p.id || seen.has(p.id) || dedup.has(p.id)) continue // 크로스포스트 중복 방지
      if (SKIP_AUTHORS.has(p.author)) continue
      if (SKIP_PATTERNS.some((re) => re.test(p.title))) continue
      if (p.published && new Date(p.published).getTime() < cutoff) continue
      dedup.add(p.id)
      candidates.push(p)
    }
    await sleep(THROTTLE_MS)
  }
  if (fetchedSubs === 0) {
    log("모든 소스 fetch 실패 — reddit 차단 의심")
    process.exit(1)
  }
  log(
    `${fetchedSubs}/${SUBREDDITS.length}개 소스 → 신규 후보 ${candidates.length}개 (LLM 상한 ${MAX_LLM_PER_RUN})`
  )

  // 검수 교정 예시 로드 (few-shot 학습) — 실패해도 스캔은 계속
  const corrections = await fetchCorrectionExamples()
  if (corrections.length) log(`검수 교정 예시 ${corrections.length}건 로드 (few-shot)`)

  let drafted = 0
  let llmCalls = 0
  let skippedNoSource = 0
  for (const p of candidates) {
    if (llmCalls >= MAX_LLM_PER_RUN) break
    seen.add(p.id) // 한 번 본 글은 worthy 여부 무관 재처리 안 함 (비용/중복 방지)

    // ── 출처 없는 글은 기사로 만들지 않는다 (사용자 결정 2026-07-29) ──────────
    // 레딧은 발견 경로일 뿐 출처가 아니다. 원문 기사도 기자 트윗도 없는 글
    // (레딧 자체글·짤·하이라이트 영상)은 결국 "레딧글을 퍼온 것"이 된다.
    // 실측: 대기 139건 중 34건(24%)이 여기 해당했고, 출처가 성립하는 104건은 남는다.
    // LLM 호출 **전에** 걸러 비용도 아낀다.
    if (!isExternalArticle(p.url) && !isTweet(p.url)) {
      skippedNoSource++
      log(`skip(출처없음) [${p.subreddit}/${p.id}] ${p.title?.slice(0, 50)}`)
      continue
    }

    llmCalls++
    try {
      // 외부 기사면 원문 본문을 먼저 확보한다 — 이게 있어야 장문 기사가 나온다.
      // "오늘의 떡밥"(홈 카드뉴스)에 뜨는 건 이미지가 붙는 기사형이라, 장문이 필요한
      // 대상과 원문을 가져올 수 있는 대상이 자연히 일치한다. 트윗/셀프글은 대상 아님.
      const articleBody = isExternalArticle(p.url) ? await fetchArticleBody(p.url) : null
      const v = await judgeAndWrite(p, corrections, articleBody)
      if (!v?.worthy) {
        log(`skip [${p.subreddit}/${p.id}] ${p.title?.slice(0, 50)} — ${v?.reason || "not worthy"}`)
        continue
      }
      v.title = stripRedditAttribution(applyKoreanFixes(v.title))
      v.summary = applyKoreanFixes(v.summary)
      if (DRY_RUN) {
        drafted++
        log(
          `[DRY] draft [${p.subreddit}/${p.id}] ${v.title} — 본문 ${
            articleBody ? `${articleBody.length}자 확보` : "없음"
          } / 기사 ${(v.summary || "").length}자\n${v.summary}\n`
        )
        continue
      }
      let mediaNode = null
      let summary = v.summary
      if (isTweet(p.url)) {
        mediaNode = await buildTweetEmbed(p.url)
      } else if (isExternalArticle(p.url)) {
        const { imageNode, ogSummary } = await buildArticleOg(p.url)
        mediaNode = imageNode
        if (ogSummary && (summary || "").length < 40) summary = ogSummary
      }
      const r = await postDraft({
        title: v.title,
        content: buildContent(summary, mediaNode),
        source_url: p.url && /^https?:/.test(p.url) ? p.url : undefined,
        origin_url: p.permalink || undefined,
        tags: Array.isArray(v.tags) ? v.tags.slice(0, 10) : [],
        scores: { credibility: v.credibility, importance: v.importance },
        dedupe_key: `reddit:${p.id}`,
      })
      if (r.ok) {
        drafted++
        log(`draft ✓ [${p.subreddit}/${p.id}] ${v.title}${r.d?.deduped ? " (중복)" : ""}`)
      } else {
        log(`draft ✗ [${p.subreddit}/${p.id}] ${r.status}`, r.d?.error || "")
      }
    } catch (e) {
      log(`error [${p.subreddit}/${p.id}]`, e.message)
    }
  }

  saveSeen(seen)
  log(
    `완료: 후보 ${candidates.length}, 출처없음 제외 ${skippedNoSource}건, LLM ${llmCalls}회, 초안 ${drafted}건`
  )
}

main().catch((e) => {
  log("치명적 오류:", e.stack || e.message)
  process.exit(1)
})

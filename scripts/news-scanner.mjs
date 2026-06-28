#!/usr/bin/env node
/**
 * news-scanner.mjs — r/soccer 이적설 스캐너 (B1: 결정적 스캔 + OpenAI 작성)
 *
 * 흐름: r/soccer RSS(hot) → 잡담/오래됨/중복 컷 + 키워드 → OpenAI 가 판별+한국어 작성
 *      → 트윗이면 /api/oembed, 기사면 /api/og 로 보강 → /api/news/agent-draft 로 초안 적재.
 * 발행은 안 함. /admin/news-review 에서 사람이 검수·발행 (fail-closed).
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

const LOOKBACK_HOURS = 24 // 이보다 오래된 글은 무시 (신선도)
const MAX_LLM_PER_RUN = 8 // run 당 OpenAI 호출 상한 (비용 가드)
const RSS_LIMIT = 50
const UA = "gongnori.fan news-scanner/1.0"
// reddit 은 Node TLS 지문/JSON 을 차단 → curl + 브라우저 UA + RSS 로 우회 (기존 크롤러와 동일)
const REDDIT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

// 이적설 가능성 키워드 (LLM 호출 전 1차 컷)
const KEYWORDS =
  /\b(transfer|sign(ing|ed|s)?|deal|bid|fee|medical|agreement|agreed|loan|contract|join|move|talks|here we go|release clause|personal terms|swoop|target|wages|verbal|€|£|\$\d|million)\b/i

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
function fetchReddit() {
  const url = `https://www.reddit.com/r/soccer/hot.rss?limit=${RSS_LIMIT}`
  let xml
  try {
    xml = curlText(url)
  } catch {
    throw new Error("curl reddit 실패")
  }
  if (!xml || !xml.includes("<entry")) throw new Error("RSS 차단/비정상 응답 (entry 없음)")
  return parseAtomFeed(xml)
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

/** OpenAI: 게시할 만한 신선한 주요 이적설인지 판별 + 한국어 초안 작성 (JSON) */
async function judgeAndWrite(post) {
  const sourceKind = isTweet(post.url) ? "tweet" : isExternalArticle(post.url) ? "article" : "none"
  const sys = `너는 한국 축구 커뮤니티의 이적시장 뉴스 에디터다. r/soccer 글 하나를 받아 판단한다.
- 게시 기준: 실제 이적 관련 "새 소식"이고, 공신력 있는 출처(Fabrizio Romano, David Ornstein, 주요 언론 등)이거나 중요한 루머일 것. 단순 잡담/밈/경기 스레드/오래된 떡밥/사담은 worthy=false.
- 톤: 한국어, 드라이한 팩트 와이어체("~라고 합니다", "~로 전해집니다"). AI 티 나는 감상/질문/평가 금지. 2~3문장.
- 제목: "[출처] 핵심" 형식 (예: "[로마노] 아스날, OOO 영입 추진"). 출처는 기자/언론사명.
- 미확정 루머는 단정하지 말 것.
JSON 으로만 답하라: {"worthy":bool,"reason":str,"title":str,"summary":str,"tags":[str],"credibility":1-5,"importance":1-5}`
  const user = `제목: ${post.title}
출처유형: ${sourceKind}
링크: ${post.url || "(없음/self)"}`

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      model: MODEL,
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
  if (!OPENAI_API_KEY || !CRON_SECRET) {
    log("환경변수 누락: OPENAI_API_KEY / CRON_SECRET 필요")
    process.exit(1)
  }
  const seen = loadSeen()
  const cutoff = Date.now() - LOOKBACK_HOURS * 3600 * 1000
  let entries
  try {
    entries = fetchReddit()
  } catch (e) {
    log("reddit fetch 실패:", e.message)
    process.exit(1)
  }

  const candidates = entries.filter((p) => {
    if (!p.id || seen.has(p.id)) return false
    if (SKIP_AUTHORS.has(p.author)) return false
    if (SKIP_PATTERNS.some((re) => re.test(p.title))) return false
    if (p.published && new Date(p.published).getTime() < cutoff) return false
    if (!KEYWORDS.test(p.title)) return false
    return true
  })
  log(`RSS ${entries.length}개 → 후보 ${candidates.length}개 (LLM 상한 ${MAX_LLM_PER_RUN})`)

  let drafted = 0
  let llmCalls = 0
  for (const p of candidates) {
    if (llmCalls >= MAX_LLM_PER_RUN) break
    seen.add(p.id) // 한 번 본 글은 worthy 여부 무관 재처리 안 함 (비용/중복 방지)
    llmCalls++
    try {
      const v = await judgeAndWrite(p)
      if (!v?.worthy) {
        log(`skip [${p.id}] ${p.title?.slice(0, 50)} — ${v?.reason || "not worthy"}`)
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
        dedupe_key: `soccer:${p.id}`,
      })
      if (r.ok) {
        drafted++
        log(`draft ✓ [${p.id}] ${v.title}${r.d?.deduped ? " (중복)" : ""}`)
      } else {
        log(`draft ✗ [${p.id}] ${r.status}`, r.d?.error || "")
      }
    } catch (e) {
      log(`error [${p.id}]`, e.message)
    }
  }

  saveSeen(seen)
  log(`완료: 후보 ${candidates.length}, LLM ${llmCalls}회, 초안 ${drafted}건`)
}

main().catch((e) => {
  log("치명적 오류:", e.stack || e.message)
  process.exit(1)
})

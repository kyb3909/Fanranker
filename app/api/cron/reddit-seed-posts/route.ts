import { NextResponse } from "next/server"
import { verifyCronSecret } from "@/lib/cron-auth"
import { withCronLog } from "@/lib/cron/log-run"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { decodeHtmlEntities } from "@/lib/decode-html-entities"
import { chatParams } from "@/lib/llm/openai-params"

export const maxDuration = 60
export const dynamic = "force-dynamic"

// ── 설정 ──────────────────────────────────────────────────

const SOURCES = [
  { subreddit: "soccer", communitySlug: "football", botUserId: "user_bot_soccer_kr" },
  { subreddit: "nba", communitySlug: "basketball", botUserId: "user_bot_nba_kr" },
] as const

const MAX_NEW_PER_SOURCE = 5
const REDDIT_BASE = "https://www.reddit.com"
const USER_AGENT = "GongnoriSeedBot/1.0"
const OPENAI_MODEL = "gpt-4o"

// ── Reddit RSS 파싱 ───────────────────────────────────────

interface RssEntry {
  id: string
  title: string
  link: string
  author: string
  published: string
}

function parseAtomFeed(xml: string): RssEntry[] {
  const entries: RssEntry[] = []
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g
  let match

  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[1]
    const id = extractTag(block, "id") || ""
    const title = decodeHTML(extractTag(block, "title") || "")
    const link = extractAttr(block, "link", "href") || ""
    const published = extractTag(block, "published") || extractTag(block, "updated") || ""
    const author = extractNestedTag(block, "author", "name") || ""
    entries.push({ id, title, link, author, published })
  }
  return entries
}

function extractTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))
  return m ? m[1].trim() : null
}

function extractAttr(xml: string, tag: string, attr: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*${attr}="([^"]*)"[^>]*/?>`))
  return m ? m[1] : null
}

function extractNestedTag(xml: string, parent: string, child: string): string | null {
  const parentM = xml.match(new RegExp(`<${parent}>[\\s\\S]*?<\\/${parent}>`))
  if (!parentM) return null
  return extractTag(parentM[0], child)
}

function decodeHTML(str: string): string {
  return decodeHtmlEntities(str)
}

// 스킵 패턴 (자동 생성 스레드, 스티키 등)
const SKIP_AUTHORS = new Set(["AutoModerator", "2soccer2bot", "MatchThreadder"])
const SKIP_PATTERNS = [
  /^daily discussion$/i,
  /^free talk/i,
  /^match thread/i,
  /^post.?match thread/i,
  /^\[match thread\]/i,
  /^weekly.*(thread|discussion|megathread)/i,
  /^game thread/i,
  /^post game thread/i,
  /^(meta|mod) (post|announcement)/i,
]

function extractRedditId(entry: RssEntry): string {
  // id 형식: t3_xxxxx
  return entry.id.replace("t3_", "")
}

async function fetchSubredditHot(subreddit: string, limit: number): Promise<RssEntry[]> {
  const url = `${REDDIT_BASE}/r/${subreddit}/hot.rss?limit=${limit}`
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  })

  if (!res.ok) {
    throw new Error(`RSS fetch failed for r/${subreddit}: ${res.status}`)
  }

  const xml = await res.text()
  const entries = parseAtomFeed(xml)

  // 24시간 이내 게시물만, 자동 스레드 제외
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  return entries.filter((entry) => {
    if (SKIP_AUTHORS.has(entry.author)) return false
    if (SKIP_PATTERNS.some((p) => p.test(entry.title))) return false
    if (entry.published && new Date(entry.published).getTime() < cutoff) return false
    return true
  })
}

// ── OpenAI 번역 ───────────────────────────────────────────

interface TranslatedPost {
  title: string
  body: string
}

async function translateWithOpenAI(
  originalTitle: string,
  subreddit: string,
  communitySlug: string
): Promise<TranslatedPost | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error("[reddit-seed] OPENAI_API_KEY not set")
    return null
  }

  const sportName = communitySlug === "football" ? "축구" : "농구"

  const systemPrompt = `너는 한국 ${sportName} 커뮤니티에서 활동하는 열정적인 팬이야.
Reddit r/${subreddit}의 인기 게시물을 보고 영감을 받아 한국어 커뮤니티 게시글을 작성해.

규칙:
- 제목: 한국 커뮤니티 스타일로 자연스럽게 (번역투 금지, 30자 이내)
- 본문: 3~5문단, 한국 팬이 직접 쓴 것처럼 자연스러운 문체
- 의견이나 질문을 섞어서 토론을 유도해
- 선수/팀 이름은 한국에서 통용되는 표기 사용
- "레딧", "Reddit", "번역" 같은 단어 절대 사용 금지
- 마크다운 금지, 순수 텍스트만`

  const userPrompt = `다음 Reddit 게시물 제목을 보고 한국 ${sportName} 커뮤니티에 올릴 게시글을 작성해줘.

원문 제목: "${originalTitle}"

JSON으로 응답해:
{"title": "한국어 제목", "body": "본문 내용"}`

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        ...chatParams(OPENAI_MODEL, { temperature: 0.8, max_tokens: 1000 }),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error(`[reddit-seed] OpenAI error ${res.status}:`, errText)
      return null
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return null

    const parsed = JSON.parse(content) as TranslatedPost
    if (!parsed.title || !parsed.body) return null

    return parsed
  } catch (err) {
    console.error("[reddit-seed] OpenAI request failed:", err)
    return null
  }
}

// ── TipTap JSON 변환 ─────────────────────────────────────

function textToTipTapJson(text: string) {
  const paragraphs = text
    .trim()
    .split(/\n\n+/)
    .filter((p) => p.trim())
    .slice(0, 20)

  const blocks = paragraphs.map((p) => ({
    type: "paragraph" as const,
    content: [{ type: "text" as const, text: p.trim() }],
  }))

  return { type: "doc", content: blocks }
}

// ── 메인 핸들러 ───────────────────────────────────────────

async function cronGet(request: Request) {
  const authError = verifyCronSecret(request)
  if (authError) return authError

  const supabase = createServiceRoleClient()
  const results: {
    source: string
    inserted: number
    skipped: number
    errors: number
    errorDetails: string[]
  }[] = []

  // 모든 소스를 병렬 처리
  const sourceResults = await Promise.all(
    SOURCES.map(async (source) => {
      const stat = {
        source: source.subreddit,
        inserted: 0,
        skipped: 0,
        errors: 0,
        errorDetails: [] as string[],
      }

      try {
        // 1. Reddit에서 인기글 가져오기
        const entries = await fetchSubredditHot(source.subreddit, 15)
        console.log(`[reddit-seed] r/${source.subreddit}: ${entries.length}개 fetch`)

        if (entries.length === 0) return stat

        // 2. 이미 시딩된 reddit_id 조회
        const redditIds = entries.map((e) => extractRedditId(e))
        const { data: existing } = await supabase
          .from("seeded_reddit_posts")
          .select("reddit_id")
          .in("reddit_id", redditIds)

        const existingIds = new Set((existing ?? []).map((r) => r.reddit_id))

        // 3. 새 글만 필터 (최대 MAX_NEW_PER_SOURCE개)
        const newEntries = entries
          .filter((e) => !existingIds.has(extractRedditId(e)))
          .slice(0, MAX_NEW_PER_SOURCE)

        console.log(`[reddit-seed] r/${source.subreddit}: ${newEntries.length}개 새 글`)

        // 4. 번역을 병렬 처리
        const translations = await Promise.all(
          newEntries.map(async (entry) => {
            const translated = await translateWithOpenAI(
              entry.title,
              source.subreddit,
              source.communitySlug
            )
            return { entry, translated }
          })
        )

        // 5. DB 삽입은 순차 처리 (순서 보장)
        for (const { entry, translated } of translations) {
          const redditId = extractRedditId(entry)

          if (!translated) {
            stat.errors++
            stat.errorDetails.push(`translate_fail: ${entry.title.slice(0, 50)}`)
            continue
          }

          const content = textToTipTapJson(translated.body)

          const { data: post, error: postError } = await supabase
            .from("posts")
            .insert({
              user_id: source.botUserId,
              community_slug: source.communitySlug,
              title: translated.title.slice(0, 200),
              content,
            })
            .select("id")
            .single()

          if (postError) {
            console.error(`[reddit-seed] post insert error:`, postError.message)
            stat.errors++
            stat.errorDetails.push(`post_insert: ${postError.message}`)
            continue
          }

          const { error: trackError } = await supabase.from("seeded_reddit_posts").insert({
            reddit_id: redditId,
            subreddit: source.subreddit,
            community_slug: source.communitySlug,
            post_id: post.id,
            original_title: entry.title.slice(0, 500),
          })

          if (trackError) {
            console.error(`[reddit-seed] tracking insert error:`, trackError.message)
          }

          stat.inserted++
          console.log(`[reddit-seed] ✓ r/${source.subreddit}: ${translated.title}`)
        }

        stat.skipped = entries.length - newEntries.length - stat.errors
      } catch (err) {
        console.error(`[reddit-seed] r/${source.subreddit} error:`, err)
        stat.errors++
      }

      return stat
    })
  )

  results.push(...sourceResults)

  const totalInserted = results.reduce((s, r) => s + r.inserted, 0)
  const totalErrors = results.reduce((s, r) => s + r.errors, 0)

  console.log(`[reddit-seed] 완료: ${totalInserted}개 등록, ${totalErrors}개 에러`)

  return NextResponse.json({
    ok: true,
    results,
    summary: { inserted: totalInserted, errors: totalErrors },
  })
}

export const GET = withCronLog("reddit-seed-posts", cronGet)

// data/agents/core/reddit-fetch.js
//
// Phase A 전용 Reddit RSS fetcher. Node 18+ native fetch 사용.
// legacy data/crawlers/core/reddit-fetcher.js와 의도적으로 분리:
// - Phase A는 JSON fallback / og:image 크롤 불필요
// - execSync(curl) 기반 구현은 Windows cmd.exe에서 인자 파싱이 깨짐
// - Self-contained: Phase A 스카웃은 legacy를 건드리지 않는다
//
// Usage:
//   import { fetchRedditViaRSS } from './reddit-fetch.js'
//   const posts = await fetchRedditViaRSS('soccer', { maxArticles: 25 })

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const REDDIT_BASE = 'https://www.reddit.com'

const SKIP_AUTHORS = new Set(['AutoModerator', '2soccer2bot', 'MatchThreadder'])

// fetcher 단계에서 곧바로 버리는 가벼운 패턴들.
// config/subreddits.json의 title_drop_patterns와 별도 — 이건 레딧 포맷 특유의 쓰레기.
const SKIP_PATTERNS = [
  /^daily discussion$/i,
  /^free talk/i,
  /^match thread/i,
  /^post.?match thread/i,
  /^monday moan/i,
  /^change my view/i,
  /^\[match thread\]/i,
  /^weekly.*(thread|discussion|megathread)/i,
  /^monthly.*(thread|discussion|megathread)/i,
  /^(meta|mod) (post|announcement)/i,
  /^\[megathread\]/i,
]

/**
 * @param {string} subreddit - "soccer" 등 (r/ 접두사 제외)
 * @param {{maxArticles?: number, lookbackHours?: number, timeoutMs?: number}} [opts]
 * @returns {Promise<Array>}
 */
export async function fetchRedditViaRSS(
  subreddit,
  { maxArticles = 25, lookbackHours = 24, timeoutMs = 20000 } = {}
) {
  // Fetch 3배 만큼 요청해서 필터 여지 확보 (상한 100)
  const limit = Math.min(maxArticles * 3, 100)
  const url = `${REDDIT_BASE}/r/${subreddit}/hot.rss?limit=${limit}`

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!res.ok) {
    throw new Error(`Reddit RSS /r/${subreddit} returned HTTP ${res.status}`)
  }

  const xml = await res.text()
  if (xml.includes('<body class=theme-beta>') || xml.includes('<!doctype html')) {
    throw new Error(`Reddit RSS /r/${subreddit} blocked (likely TLS fingerprint)`)
  }

  const entries = parseAtomFeed(xml)
  const cutoff = Date.now() - lookbackHours * 60 * 60 * 1000

  const filtered = entries
    .filter((e) => {
      if (SKIP_AUTHORS.has(e.author)) return false
      if (SKIP_PATTERNS.some((p) => p.test(e.title))) return false
      if (e.published && new Date(e.published).getTime() < cutoff) return false
      return true
    })
    .slice(0, maxArticles)

  return filtered.map((e) => ({
    external_id: e.id.replace('t3_', ''),
    external_url: e.link,
    original_title: e.title,
    link_url: e.contentLink || null,
    media_type: e.mediaType || null,
    author: e.author,
    posted_at: e.published || new Date().toISOString(),
    // RSS는 제공 안 함
    score: 0,
    num_comments: 0,
    flair: null,
  }))
}

// ============================================================================
// Atom feed parser (regex 기반, XML 라이브러리 불필요)
// ============================================================================

function parseAtomFeed(xml) {
  const entries = []
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g
  let match

  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[1]

    const id = extractTag(block, 'id') || ''
    const title = decodeHTML(extractTag(block, 'title') || '')
    const link = extractAttr(block, 'link', 'href') || ''
    const published =
      extractTag(block, 'published') || extractTag(block, 'updated') || ''
    const author = extractNestedTag(block, 'author', 'name') || ''

    // content 안에서 [link] 태그를 찾아 외부 article URL 추출
    const rawContent = extractTag(block, 'content') || ''
    const content = decodeHTML(rawContent)
    let contentLink = null
    const linkMatch = content.match(/\[link\]<\/a>/)
    if (linkMatch) {
      const hrefMatch = content
        .slice(0, linkMatch.index)
        .match(/href="([^"]+)"[^>]*>\s*$/)
      if (hrefMatch && !hrefMatch[1].includes('reddit.com/r/')) {
        contentLink = hrefMatch[1]
      }
    }

    // 미디어 타입 감지
    let mediaType = null
    const checkUrl = contentLink || ''
    if (/youtu\.?be(\.com)?/i.test(checkUrl)) {
      mediaType = 'youtube'
    } else if (
      /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(checkUrl) ||
      /i\.redd\.it|imgur\.com/i.test(checkUrl)
    ) {
      mediaType = 'image'
    } else if (contentLink) {
      mediaType = 'article'
    }

    entries.push({
      id,
      title,
      link,
      published,
      author,
      contentLink,
      mediaType,
    })
  }

  return entries
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
  const parentM = xml.match(new RegExp(`<${parent}>[\\s\\S]*?<\\/${parent}>`))
  if (!parentM) return null
  return extractTag(parentM[0], child)
}

function decodeHTML(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#32;/g, ' ')
}

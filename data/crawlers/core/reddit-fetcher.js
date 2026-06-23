import { execSync } from 'child_process'

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const REDDIT_BASE = 'https://www.reddit.com'

/**
 * Fetch URL using curl (bypasses Node.js TLS fingerprint blocking).
 */
function curlFetch(url) {
  try {
    const result = execSync(
      `curl -s -L -H 'User-Agent: ${USER_AGENT}' --max-time 15 '${url}'`,
      { encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 }
    )
    return result
  } catch {
    throw new Error(`curl failed for ${url}`)
  }
}

/**
 * Fetch hot posts from a subreddit.
 * Uses curl + RSS feed to bypass Reddit's TLS fingerprint blocking.
 * Falls back to JSON API if RSS fails.
 *
 * @param {object} source - Source config from sources.json
 * @returns {Promise<object[]>} Filtered posts ready for GPT summarization
 */
export async function fetchRedditPosts(source) {
  // Try RSS via curl first (bypasses TLS fingerprint blocking)
  try {
    return await fetchViaRSS(source)
  } catch (rssErr) {
    console.log(`  RSS failed (${rssErr.message}), trying JSON API...`)
  }

  // Fallback to JSON API via curl
  return await fetchViaJSON(source)
}

/**
 * Fetch via RSS/Atom feed (reliable from datacenter IPs).
 * RSS doesn't provide score/num_comments, so we skip min_score filtering.
 */
async function fetchViaRSS(source) {
  const limit = Math.min((source.max_articles || 10) * 3, 50) // fetch more to filter
  const url = `${REDDIT_BASE}/r/${source.subreddit}/hot.rss?limit=${limit}`

  const xml = curlFetch(url)
  if (!xml || xml.includes('<body class=theme-beta>')) {
    throw new Error(`RSS blocked by Reddit`)
  }
  const entries = parseAtomFeed(xml)

  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  const maxArticles = source.max_articles || 10

  // Filter out stickied-like posts (AutoModerator, daily threads, match threads)
  const skipAuthors = new Set(['AutoModerator', '2soccer2bot', 'MatchThreadder'])
  const skipPatterns = [
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
    /^recommendations?\s*(thread|megathread)/i,
    /^what (are you|have you) (playing|watching|reading|listening)/i,
  ]

  const posts = entries
    .filter(entry => {
      if (skipAuthors.has(entry.author)) return false
      if (skipPatterns.some(p => p.test(entry.title))) return false
      if (entry.published && new Date(entry.published).getTime() < cutoff) return false
      return true
    })
    .slice(0, maxArticles)

  const results = posts.map(entry => ({
    external_id: entry.id.replace('t3_', ''),
    external_url: entry.link,
    original_title: entry.title,
    link_url: entry.contentLink || null,
    thumbnail_url: entry.thumbnail || null,
    media_type: entry.mediaType || null,
    score: 0, // Not available in RSS
    num_comments: 0, // Not available in RSS
    flair: null,
    author: entry.author,
    posted_at: entry.published || new Date().toISOString(),
  }))

  // For image posts without thumbnail, use link_url as thumbnail
  for (const post of results) {
    if (post.media_type === 'image' && !post.thumbnail_url && post.link_url) {
      post.thumbnail_url = post.link_url
    }
  }

  // Enrich: fetch og:image for articles missing thumbnails
  await enrichWithOgImages(results)
  return results
}

/**
 * Parse Atom XML feed into entries array.
 * Simple regex-based parser (no XML library needed).
 */
function parseAtomFeed(xml) {
  const entries = []
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g
  let match

  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[1]

    const id = extractTag(block, 'id') || ''
    const title = decodeHTML(extractTag(block, 'title') || '')
    const link = extractAttr(block, 'link', 'href') || ''
    const published = extractTag(block, 'published') || ''
    const updated = extractTag(block, 'updated') || ''
    const author = extractNestedTag(block, 'author', 'name') || ''

    // Extract media:thumbnail URL
    const thumbMatch = block.match(/<media:thumbnail[^>]*url="([^"]+)"/)
    const thumbnail = thumbMatch ? decodeHTML(thumbMatch[1]) : null

    // Decode HTML entities in content FIRST, then search for [link]
    const rawContent = extractTag(block, 'content') || ''
    const content = decodeHTML(rawContent)
    let contentLink = null
    const linkMatch = content.match(/\[link\]<\/a>/)
    if (linkMatch) {
      const hrefMatch = content.slice(0, linkMatch.index).match(/href="([^"]+)"[^>]*>\s*$/)
      if (hrefMatch && !hrefMatch[1].includes('reddit.com/r/')) {
        contentLink = hrefMatch[1]
      }
    }

    // Determine media type from external link
    let mediaType = null
    const checkUrl = contentLink || ''
    if (/youtu\.?be(\.com)?/i.test(checkUrl)) {
      mediaType = 'youtube'
    } else if (/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(checkUrl) || /i\.redd\.it|imgur\.com|i\.imgur\.com/i.test(checkUrl)) {
      mediaType = 'image'
    } else if (contentLink) {
      mediaType = 'article'
    }

    entries.push({
      id,
      title,
      link,
      published: published || updated,
      author,
      contentLink,
      thumbnail,
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
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

/**
 * Fallback: Fetch via JSON API (may be blocked from datacenter IPs).
 */
async function fetchViaJSON(source) {
  const url = `${REDDIT_BASE}/r/${source.subreddit}/hot.json?limit=50`

  const raw = curlFetch(url)
  if (!raw || raw.includes('<body class=theme-beta>')) {
    throw new Error('JSON API blocked by Reddit')
  }

  let data
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('JSON API returned invalid JSON')
  }

  if (!data) {
    throw new Error('Reddit API returned empty response')
  }

  const minScore = source.min_score || 50
  const maxArticles = source.max_articles || 10
  const cutoff = Date.now() - 24 * 60 * 60 * 1000

  const posts = data.data.children
    .map(c => c.data)
    .filter(post => {
      if (post.stickied) return false
      if (post.score < minScore) return false
      if (post.created_utc * 1000 < cutoff) return false
      return true
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxArticles)

  return posts.map(post => {
    const linkUrl = post.is_self ? null : post.url
    let mediaType = null
    if (linkUrl) {
      if (/youtu\.?be(\.com)?/i.test(linkUrl)) mediaType = 'youtube'
      else if (/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(linkUrl) || /i\.redd\.it|imgur\.com/i.test(linkUrl)) mediaType = 'image'
      else mediaType = 'article'
    }
    return {
      external_id: post.id,
      external_url: `https://reddit.com${post.permalink}`,
      original_title: post.title,
      link_url: linkUrl,
      thumbnail_url: post.thumbnail?.startsWith('http') ? post.thumbnail : null,
      media_type: mediaType,
      score: post.score,
      num_comments: post.num_comments,
      flair: post.link_flair_text || null,
      author: post.author,
      posted_at: new Date(post.created_utc * 1000).toISOString(),
    }
  })
}

/**
 * For posts with link_url but no thumbnail, fetch the og:image from the article.
 * Runs in parallel with a 5s timeout per request.
 */
async function enrichWithOgImages(posts) {
  const targets = posts.filter(p => p.link_url && !p.thumbnail_url && p.media_type === 'article')
  if (targets.length === 0) return

  await Promise.allSettled(targets.map(async (post) => {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 5000)
      const res = await fetch(post.link_url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: ctrl.signal,
        redirect: 'follow',
      })
      clearTimeout(timer)

      if (!res.ok) return

      // Read only first 50KB to find og:image quickly
      const reader = res.body.getReader()
      let html = ''
      while (html.length < 50000) {
        const { done, value } = await reader.read()
        if (done) break
        html += new TextDecoder().decode(value)
      }
      reader.cancel()

      const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)
      if (ogMatch) {
        post.thumbnail_url = ogMatch[1]
      }
    } catch {
      // Timeout or network error — skip silently
    }
  }))
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

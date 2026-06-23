/**
 * Naver News Search API Fetcher
 *
 * Fetches Korean news articles via Naver Open API.
 * Requires NAVER_CLIENT_ID and NAVER_CLIENT_SECRET env vars.
 *
 * API Docs: https://developers.naver.com/docs/serviceapi/search/news/news.md
 *
 * source config:
 *   {
 *     "type": "naver-news",
 *     "search_query": "KBO OR 프로야구",  // Naver search query
 *     "community_slug": "baseball",
 *     "max_articles": 8,
 *     ...
 *   }
 */

const NAVER_API_URL = 'https://openapi.naver.com/v1/search/news.json'

/**
 * Fetch news articles from Naver Search API.
 *
 * @param {object} source - Source config from sources.json
 * @returns {Promise<object[]>} Posts in the same shape as reddit-fetcher output
 */
export async function fetchNaverNewsPosts(source) {
  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Missing NAVER_CLIENT_ID or NAVER_CLIENT_SECRET')
  }

  // Support both single query and multi-query
  const queries = source.search_queries || (source.search_query ? [source.search_query] : [])
  if (queries.length === 0) {
    throw new Error(`Source ${source.id} missing search_queries or search_query`)
  }

  const perQuery = Math.min(Math.ceil(((source.max_articles || 10) * 3) / queries.length), 40)
  const headers = {
    'X-Naver-Client-Id': clientId,
    'X-Naver-Client-Secret': clientSecret,
  }

  // Fetch all queries in parallel (date-sorted for freshness)
  const fetches = queries.map(q =>
    fetch(`${NAVER_API_URL}?${new URLSearchParams({ query: q, display: String(perQuery), start: '1', sort: 'date' })}`, { headers })
      .then(r => r.ok ? r.json() : { items: [] })
      .catch(() => ({ items: [] }))
  )
  const results = await Promise.all(fetches)

  // Merge & deduplicate across all queries
  const seen = new Set()
  const allItems = []
  for (const data of results) {
    for (const item of (data.items || [])) {
      const link = item.originallink || item.link || ''
      if (seen.has(link)) continue
      seen.add(link)
      allItems.push(item)
    }
  }

  if (allItems.length === 0) return []

  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  const maxArticles = source.max_articles || 10

  // Filter: 24시간 이내, 저품질 소스 제외
  const filtered = allItems
    .filter(item => {
      const pubDate = new Date(item.pubDate).getTime()
      if (pubDate < cutoff) return false

      const link = item.originallink || item.link || ''

      // 비뉴스 소스 제외
      if (link.includes('blog.naver.com')) return false
      if (link.includes('cafe.naver.com')) return false
      if (link.includes('post.naver.com')) return false
      if (link.includes('tistory.com')) return false
      if (link.includes('brunch.co.kr')) return false

      // 광고/홍보성 매체 제외
      if (link.includes('pressian.com')) return false
      if (link.includes('newswire.co.kr')) return false
      if (link.includes('prnewswire.com')) return false

      // 제목 기반 저품질 필터
      const title = (item.title || '').replace(/<[^>]*>/g, '')
      const titleLower = title.toLowerCase()
      if (titleLower.includes('[광고]') || titleLower.includes('[홍보]')) return false
      if (titleLower.includes('보도자료')) return false
      if (titleLower.includes('[포토]') || titleLower.includes('[화보]')) return false
      if (titleLower.includes('[단독]') === false && title.length < 10) return false
      // 주식/투자 기사 제외 (스포츠/연예와 무관)
      if (titleLower.includes('주가') || titleLower.includes('시가총액')) return false
      if (titleLower.includes('분양') || titleLower.includes('부동산')) return false

      return true
    })
    // 주요 언론사 우선 정렬
    .sort((a, b) => {
      const scoreA = getSourceTier(a.originallink || a.link || '')
      const scoreB = getSourceTier(b.originallink || b.link || '')
      if (scoreA !== scoreB) return scoreB - scoreA  // 높은 tier 먼저
      return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime() // 같으면 최신순
    })
    .slice(0, maxArticles)

  return filtered.map(item => {
    const title = stripHtml(item.title)
    const description = stripHtml(item.description)
    const originalLink = item.originallink || item.link

    // Generate a stable external_id from the link
    const externalId = hashString(originalLink)

    return {
      external_id: externalId,
      external_url: originalLink,
      original_title: title,
      link_url: originalLink,
      thumbnail_url: null, // Naver API doesn't provide thumbnails
      media_type: 'article',
      score: 0,
      num_comments: 0,
      flair: null,
      author: extractDomain(originalLink),
      posted_at: new Date(item.pubDate).toISOString(),
      // Extra field for summarizer — Naver already provides Korean text
      description_kr: description,
    }
  })
}

/**
 * Rank news sources by credibility/reach.
 * Tier 3 = 주요 언론사, Tier 2 = 전문 매체, Tier 1 = 기타
 */
function getSourceTier(url) {
  // Tier 3: 주요 종합 언론사 & 통신사
  const tier3 = [
    'chosun.com', 'donga.com', 'joongang.co.kr', 'hani.co.kr',
    'khan.co.kr', 'kmib.co.kr', 'munhwa.com', 'segye.com',
    'ytn.co.kr', 'yna.co.kr', 'newsis.com', 'news1.kr',
    'sbs.co.kr', 'kbs.co.kr', 'mbc.co.kr', 'jtbc.co.kr',
    'mk.co.kr', 'mt.co.kr', 'hankyung.com', 'edaily.co.kr',
    'tvn.cj.net', 'tvchosun.com', 'channel.a', 'mbn.co.kr',
  ]
  // Tier 2: 스포츠/연예/IT/게임 전문 매체
  const tier2 = [
    'sports.chosun.com', 'isplus.com', 'osen.co.kr', 'starnewskorea.com',
    'xportsnews.com', 'mydaily.co.kr', 'spotvnews.co.kr', 'sports.khan.co.kr',
    'sportsdonga.com', 'sportalkorea.com', 'sports.news.naver.com',
    'joynews24.com', 'heraldcorp.com', 'newsen.com', 'topstarnews.net',
    'inven.co.kr', 'gamemeca.com', 'ruliweb.com', 'thisisgame.com',
    'fomos.kr', 'gameshot.net', 'gametoc.co.kr',
    'etnews.com', 'zdnet.co.kr', 'bloter.net', 'itworld.co.kr',
    'tenasia.co.kr', 'entertain.naver.com', 'sportsseoul.com',
    'animetimes.co.kr', 'animereporter.com',
  ]

  const lower = url.toLowerCase()
  if (tier3.some(d => lower.includes(d))) return 3
  if (tier2.some(d => lower.includes(d))) return 2
  return 1
}

/** Strip HTML tags and decode entities */
function stripHtml(str) {
  return (str || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim()
}

/** Extract domain name for author field */
function extractDomain(url) {
  try {
    const hostname = new URL(url).hostname
    return hostname.replace(/^www\./, '')
  } catch {
    return 'naver-news'
  }
}

/** Simple hash for stable external_id generation */
function hashString(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return 'nv-' + Math.abs(hash).toString(36)
}

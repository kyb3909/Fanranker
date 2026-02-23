import { NextRequest, NextResponse } from 'next/server'
import { sanitizeEmbedHtml } from '@/lib/sanitize-embed'

/**
 * Normalized oEmbed response structure
 * 
 * Note: html은 선택적입니다. 피드에서는 메타데이터만 필요하므로
 * html은 상세 페이지에서만 필요할 때 가져올 수 있습니다.
 */
interface OEmbedResponse {
  provider: 'youtube' | 'instagram' | 'x'
  url: string
  html?: string // 선택적: includeHtml 파라미터로 제어
  title?: string
  thumbnail_url?: string
  author_name?: string
}

/**
 * Provider-specific oEmbed endpoint configurations
 */
const OEMBED_ENDPOINTS = {
  youtube: 'https://www.youtube.com/oembed',
}

/**
 * Allowed hostnames for SSRF prevention (defense-in-depth)
 */
const ALLOWED_HOSTS = new Set([
  'www.youtube.com',
  'youtube.com',
  'youtu.be',
  'm.youtube.com',
  'www.instagram.com',
  'instagram.com',
  'twitter.com',
  'www.twitter.com',
  'x.com',
  'www.x.com',
])

/**
 * URL patterns for provider detection
 */
const URL_PATTERNS = {
  youtube: /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  instagram: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(?:p|reel)\/([a-zA-Z0-9_-]+)/,
  x: /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/(?:#!\/)?(\w+)\/status(?:es)?\/(\d+)/,
}

/**
 * Detect which provider a URL belongs to
 */
function detectProvider(url: string): 'youtube' | 'instagram' | 'x' | null {
  if (URL_PATTERNS.youtube.test(url)) {
    return 'youtube'
  }
  if (URL_PATTERNS.instagram.test(url)) {
    return 'instagram'
  }
  if (URL_PATTERNS.x.test(url)) {
    return 'x'
  }
  return null
}

/**
 * Normalize YouTube URL to standard format
 */
function normalizeYouTubeUrl(url: string): string {
  const match = url.match(URL_PATTERNS.youtube)
  if (match) {
    const videoId = match[1]
    return `https://www.youtube.com/watch?v=${videoId}`
  }
  return url
}

/**
 * Normalize Instagram URL
 */
function normalizeInstagramUrl(url: string): string {
  // Ensure full URL format
  if (!url.startsWith('http')) {
    return `https://${url}`
  }
  return url
}


/**
 * Fetch oEmbed data from YouTube
 */
async function fetchYouTubeOEmbed(url: string, includeHtml: boolean = true): Promise<OEmbedResponse> {
  const normalizedUrl = normalizeYouTubeUrl(url)
  const oembedUrl = `${OEMBED_ENDPOINTS.youtube}?url=${encodeURIComponent(normalizedUrl)}&format=json`

  const response = await fetch(oembedUrl)
  if (!response.ok) {
    throw new Error(`YouTube oEmbed failed: ${response.statusText}`)
  }

  const data = await response.json()

  return {
    provider: 'youtube',
    url: normalizedUrl,
    html: includeHtml ? (data.html || '') : undefined,
    title: data.title,
    thumbnail_url: data.thumbnail_url,
    author_name: data.author_name,
  }
}

/**
 * Fetch oEmbed data from Instagram
 *
 * blockquote + embed.js 방식: Facebook Access Token 불필요
 * embed.js가 클라이언트에서 blockquote를 인터랙티브 임베드로 변환
 */
async function fetchInstagramOEmbed(url: string, includeHtml: boolean = true): Promise<OEmbedResponse> {
  const normalizedUrl = normalizeInstagramUrl(url)

  // URL에서 shortcode 추출
  const match = normalizedUrl.match(URL_PATTERNS.instagram)
  if (!match) {
    throw new Error('Invalid Instagram URL')
  }

  // 검증된 shortcode로 안전한 permalink 생성 (XSS 방지)
  const shortcode = match[1]
  const isReel = normalizedUrl.includes('/reel/')
  const permalink = `https://www.instagram.com/${isReel ? 'reel' : 'p'}/${shortcode}/`

  // blockquote HTML 생성 (embed.js가 클라이언트에서 렌더링)
  const blockquoteHtml = includeHtml
    ? `<blockquote class="instagram-media" data-instgrm-permalink="${permalink}" data-instgrm-version="14" style="max-width:540px;min-width:326px;width:100%;"></blockquote>`
    : undefined

  return {
    provider: 'instagram',
    url: normalizedUrl,
    html: blockquoteHtml,
    author_name: undefined,
  }
}

/**
 * Fetch oEmbed data from X (Twitter)
 *
 * publish.twitter.com/oembed API가 불안정하므로
 * Instagram과 동일하게 blockquote HTML을 직접 생성.
 * widgets.js가 클라이언트에서 blockquote를 인터랙티브 임베드로 변환.
 */
async function fetchXOEmbed(url: string, includeHtml: boolean = true): Promise<OEmbedResponse> {
  const match = url.match(URL_PATTERNS.x)
  if (!match) {
    throw new Error('Invalid X URL')
  }

  const username = match[1]
  const statusId = match[2]
  const permalink = `https://twitter.com/${username}/status/${statusId}`

  const blockquoteHtml = includeHtml
    ? `<blockquote class="twitter-tweet"><a href="${permalink}"></a></blockquote>`
    : undefined

  return {
    provider: 'x',
    url: url.startsWith('http') ? url : `https://${url}`,
    html: blockquoteHtml,
    author_name: `@${username}`,
  }
}

/**
 * Main oEmbed API route handler
 * 
 * GET /api/oembed?url=<url>
 * 
 * Returns normalized oEmbed data for supported providers:
 * - YouTube (youtube.com, youtu.be)
 * - Instagram (instagram.com/p/*, /reel/*)
 * - X (twitter.com, x.com)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const url = searchParams.get('url')
    const includeHtml = searchParams.get('includeHtml') === 'true' // html 포함 여부

    if (!url || url.length > 2048) {
      return NextResponse.json(
        { error: 'URL parameter is required (max 2048 chars)' },
        { status: 400 }
      )
    }

    // Validate URL format and hostname whitelist (SSRF prevention)
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return NextResponse.json(
          { error: 'Invalid URL protocol' },
          { status: 400 }
        )
      }
      if (!ALLOWED_HOSTS.has(parsed.hostname)) {
        return NextResponse.json(
          { error: 'Unsupported domain' },
          { status: 400 }
        )
      }
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      )
    }

    // Detect provider
    const provider = detectProvider(url)
    if (!provider) {
      return NextResponse.json(
        { error: 'Unsupported oEmbed provider. Supported: YouTube, Instagram, X' },
        { status: 422 }
      )
    }

    // Fetch oEmbed data based on provider
    let oembedData: OEmbedResponse

    try {
      switch (provider) {
        case 'youtube':
          oembedData = await fetchYouTubeOEmbed(url, includeHtml)
          break
        case 'instagram':
          oembedData = await fetchInstagramOEmbed(url, includeHtml)
          break
        case 'x':
          oembedData = await fetchXOEmbed(url, includeHtml)
          break
        default:
          return NextResponse.json(
            { error: 'Unsupported provider' },
            { status: 422 }
          )
      }
    } catch (error) {
      console.error(`oEmbed fetch error for ${provider}:`, error)
      return NextResponse.json(
        { error: '임베드 데이터를 가져오는 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    // Sanitize HTML to prevent XSS
    if (oembedData.html) {
      oembedData.html = sanitizeEmbedHtml(oembedData.html, provider)
    }

    return NextResponse.json(oembedData)
  } catch (error) {
    console.error('oEmbed API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}


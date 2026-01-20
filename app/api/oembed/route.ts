import { NextRequest, NextResponse } from 'next/server'

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
  instagram: 'https://graph.facebook.com/v17.0/instagram_oembed',
  x: 'https://publish.twitter.com/oembed',
}

/**
 * URL patterns for provider detection
 */
const URL_PATTERNS = {
  youtube: /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  instagram: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel)\/([a-zA-Z0-9_-]+)/,
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
 * Normalize X/Twitter URL
 */
function normalizeXUrl(url: string): string {
  // Convert x.com to twitter.com for oEmbed API
  const normalized = url.replace(/x\.com/, 'twitter.com')
  if (!normalized.startsWith('http')) {
    return `https://${normalized}`
  }
  return normalized
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
 * Note: Instagram oEmbed requires a Facebook App ID and App Secret for production.
 * For development, you may need to use a proxy or alternative method.
 * This implementation assumes you have proper Facebook Graph API credentials.
 */
async function fetchInstagramOEmbed(url: string, includeHtml: boolean = true): Promise<OEmbedResponse> {
  const normalizedUrl = normalizeInstagramUrl(url)
  
  // Instagram oEmbed requires access_token
  // You should store this in environment variables
  const accessToken = process.env.FACEBOOK_ACCESS_TOKEN
  
  if (!accessToken) {
    throw new Error('Facebook access token not configured')
  }

  const oembedUrl = `${OEMBED_ENDPOINTS.instagram}?url=${encodeURIComponent(normalizedUrl)}&access_token=${accessToken}`

  const response = await fetch(oembedUrl)
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Instagram oEmbed failed: ${response.statusText} - ${errorText}`)
  }

  const data = await response.json()

  return {
    provider: 'instagram',
    url: normalizedUrl,
    html: includeHtml ? (data.html || '') : undefined,
    title: data.title,
    thumbnail_url: data.thumbnail_url,
    author_name: data.author_name,
  }
}

/**
 * Fetch oEmbed data from X (Twitter)
 */
async function fetchXOEmbed(url: string, includeHtml: boolean = true): Promise<OEmbedResponse> {
  const normalizedUrl = normalizeXUrl(url)
  const oembedUrl = `${OEMBED_ENDPOINTS.x}?url=${encodeURIComponent(normalizedUrl)}&omit_script=true`

  const response = await fetch(oembedUrl)
  if (!response.ok) {
    throw new Error(`X oEmbed failed: ${response.statusText}`)
  }

  const data = await response.json()

  return {
    provider: 'x',
    url: normalizedUrl,
    html: includeHtml ? (data.html || '') : undefined,
    title: data.title,
    thumbnail_url: data.thumbnail_url,
    author_name: data.author_name || data.author_url,
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

    if (!url) {
      return NextResponse.json(
        { error: 'URL parameter is required' },
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
        { 
          error: `Failed to fetch oEmbed data: ${error instanceof Error ? error.message : 'Unknown error'}` 
        },
        { status: 500 }
      )
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


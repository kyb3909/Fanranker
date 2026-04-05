import { NextRequest, NextResponse } from "next/server"
import { sanitizeEmbedHtml } from "@/lib/sanitize-embed"
import { apiError } from "@/lib/api-error"

interface EmbedMedia {
  type: "photo" | "video"
  url: string
  thumbnail_url?: string
}

interface OEmbedResponse {
  provider: "youtube" | "instagram" | "x"
  url: string
  html?: string
  title?: string
  thumbnail_url?: string
  author_name?: string
  author_avatar?: string
  media?: EmbedMedia[]
}

/**
 * Provider-specific oEmbed endpoint configurations
 */
const OEMBED_ENDPOINTS = {
  youtube: "https://www.youtube.com/oembed",
}

/**
 * Allowed hostnames for SSRF prevention (defense-in-depth)
 */
const ALLOWED_HOSTS = new Set([
  "www.youtube.com",
  "youtube.com",
  "youtu.be",
  "m.youtube.com",
  "www.instagram.com",
  "instagram.com",
  "twitter.com",
  "www.twitter.com",
  "x.com",
  "www.x.com",
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
function detectProvider(url: string): "youtube" | "instagram" | "x" | null {
  if (URL_PATTERNS.youtube.test(url)) {
    return "youtube"
  }
  if (URL_PATTERNS.instagram.test(url)) {
    return "instagram"
  }
  if (URL_PATTERNS.x.test(url)) {
    return "x"
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
  if (!url.startsWith("http")) {
    return `https://${url}`
  }
  return url
}

/**
 * Fetch oEmbed data from YouTube
 */
async function fetchYouTubeOEmbed(
  url: string,
  includeHtml: boolean = true
): Promise<OEmbedResponse> {
  const normalizedUrl = normalizeYouTubeUrl(url)
  const oembedUrl = `${OEMBED_ENDPOINTS.youtube}?url=${encodeURIComponent(normalizedUrl)}&format=json`

  const response = await fetch(oembedUrl, { signal: AbortSignal.timeout(5000) })
  if (!response.ok) {
    throw new Error(`YouTube oEmbed failed: ${response.statusText}`)
  }

  const data = await response.json().catch(() => null)
  if (!data) throw new Error("YouTube oEmbed returned invalid JSON")

  return {
    provider: "youtube",
    url: normalizedUrl,
    html: includeHtml ? data.html || "" : undefined,
    title: data.title,
    thumbnail_url: data.thumbnail_url,
    author_name: data.author_name,
  }
}

/**
 * Fetch oEmbed data from Instagram
 *
 * 1순위: FACEBOOK_ACCESS_TOKEN 존재 시 Meta 공식 oEmbed API 호출
 *        → thumbnail_url, title, author_name + blockquote html 반환
 * 2순위: 토큰 없거나 API 실패 시 로컬 blockquote 생성
 *        → embed.js가 클라이언트에서 iframe 렌더링
 *
 * Meta oEmbed API 사용 조건:
 * - Facebook App 생성 + oEmbed Read Advanced Access + App Review 필요
 * - 환경변수 FACEBOOK_ACCESS_TOKEN 에 앱 액세스 토큰 설정
 */
async function fetchInstagramOEmbed(
  url: string,
  includeHtml: boolean = true
): Promise<OEmbedResponse> {
  const normalizedUrl = normalizeInstagramUrl(url)

  const match = normalizedUrl.match(URL_PATTERNS.instagram)
  if (!match) {
    throw new Error("Invalid Instagram URL")
  }

  const shortcode = match[1]
  const isReel = normalizedUrl.includes("/reel/")
  const permalink = `https://www.instagram.com/${isReel ? "reel" : "p"}/${shortcode}/`

  // Meta oEmbed API 시도 (토큰 존재 시)
  const fbToken = process.env.FACEBOOK_ACCESS_TOKEN
  if (fbToken) {
    try {
      const oembedUrl = `https://graph.facebook.com/v25.0/instagram_oembed?url=${encodeURIComponent(permalink)}&access_token=${fbToken}&maxwidth=540`
      const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        const data = await res.json()
        return {
          provider: "instagram",
          url: normalizedUrl,
          html: includeHtml ? data.html || buildInstagramBlockquote(permalink) : undefined,
          thumbnail_url: data.thumbnail_url || undefined,
          title: data.title || undefined,
          author_name: data.author_name || undefined,
        }
      }
      // API 실패 시 아래 fallback으로 진행
      console.warn(`Instagram oEmbed API failed: ${res.status} ${res.statusText}`)
    } catch (e) {
      console.warn("Instagram oEmbed API error:", e)
    }
  }

  // Fallback: 로컬 blockquote 생성 (토큰 없거나 API 실패)
  return {
    provider: "instagram",
    url: normalizedUrl,
    html: includeHtml ? buildInstagramBlockquote(permalink) : undefined,
    thumbnail_url: undefined,
    title: undefined,
    author_name: undefined,
  }
}

function buildInstagramBlockquote(permalink: string): string {
  return `<blockquote class="instagram-media" data-instgrm-permalink="${permalink}" data-instgrm-version="14" style="max-width:540px;min-width:326px;width:100%;"></blockquote>`
}

/**
 * Fetch oEmbed data from X (Twitter)
 *
 * Twitter 공식 oEmbed/widgets.js가 완전히 죽어있으므로
 * fxtwitter.com API로 트윗 데이터를 가져와서 커스텀 카드 HTML 생성.
 */
async function fetchXOEmbed(url: string, includeHtml: boolean = true): Promise<OEmbedResponse> {
  const match = url.match(URL_PATTERNS.x)
  if (!match) {
    throw new Error("Invalid X URL")
  }

  const username = match[1]
  const statusId = match[2]
  const originalUrl = url.startsWith("http") ? url : `https://${url}`

  let tweetText = ""
  let authorName = `@${username}`
  let authorAvatar = ""
  let mediaUrl = ""
  let displayName = ""
  const mediaItems: EmbedMedia[] = []

  try {
    const res = await fetch(`https://api.fxtwitter.com/status/${statusId}`, {
      headers: { "User-Agent": "FanRanker/1.0" },
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const data = await res.json()
      const tweet = data.tweet
      if (tweet) {
        tweetText = tweet.text || ""
        authorName = `@${tweet.author?.screen_name || username}`
        displayName = tweet.author?.name || ""
        authorAvatar = tweet.author?.avatar_url || ""

        if (tweet.media?.photos) {
          for (const photo of tweet.media.photos) {
            if (photo.url) mediaItems.push({ type: "photo", url: photo.url })
          }
        }
        if (tweet.media?.videos) {
          for (const video of tweet.media.videos) {
            if (video.url) {
              mediaItems.push({
                type: "video",
                url: video.url,
                thumbnail_url: video.thumbnail_url,
              })
            }
          }
        }

        mediaUrl =
          mediaItems[0]?.type === "photo" ? mediaItems[0].url : mediaItems[0]?.thumbnail_url || ""
      }
    }
  } catch {
    // fxtwitter 실패 시 기본값 사용
  }

  // 커스텀 카드 HTML 생성
  let cardHtml: string | undefined
  if (includeHtml) {
    const escapedText = tweetText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br/>")
    const escapedDisplayName = displayName
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
    const escAttr = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    const escapedAuthorName = authorName
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
    const escapedMediaUrl = mediaUrl ? escAttr(mediaUrl) : ""
    const escapedAvatarUrl = authorAvatar ? escAttr(authorAvatar) : ""
    const escapedOriginalUrl = escAttr(originalUrl)
    const mediaHtml = escapedMediaUrl
      ? `<img src="${escapedMediaUrl}" alt="${escapedDisplayName}의 게시물 이미지" style="width:100%;border-radius:12px;margin-top:12px;max-height:300px;object-fit:cover;" />`
      : ""
    const avatarHtml = escapedAvatarUrl
      ? `<img src="${escapedAvatarUrl}" alt="${escapedDisplayName} 프로필" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" />`
      : `<div style="width:40px;height:40px;border-radius:50%;background:#2a2a2a;"></div>`

    cardHtml = `<div style="max-width:550px;border:1px solid #333;border-radius:16px;padding:16px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#000;color:#e7e9ea;">
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
    ${avatarHtml}
    <div>
      <div style="font-weight:700;font-size:15px;color:#e7e9ea;">${escapedDisplayName}</div>
      <div style="font-size:13px;color:#71767b;">${escapedAuthorName}</div>
    </div>
    <svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:#e7e9ea;margin-left:auto;"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
  </div>
  <div style="font-size:15px;line-height:1.5;margin-bottom:4px;">${escapedText}</div>
  ${mediaHtml}
  <a href="${escapedOriginalUrl}" target="_blank" rel="noopener noreferrer" style="display:block;margin-top:12px;font-size:13px;color:#1d9bf0;text-decoration:none;">X에서 보기 →</a>
</div>`
  }

  return {
    provider: "x",
    url: originalUrl,
    html: cardHtml,
    title: tweetText.slice(0, 100) || undefined,
    thumbnail_url: mediaUrl || undefined,
    author_name: displayName ? `${displayName} (${authorName})` : authorName,
    author_avatar: authorAvatar || undefined,
    media: mediaItems.length > 0 ? mediaItems : undefined,
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
    const url = searchParams.get("url")
    const includeHtml = searchParams.get("includeHtml") === "true" // html 포함 여부

    if (!url || url.length > 2048) {
      return NextResponse.json(
        { error: "URL parameter is required (max 2048 chars)" },
        { status: 400 }
      )
    }

    // Validate URL format and hostname whitelist (SSRF prevention)
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return NextResponse.json({ error: "Invalid URL protocol" }, { status: 400 })
      }
      if (!ALLOWED_HOSTS.has(parsed.hostname)) {
        return NextResponse.json({ error: "Unsupported domain" }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 })
    }

    // Detect provider
    const provider = detectProvider(url)
    if (!provider) {
      return NextResponse.json(
        { error: "Unsupported oEmbed provider. Supported: YouTube, Instagram, X" },
        { status: 422 }
      )
    }

    // Fetch oEmbed data based on provider
    let oembedData: OEmbedResponse

    try {
      switch (provider) {
        case "youtube":
          oembedData = await fetchYouTubeOEmbed(url, includeHtml)
          break
        case "instagram":
          oembedData = await fetchInstagramOEmbed(url, includeHtml)
          break
        case "x":
          oembedData = await fetchXOEmbed(url, includeHtml)
          break
        default:
          return NextResponse.json({ error: "Unsupported provider" }, { status: 422 })
      }
    } catch (error) {
      return apiError("임베드 데이터를 가져오는 중 오류가 발생했습니다.", 500, error)
    }

    // Sanitize HTML to prevent XSS
    if (oembedData.html) {
      oembedData.html = sanitizeEmbedHtml(oembedData.html, provider)
    }

    return NextResponse.json(oembedData, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    })
  } catch (error) {
    return apiError("Internal server error", 500, error)
  }
}

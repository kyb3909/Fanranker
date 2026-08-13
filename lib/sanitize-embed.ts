/**
 * Sanitize oEmbed HTML to only allow trusted iframe embeds.
 * - Iframe embeds (YouTube): whitelist-reconstruct approach
 * - Blockquote/card embeds (X/Twitter, Instagram): DOMPurify sanitization
 */

import sanitizeHtml from "sanitize-html"

const ALLOWED_IFRAME_HOSTS = [
  "www.youtube.com",
  "youtube.com",
  "www.instagram.com",
  "instagram.com",
  "platform.twitter.com",
  "platform.x.com",
]

/**
 * Extract and sanitize iframe from oEmbed HTML.
 * Returns safe HTML containing only the iframe, or empty string.
 */
export function sanitizeEmbedHtml(html: string, provider: string): string {
  // X/Twitter, Instagram, Bluesky use blockquote (not iframe) — sanitize with DOMPurify
  if (provider === "x" || provider === "instagram" || provider === "bsky") {
    return sanitizeBlockquoteHtml(html)
  }

  // Extract iframe src using regex (no DOM parser needed on Edge)
  const iframeMatch = html.match(/<iframe[^>]*\ssrc=["']([^"']+)["'][^>]*>/i)
  if (!iframeMatch) return ""

  const src = iframeMatch[1]

  // Validate iframe src domain
  try {
    const url = new URL(src)
    if (!ALLOWED_IFRAME_HOSTS.includes(url.hostname)) return ""
    if (url.protocol !== "https:") return ""
  } catch {
    return ""
  }

  // Extract width/height if present
  const widthMatch = html.match(/width=["'](\d+)["']/i)
  const heightMatch = html.match(/height=["'](\d+)["']/i)

  const width = widthMatch ? ` width="${widthMatch[1]}"` : ""
  const height = heightMatch ? ` height="${heightMatch[1]}"` : ""

  // Reconstruct safe iframe
  return `<iframe src="${src}"${width}${height} frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
}

/**
 * Blockquote/card embeds (Twitter/X, Instagram).
 * DOMPurify로 안전하게 살균. 정규식 우회 공격 방지.
 */
function sanitizeBlockquoteHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["blockquote", "div", "span", "p", "a", "img", "br", "strong", "em", "time"],
    allowedAttributes: {
      a: ["href", "target", "rel", "class", "style"],
      img: ["src", "alt", "width", "height", "style"],
      div: ["class", "style"],
      span: ["class", "style"],
      blockquote: [
        "class",
        "style",
        "cite",
        "lang",
        "data-instgrm-permalink",
        "data-instgrm-version",
        // Bluesky embed.js 가 iframe 으로 바꿀 때 읽는 식별자 (없으면 텍스트 폴백만 남는다)
        "data-bluesky-uri",
        "data-bluesky-cid",
      ],
      time: ["datetime"],
    },
    allowedSchemes: ["https", "http"],
  })
}

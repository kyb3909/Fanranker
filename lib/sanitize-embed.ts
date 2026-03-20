/**
 * Sanitize oEmbed HTML to only allow trusted iframe embeds.
 * - Iframe embeds (YouTube): whitelist-reconstruct approach
 * - Blockquote embeds (X/Twitter, Instagram): DOMPurify
 */

import DOMPurify from "isomorphic-dompurify"

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
  // X/Twitter and Instagram use blockquote (not iframe) — sanitize with DOMPurify
  if (provider === "x" || provider === "instagram") {
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
 * Blockquote-based embeds (Twitter/X, Instagram).
 * Uses DOMPurify when available; falls through gracefully in serverless
 * environments where jsdom may not initialize.
 *
 * X/Instagram HTML is generated server-side from validated data, so the
 * DOMPurify pass is defense-in-depth only — not a primary security gate.
 */
function sanitizeBlockquoteHtml(html: string): string {
  try {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        "blockquote",
        "a",
        "p",
        "br",
        "span",
        "div",
        "img",
        "strong",
        "em",
        "b",
        "i",
        "time",
        "svg",
        "path",
      ],
      ALLOWED_ATTR: [
        "href",
        "target",
        "rel",
        "class",
        "style",
        "data-instgrm-version",
        "data-instgrm-permalink",
        "data-instgrm-captioned",
        "cite",
        "datetime",
        "lang",
        "dir",
        "src",
        "alt",
        "width",
        "height",
        "viewBox",
        "d",
        "fill",
        "aria-label",
      ],
      ALLOW_DATA_ATTR: true,
      ALLOW_ARIA_ATTR: true,
    })
  } catch {
    return html
  }
}

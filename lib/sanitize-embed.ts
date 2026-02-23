/**
 * Sanitize oEmbed HTML to only allow trusted iframe embeds.
 * Strips all tags except iframes from allowed domains.
 */

const ALLOWED_IFRAME_HOSTS = [
  'www.youtube.com',
  'youtube.com',
  'www.instagram.com',
  'instagram.com',
  'platform.twitter.com',
  'platform.x.com',
]

/**
 * Extract and sanitize iframe from oEmbed HTML.
 * Returns safe HTML containing only the iframe, or empty string.
 */
export function sanitizeEmbedHtml(html: string, provider: string): string {
  // X/Twitter and Instagram use blockquote (not iframe) - sanitize similarly
  if (provider === 'x' || provider === 'instagram') {
    return sanitizeBlockquoteHtml(html)
  }

  // Extract iframe src using regex (no DOM parser needed on Edge)
  const iframeMatch = html.match(/<iframe[^>]*\ssrc=["']([^"']+)["'][^>]*>/i)
  if (!iframeMatch) return ''

  const src = iframeMatch[1]

  // Validate iframe src domain
  try {
    const url = new URL(src)
    if (!ALLOWED_IFRAME_HOSTS.includes(url.hostname)) return ''
    if (url.protocol !== 'https:') return ''
  } catch {
    return ''
  }

  // Extract width/height if present
  const widthMatch = html.match(/width=["'](\d+)["']/i)
  const heightMatch = html.match(/height=["'](\d+)["']/i)

  const width = widthMatch ? ` width="${widthMatch[1]}"` : ''
  const height = heightMatch ? ` height="${heightMatch[1]}"` : ''

  // Reconstruct safe iframe
  return `<iframe src="${src}"${width}${height} frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`
}

/**
 * Blockquote-based embeds (Twitter/X, Instagram).
 * Strip all script tags and only keep the blockquote with safe text content.
 */
function sanitizeBlockquoteHtml(html: string): string {
  // Remove all script tags
  let safe = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')

  // Remove event handlers (onclick, onerror, etc.)
  safe = safe.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')

  // Remove javascript: URLs
  safe = safe.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')

  return safe
}

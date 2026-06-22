/**
 * 붙여넣기 / 표시용: 이미지로 바꿀 수 있는 URL 판별
 */

const IMAGE_EXT_PATH = /\.(jpe?g|png|gif|webp|avif|bmp)(\?[^#]*)?(#.*)?$/i
const VIDEO_EXT_PATH = /\.(mp4|webm|mov|m4v|ogv)(\?[^#]*)?(#.*)?$/i

/** 경로가 일반적인 이미지 확장자로 끝나는 http(s) URL */
export function isProbablyDirectImageUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== "http:" && u.protocol !== "https:") return false
    return IMAGE_EXT_PATH.test(u.pathname)
  } catch {
    return false
  }
}

/** 경로가 일반적인 동영상 확장자(mp4/webm 등)로 끝나는 http(s) URL */
export function isProbablyDirectVideoUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== "http:" && u.protocol !== "https:") return false
    return VIDEO_EXT_PATH.test(u.pathname)
  } catch {
    return false
  }
}

/** 서버 oEmbed로 직접 이미지 주소를 풀어야 하는 Imgur/Giphy 페이지 URL */
export function needsOembedImageResolve(raw: string): boolean {
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== "http:" && u.protocol !== "https:") return false
    const h = u.hostname.toLowerCase()
    if (h === "i.imgur.com") return false
    if (h === "media.giphy.com" || /^media\d*\.giphy\.com$/i.test(h)) return false
    if (h === "imgur.com" || h.endsWith(".imgur.com")) return true
    if (h === "giphy.com" || h.endsWith(".giphy.com")) return true
    return false
  } catch {
    return false
  }
}

/** API가 돌려준 최종 이미지 URL이 예상 CDN인지 (오픈 리다이렉트 완화) */
export function isAllowedResolvedImageHost(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== "https:") return false
    const h = u.hostname.toLowerCase()
    if (h === "i.imgur.com" || h === "s.imgur.com") return true
    if (/^media\d*\.giphy\.com$/i.test(h)) return true
    return false
  } catch {
    return false
  }
}

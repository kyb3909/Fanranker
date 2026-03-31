/**
 * Supabase Storage URL → 프록시 URL 변환
 * Supabase 도메인 노출을 방지하기 위해 /storage/ 프록시 경로로 변환
 */

const SUPABASE_STORAGE_PREFIX = process.env.NEXT_PUBLIC_SUPABASE_URL + "/storage/v1/object/public/"

/**
 * Supabase Storage URL을 /storage/ 프록시 URL로 변환
 * 이미 프록시 URL이거나 Supabase URL이 아니면 그대로 반환
 */
export function toProxyUrl(url: string | null | undefined): string {
  if (!url) return ""
  if (url.startsWith("/storage/")) return url
  if (url.includes("/storage/v1/object/public/")) {
    const idx = url.indexOf("/storage/v1/object/public/")
    return "/storage/" + url.slice(idx + "/storage/v1/object/public/".length)
  }
  return url
}

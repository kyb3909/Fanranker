/**
 * Validates that image URLs come from trusted domains only.
 * Prevents SSRF and malicious content injection.
 */

const ALLOWED_HOSTNAMES = [
  "ekysrlhdrapmsnrkytif.supabase.co", // Supabase Storage
  "img.clerk.com", // Clerk avatars
]

export function isAllowedImageUrl(url: string): boolean {
  // 자체 Storage 프록시 경로 (next.config 리라이트: /storage/* → Supabase Storage).
  // 업로드·재호스팅된 이미지는 이 상대 경로로 저장된다. 단일 슬래시로 시작하므로
  // protocol-relative(`//evil.com/...`) 우회는 매칭되지 않는다.
  if (url.startsWith("/storage/")) return true
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:") return false
    return ALLOWED_HOSTNAMES.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
    )
  } catch {
    return false
  }
}

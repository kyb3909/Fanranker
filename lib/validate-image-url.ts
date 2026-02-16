/**
 * Validates that image URLs come from trusted domains only.
 * Prevents SSRF and malicious content injection.
 */

const ALLOWED_HOSTNAMES = [
  'ekysrlhdrapmsnrkytif.supabase.co', // Supabase Storage
  'img.clerk.com',                      // Clerk avatars
]

export function isAllowedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    return ALLOWED_HOSTNAMES.some(
      host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
    )
  } catch {
    return false
  }
}

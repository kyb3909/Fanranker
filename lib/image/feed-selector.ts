/**
 * 피드 카드 이미지 최적화 가능 여부 판정
 *
 * Next.js Image 컴포넌트의 remotePatterns에 허용된 호스트만 진입.
 * 외부 허용 외 호스트는 <img>로 직접 렌더해 404/최적화 실패를 피함.
 */

export function canUseOptimizedFeedImage(src: string): boolean {
  try {
    const url = new URL(src)
    const host = url.hostname.toLowerCase()
    return (
      host === "i.ytimg.com" ||
      host === "img.youtube.com" ||
      host === "pbs.twimg.com" ||
      host === "img.clerk.com" ||
      host.endsWith(".supabase.co") ||
      host.endsWith(".cdninstagram.com")
    )
  } catch {
    return false
  }
}

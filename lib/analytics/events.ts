/**
 * GA4 Custom Event Tracking
 *
 * GA4는 이미 layout.tsx에서 @next/third-parties GoogleAnalytics로 로드됨.
 * 이 모듈은 type-safe한 커스텀 이벤트 트래킹을 제공.
 */

type AnalyticsEvent =
  | { name: "signup_complete"; params: { method: "email" | "google" | "kakao" } }
  | { name: "first_post"; params: { community: string } }
  | { name: "first_prediction"; params: { sport: string; game_count: number } }
  | { name: "board_view"; params: { board: string } }
  | { name: "prediction_submit"; params: { sport: string; stake: number } }
  | { name: "search"; params: { query: string } }

export function trackEvent(event: AnalyticsEvent) {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag("event", event.name, event.params)
  }
}

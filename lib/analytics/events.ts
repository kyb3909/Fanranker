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
  // ── 예측 완료 모달 → 커뮤니티 전환 실험 (2026-07-02) ──
  | { name: "prediction_success_modal"; params: { game_count: number; has_community: boolean } }
  | { name: "prediction_modal_post_click"; params: { post_id: string } }
  | { name: "prediction_modal_board_click"; params: { board: string } }
  | { name: "search"; params: { query: string } }
  // ── 메타버스 이벤트 ──
  | { name: "metaverse_enter"; params: { is_guest: boolean } }
  | { name: "metaverse_plot_enter"; params: { plot_code: string; has_room: boolean } }
  | { name: "metaverse_chat_send"; params: { scope: "world" | "room"; length: number } }
  | {
      name: "metaverse_room_create"
      params: { plot_code: string; sign_length: number; cost: number }
    }
  | { name: "metaverse_room_close"; params: { by: "owner" | "admin" | "cron" } }
  | { name: "metaverse_highbury_enter"; params: { is_guest: boolean } }
  | { name: "flair_team_selected"; params: { community: string; team_id: string } }
  | { name: "discord_invite_click"; params: { placement: string } }
  | { name: "snack_feed_open"; params: Record<string, never> }
  | { name: "snack_feed_depth"; params: { depth: number } }
  | { name: "snack_card_open_post"; params: { post_id: string } }
  | { name: "cardnews_feed_open"; params: Record<string, never> }
  | { name: "cardnews_card_open_post"; params: { post_id: string } }

export function trackEvent(event: AnalyticsEvent) {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag("event", event.name, event.params)
  }
}

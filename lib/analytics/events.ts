/**
 * GA4 Custom Event Tracking
 *
 * GA4는 이미 layout.tsx에서 @next/third-parties GoogleAnalytics로 로드됨.
 * 이 모듈은 type-safe한 커스텀 이벤트 트래킹을 제공.
 */

type AnalyticsEvent =
  // ── 온보딩 퍼널 4단계 (시즌 오픈 이벤트 P0) ──
  // 랜딩 도달 → 가입 완료 → 첫 슬립 → 게시판 첫 활동.
  // channel 은 최초 터치 UTM(lib/analytics/attribution) — 유튜버별 기여를 보려면 필수.
  | { name: "landing_view"; params: { channel: string; channel_campaign: string; path: string } }
  | {
      name: "signup_complete"
      params: {
        method: "email" | "google" | "kakao"
        channel: string
        channel_campaign: string
      }
    }
  | { name: "first_post"; params: { community: string } }
  | {
      name: "first_prediction"
      params: { sport: string; game_count: number; channel: string; channel_campaign: string }
    }
  | {
      name: "first_community_action"
      params: { kind: "post" | "comment"; channel: string; channel_campaign: string }
    }
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
  // ── VS 쟁점 계측 (VS-RESULT 결정 1·2·5의 표본 — 안 1과 반드시 동행) ──
  // confidence 는 poll_id → polls.confidence 조인으로 붙인다 (이벤트엔 안 실음)
  | { name: "vs_impression"; params: { poll_id: string; surface: "card" | "post" } }
  | { name: "vs_vote"; params: { poll_id: string; option_key: string; surface: "card" | "post" } }

export function trackEvent(event: AnalyticsEvent) {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag("event", event.name, event.params)
  }
}

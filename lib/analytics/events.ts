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
  // ── 콘텐츠 소비 계측 (언론사 계약 협상 지표 — 2026-08-02) ──
  // 파트너가 묻는 건 "예측 참여자 수"가 아니라 "기사를 몇 명이 읽고 얼마나 머무나"다.
  // board_view = 게시판 진입, post_read = 15초 이상 실제로 화면에 띄워둔 "읽음".
  // 단순 조회(post_views)는 스쳐간 것까지 세므로 둘을 나눠 본다.
  | { name: "board_view"; params: { board: string } }
  | { name: "post_read"; params: { post_id: string } }
  | { name: "prediction_submit"; params: { sport: string; stake: number } }
  // ── 예측 완료 모달 → 커뮤니티 전환 실험 (2026-07-02) ──
  | { name: "prediction_success_modal"; params: { game_count: number; has_community: boolean } }
  // slot: 어느 슬롯의 카드를 눌렀나 (2026-08-12 모달 재편성 — 편성글/예측한 팀 기사 분리 계측.
  // 실패 판정이 슬롯별로 갈린다: 편성 클릭률과 팀 기사 클릭률은 다른 가설이다)
  | {
      name: "prediction_modal_post_click"
      params: { post_id: string; slot: "featured" | "team" }
    }
  | { name: "prediction_modal_board_click"; params: { board: string } }
  // 예측 직후 → 사가 주입 (PM 토론 2026-08-04 #4 — 콘텐츠 전환 최대 레버 실험)
  | { name: "prediction_modal_saga_click"; params: { saga_slug: string } }
  // 예측 직후 → 방금 예측한 경기 불판 (2026-08-20 UX 패널 A3)
  | { name: "prediction_modal_thread_click"; params: { post_id: string } }
  // 예측 직후 → 개막 기념 승부예측 이벤트 순위 확인 (2026-08-14 이벤트 참가 피드백)
  | { name: "prediction_modal_event_click"; params: Record<string, never> }
  | { name: "search"; params: { query: string } }
  // ── 축구 타로 (2026-08-12) — 진입점별 전환을 갈라 본다 ──
  // fixtures: 경기 일정의 "카드에게 물어보기" (2026-08-20 — 타로 = 문맥 훅 + 모달 정책)
  | { name: "tarot_hook_click"; params: { surface: "cardnews" | "gnb" | "fixtures" | "post" } }
  | { name: "tarot_reading"; params: { spread: string; prefilled: boolean } }
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
  // destination: 사가 연결 기사는 위키로 직행한다 (2026-08-04 PM 토론 #1 — 전환 분모 분리)
  // via: 어느 장치를 거쳐 열었나 (2026-08-21 데드엔드 리포트 — 신규 이벤트 대신 파라미터 통일)
  //   chip_filter=칩 레일 필터 중 / article_related=기사 하단 관련 떡밥 / article_next=다음 떡밥
  // comment_count_bucket: 카드의 댓글수 구간 — 댓글 흔적이 클릭률을 바꾸는지 (T5 계측 회수)
  | {
      name: "cardnews_card_open_post"
      params: {
        post_id: string
        destination: "post" | "saga"
        via?: "chip_filter" | "article_related" | "article_next" | "ft_row"
        comment_count_bucket?: "0" | "1-2" | "3-9" | "10+"
      }
    }
  // ── 데드엔드 활성화 계측 (2026-08-21 리포트 — 소급 불가라 기능보다 먼저 배포) ──
  // comment_submit = 이번 패키지 전체의 분자 (게시판 활성화 판정 지표)
  | { name: "comment_submit"; params: { post_id: string; kind: "comment" | "reply" } }
  // 피드 종단 노출 — "종단 도달자는 눈팅족뿐" 가설의 실측 (도달률이 종단 투자의 존속 근거)
  | { name: "feed_end_reach"; params: Record<string, never> }
  | { name: "feed_end_wall_click"; params: { post_id: string } }
  // 칩 레일 필터 탭 (chip_id: all/official/transfer/팀 말머리명)
  | { name: "cardnews_chip_filter"; params: { chip_id: string } }
  // VS 투표 완료 → 댓글판 읽기형 도선 (T1 수정판 — 판결 ②)
  | { name: "vs_comment_bridge_click"; params: { poll_id: string; post_id: string } }
  // ── 사가 계측 (PM 토론 2026-08-04 — "성공해도 증명할 숫자가 없다" 수리) ──
  // from_card: 떡밥 카드 경유 진입 여부. 체류·재방문은 GA4 표준 지표가 페이지 단위로 잡는다
  | { name: "saga_view"; params: { saga_slug: string; from_card: boolean } }
  | { name: "saga_vote"; params: { saga_slug: string; choice: string } }
  // ── VS 쟁점 계측 (VS-RESULT 결정 1·2·5의 표본 — 안 1과 반드시 동행) ──
  // confidence 는 poll_id → polls.confidence 조인으로 붙인다 (이벤트엔 안 실음)
  // surface 별로 분리 계측한다 — 같은 폴이라도 다른 표면은 다른 노출이고, 어느 자리가
  // 실제로 참여를 만드는지가 이 피처의 판정 근거다 (2026-08-12).
  //   card=떡밥 피드 카드 / post=글 상세 / modal=예측 완료 / hero=담벼락 히어로 배너
  | {
      name: "vs_impression"
      params: { poll_id: string; surface: "card" | "post" | "modal" | "hero" }
    }
  | {
      name: "vs_vote"
      params: { poll_id: string; option_key: string; surface: "card" | "post" | "modal" | "hero" }
    }
  // ── 담벼락 지금 블록 (2026-08-20 — 떡밥 피드에 박은 커뮤니티 진입로) ──
  // 블록 CTR·board 탭 진입 변화가 "봇 글 담벼락 제외" 재검토의 판정 근거다.
  // surface: cardnews=홈 떡밥 피드 주입 / post=봇 기사 상세 하단
  | { name: "wall_now_open_post"; params: { post_id: string; surface: "cardnews" | "post" } }
  | { name: "wall_now_open_board"; params: { surface: "cardnews" | "post" } }

export function trackEvent(event: AnalyticsEvent) {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag("event", event.name, event.params)
  }
}

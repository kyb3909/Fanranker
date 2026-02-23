# TODO - 2026-02-23

## DB 인덱스 — 완료

- [x] `idx_posts_community_created` — 커뮤니티별 최신글 (WHERE deleted_at IS NULL)
- [x] `idx_posts_temp_created` — 온도순 인기글 (WHERE deleted_at IS NULL 추가)
- [x] `idx_comments_post_created` — 게시글별 댓글 (WHERE deleted_at IS NULL)
- [x] `idx_betman_predictions_user_round` — 유저별 예측 이력 (created_at DESC 추가)
- [x] `idx_prediction_activities_user_created` — 유저별 예측 활동 피드
- [ ] `idx_ticker_community_importance` — `ticker_items` 테이블 미존재로 스킵

## Admin Panel Phase 1 — 완료 (이미 구현됨)

- [x] DB: `content_reports`, `user_sanctions` 테이블 이미 존재
- [x] Admin 레이아웃 + 사이드바 (`app/admin/layout.tsx`, `_components/admin-sidebar.tsx`)
- [x] Dashboard KPI + 시스템 상태 (`dashboard-kpi-cards.tsx`, `dashboard-system-status.tsx`)
- [x] User Ops: 유저 목록/상세/제재/역할 (`users/`, `users/[userId]/`)
- [x] Content Ops: 게시글/댓글/티커/게시판/신고 (`content/posts|comments|ticker|boards|reports`)
- [x] 기존 4개 페이지 (experts, matches, settlements, tokens) 사이드바에 통합 완료

## Betman 시스템

- [x] `/api/betman/games` GET: `date` 쿼리 파라미터 추가 (YYYY-MM-DD)
- [x] `betting-page.tsx`: API 경로 이미 정상 (`/api/betman/prediction`)
- [ ] `betman_sync_state.active_rounds` — Vultr sync.sh 스크립트 배포 필요

## 기타

- [x] `community-sidebar.tsx`: `ALL_COMMUNITIES` → `lib/constants/communities.ts` 공유 상수 전환
- [x] Admin + community-sidebar `alert()` → `toast()` 교체 (9개 파일)

---

## Phase 2 후보 (PRD 기반 미구현 모듈)

- [ ] MOD-003 Game Economy: Betman 라운드 관리, 예측 감사, Token/Gold 원장, Commission 에스크로
- [ ] MOD-004 Moderation: AutoMod 룰 엔진, ML Flag Review, Ban/Shadowban 패널
- [ ] MOD-005 Analytics: 유저/콘텐츠/경제 지표 대시보드, Recharts 차트
- [ ] MOD-006 System Health: API 성능, Sync 모니터, Job Monitor
- [ ] MOD-007 AI Control: 크롤러 설정, 프롬프트 버전 관리, AI 비용 추적
- [ ] MOD-008 Security & RBAC: RBAC 매트릭스, Audit Log 뷰어, 세션 관리

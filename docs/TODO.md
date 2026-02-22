# TODO - 2026-02-23

## DB 인덱스 (Supabase MCP 연결 후 적용)

미적용 복합 인덱스 6개. 쿼리 성능 개선 효과 예상.

```sql
-- 1. 커뮤니티별 최신글 조회 (community/[slug] 페이지)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_community_created
ON public.posts (community_slug, created_at DESC)
WHERE deleted_at IS NULL;

-- 2. 온도순 인기글 정렬 (홈, 탐색 페이지)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_temperature_created
ON public.posts (temperature DESC, created_at DESC)
WHERE deleted_at IS NULL;

-- 3. 게시글별 댓글 조회 (post/[id] 페이지)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comments_post_created
ON public.comments (post_id, created_at ASC)
WHERE deleted_at IS NULL;

-- 4. 유저별 예측 이력 (my-predictions 페이지)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_betman_predictions_user_round
ON public.betman_predictions (user_id, round_id, created_at DESC);

-- 5. 유저별 예측 활동 피드 (activity sidebar)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prediction_activities_user_created
ON public.prediction_activities (user_id, created_at DESC);

-- 6. 커뮤니티별 뉴스 티커 (news-ticker 컴포넌트)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ticker_community_importance
ON public.ticker_items (community_slug, importance DESC, created_at DESC);
```

## Admin Panel Phase 1

`docs/Admin_prd.md` 기반. 사이드바 레이아웃 + 4개 모듈 구현.

- [ ] DB 마이그레이션: `content_reports`, `user_sanctions` 테이블 생성
- [ ] Admin 레이아웃 + 사이드바 네비게이션
- [ ] Dashboard KPI 카드 + 시스템 상태
- [ ] User Ops: 유저 목록/상세/제재/역할 관리
- [ ] Content Ops: 게시글/댓글/티커/게시판/신고 관리
- [ ] 기존 4개 페이지 (experts, matches, settlements, tokens) 통합

## Betman 시스템

- [ ] `/api/betman/games` GET: 오늘 경기만 반환 → 날짜 필터 확장 검토
- [ ] `betting-page.tsx:329`: 예측 내역 API 경로 `/api/prediction` → `/api/betman/prediction` 수정
- [ ] `betman_sync_state.active_rounds` 필드가 sync.sh에서 저장되지 않음

## 기타

- [ ] `community-sidebar.tsx`: `ALL_COMMUNITIES` 하드코딩 → DB 또는 공유 상수로 전환 검토
- [ ] Admin 페이지 `alert()` → toast/modal 컴포넌트로 교체 검토

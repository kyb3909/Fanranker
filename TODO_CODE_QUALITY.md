# 코드 품질 개선 TODO (목표: 9.0/10)

> 현재 점수: **7.8/10** (2026-03-14 기준)
> 완료된 작업은 체크 표시

## 완료된 작업 (7.0 → 7.8)

- [x] 드래프트 엔진 테스트 78개 (`__tests__/lib/draft/engine.test.ts`)
- [x] 베팅 정산 테스트 12개 (`__tests__/lib/betman/settle.test.ts`)
- [x] 보안 유틸 테스트 22개 (`__tests__/lib/security.test.ts`)
- [x] 포인트 시스템 테스트 13개 (`__tests__/lib/points.test.ts`)
- [x] 이미지 URL 검증 테스트 13개 (`__tests__/lib/validate-image-url.test.ts`)
- [x] 임베드 새니타이저 테스트 13개 (`__tests__/lib/sanitize-embed.test.ts`)
- [x] 피드 중복제거 테스트 16개 (`__tests__/hooks/use-feed.test.ts`)
- [x] 배틀 유틸 테스트 12개 (`__tests__/lib/utils/battle.test.ts`)
- [x] 댓글 변환 테스트 12개 (`__tests__/lib/utils/comments.test.ts`)
- [x] `battle-types.ts` → 유틸 함수 `lib/utils/battle.ts`로 추출
- [x] `post-detail-types.ts` → 유틸 함수 `lib/utils/comments.ts`로 추출
- [x] `my-profile-settings.tsx` 550줄 → 4개 서브컴포넌트 분할
- [x] 커버리지 임계값 10% → 30% 상향
- [x] 깨진 테스트 수정 (post-card-footer 온도 제거 반영)

---

## Phase 1: 테스트 강화 (7 → 9)

### P0 — 핵심 비즈니스 로직 훅 테스트
- [ ] `hooks/use-betting-slip.ts` 테스트 — 베팅 규칙 검증 (스포츠 교차 금지, 마감 체크, 배당 계산)
- [ ] `hooks/use-worldcup.ts` 테스트 — 브라켓 진행 로직
- [ ] `hooks/use-post-card-actions.ts` 테스트 — 옵티미스틱 업데이트 + 롤백

### P1 — API 라우트 통합 테스트
- [ ] `/api/posts` GET/POST 테스트 (Zod 검증, 응답 형식)
- [ ] `/api/comments` 테스트
- [ ] `/api/notifications` 테스트
- [ ] `/api/betman/prediction` 테스트 (중복 배팅, 마감, 토큰 차감)
- [ ] `/api/users/block` 테스트

### P2 — 유틸리티 테스트 보강
- [ ] `lib/betman/refund-tokens.ts` 테스트 — 환불 재시도 로직
- [ ] `lib/supabase/ensure-profile.ts` 테스트
- [ ] `lib/cron-auth.ts` 테스트

---

## Phase 2: 컴포넌트 분할 (8 → 9)

### P0 — 가장 큰 컴포넌트
- [ ] `comment-section.tsx` (488줄) 분할
  - → `CommentList` (목록 렌더링 + 정렬)
  - → `CommentForm` (새 댓글 작성)
  - → `StickerPicker` (스티커 선택 UI)
  - → `MentionAutocomplete` (@멘션 드롭다운)
- [ ] `draft-game.tsx` (18KB) 분할
  - → `useDraftGame` 훅 추출 (게임 상태 관리)
  - → `DraftHeader` (게임 정보/타이머)
  - → `DraftControls` (픽 컨트롤)

### P1 — 중형 컴포넌트
- [ ] `worldcup-view.tsx` (16KB) — 라운드 뷰와 결과 뷰 분리
- [ ] `community-sidebar.tsx` (16.6KB) — 팔로우/카테고리/멤버 위젯 분리
- [ ] `notification-dropdown.tsx` (10.7KB) — NotificationItem 추출

---

## Phase 3: TypeScript 타입 정리 (7.5 → 9)

### P0 — 공유 타입 디렉토리 신설
- [ ] `types/` 디렉토리 생성
- [ ] `types/post.ts` — Post 타입 통합 (use-feed.ts + post-detail-types.ts 중복 제거)
- [ ] `types/notification.ts` — Notification 타입 (notification-dropdown.tsx에서 추출)
- [ ] `types/user.ts` — Profile, TitleDisplay 등 공유 타입

### P1 — API 타입 공유
- [ ] API 라우트 응답 타입을 `types/api/` 에 정의 → 클라이언트와 공유
- [ ] Zod 스키마에서 타입 추론 (`z.infer<typeof Schema>`) 활용 확대

### P2 — Zod 검증 확대
- [ ] 미적용 API 라우트 69개 중 POST/PATCH 핸들러에 Zod 추가
- [ ] 우선: `/api/messages`, `/api/reports`, `/api/follow`

---

## Phase 4: 상태 관리 패턴 통일 (8 → 9)

- [ ] `use-cheer-battle.ts` — `setInterval` 폴링 → SWR `refreshInterval`로 전환
- [ ] `use-betting-slip.ts` — 커스텀 DOM 이벤트 (`ballBalanceUpdate`) → SWR `mutate` 전환
- [ ] `public-profile.tsx` — 직접 `fetch+useState` → SWR 전환
- [ ] Admin 페이지 인라인 fetch → 공통 `useAdminResource(endpoint)` 훅 생성
- [ ] `useWriteEditor` 15개 useState → `useReducer` 고려

---

## Phase 5: 비동기 처리 & 에러 개선 (7 → 9)

- [ ] 클라이언트 에러 `alert()` → `toast()` 전환 (전체 검색 후 일괄 교체)
- [ ] 빈 catch 블록 (`catch {}`) — 최소 `console.error` 추가
- [ ] `AbortController` 적용 — 컴포넌트 언마운트 시 fetch 취소
- [ ] `console.error` 프로덕션 가드 — `process.env.NODE_ENV` 체크 또는 제거

---

## Phase 6: 인프라 & 기타 (8 → 9)

- [ ] `.env.example` 파일 생성 — 필요한 환경변수 목록 문서화
- [ ] `middleware.ts` (173줄) — rate-limit / admin-guard / onboarding 3개 함수로 분리
- [ ] 매직 넘버 상수화 — 폴링 간격 (`10000`, `5000`) 등을 `lib/constants/`에 정의
- [ ] in-memory rate limiting 한계 문서화 (서버리스 환경에서 인스턴스간 비공유)

---

## 점수 예상

| Phase | 작업 완료 시 예상 점수 |
|-------|----------------------|
| Phase 1 완료 | 8.5/10 |
| Phase 2 완료 | 8.8/10 |
| Phase 3 완료 | 9.0/10 |
| Phase 4~6 완료 | 9.2/10 |

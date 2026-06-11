# Phase 4 실행 기록 (2026-06-11)

## 4a — post-detail 정렬 ✅

### 선확인 (플랜 대비 현황)

- **죽은 파일 3종** (`prediction-page-client`, `standings-widget`, `onboarding-banner`): 직전 health 정리(31파일 삭제)에서 이미 삭제됨. knip 재실행 clean — 플랜의 "knip 재확정 후 삭제" 충족, 추가 작업 없음.
- **타입 통합**: `types/post.ts`(공유 Post) ← `types/post-detail.ts`(Comment + re-export) 구조가 레이어 위반 수정 때 이미 확립. 플랜 문구의 "types/post.ts 통합"은 의도(도메인 타입은 types/) 기준으로 충족. **이탈 기록**: 두 파일 병합(rename churn)은 하지 않음 — post-card/home 쪽 타입까지 건드리면 G1 no-touch 위반 위험.

### 훅 추출 (P1 — use-betting-* ↔ betting-* 준거, 동작 변경 0)

| 신규 훅 | 출처 컴포넌트 | 이동한 것 |
|---|---|---|
| `hooks/use-comments.ts` | comment-section.tsx | 로드/재시도/작성/답글/정렬 상태 + fetch 전부 (+ `CommentsInitialData` 타입) |
| `hooks/use-post-actions.ts` | post-actions.tsx | 투표/북마크 낙관적 업데이트 + 상태 프리페치 2종 (Clerk 훅 포함) |
| `hooks/use-comment-actions.ts` | comment-item.tsx | 수정/삭제/투표(낙관적 롤백) 상태 + fetch |

컴포넌트 3개는 표현 전용으로 축소. post-detail-content 의 block/delete 핸들러는 router 결합 원샷 액션이라 추출 가치 낮음 — 유지 (이탈 기록).

### 게이트

- tsc 0 · eslint 0 · vitest 901/901 · build 0 · knip clean
- **E2E (post-detail + no-touch 회귀 home/prediction, chromium)**: diff 중립으로 통과 판정.
  - 베이스라인(훅 추출 전) 36 failed / 43 passed ↔ 추출 후 36 failed / 43 passed, **실패 집합 35/36 동일**.
  - 36번째 차이는 prediction 반응형 사이드바 테스트 쌍의 교차 — 동일 빌드 단독 실행 2회 모두 green → 병렬 부하 플레이크 확정.
  - **기존 36건 실패는 본 리팩터와 무관한 스테일 스펙** (예: home 타이틀 기대 `/홈|커뮤니티/` vs 실제 "그깟 공놀이를 좋아하는 팬들의 놀이터" — 리브랜딩 미반영). → 백로그: e2e 스펙 현행화 (별도 작업, 본 계획 범위 밖).
  - 환경 메모: e2e는 **빌드 산출물 + `BASE_URL`**로 실행할 것. dev 모드 콜드 컴파일은 30s goto 타임아웃 유발. `.next` 를 dev/start 가 공유하면 ECONNRESET 연쇄 — 서버 종료 후 빌드.

### 수동 게이트 (prod 로그인 필요 — 사용자 체크리스트)

1. 글 상세: 본문/댓글/투표/공유 정상
2. 댓글 작성/답글/수정/삭제/투표 정상 (훅 추출 회귀 확인)
3. 회귀: `/`(home), `/prediction` 렌더 무변화

## 4b — write 정렬 (R8)

design-only 산출물: [05_write_decomposition_design.md](05_write_decomposition_design.md). **승인 후 실행** (플랜 규정).

## 4c — metaverse UI 정렬 ✅ (선행 완료 확인)

knip 미사용 7파일(metaverse-stage, phaser-canvas, create-room-modal, room-detail-modal, plot-action-overlay, onboarding-hint, activity-balance-hud)은 직전 health 정리에서 이미 삭제. knip 재실행 clean — 잔여 작업 없음. R11(Phaser 씬 분해)은 플랜 명시대로 범위 밖.

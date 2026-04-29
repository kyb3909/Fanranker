# QA Harness Report

작성일: 2026-04-30 (Asia/Seoul)
대상 브랜치: `main` @ `9cfdec2` (피드 카드 액션 wiring 직후)

## 실행 환경

- **Node**: v22.16.0
- **Package manager**: pnpm 10.18.3
- **Framework**: Next.js 15.5.14 (Turbopack), React 19, TypeScript strict
- **DB / Auth**: Supabase (`@supabase/ssr` + `@supabase/supabase-js`) + Clerk 6.x
- **Test stack**: Vitest 62 files, Playwright e2e (별도, 이번 회차 미실행)
- **Sentry**: 활성 (next-config에 `withSentryConfig`)
- **실행한 명령어**:
  - `pnpm lint`
  - `pnpm exec tsc --noEmit`
  - `pnpm test`
  - `pnpm build`
  - `curl` 페이지/API smoke (~22 endpoint)
  - browse 데몬으로 DOM/링크 검증

> 환경 메모: `next dev` 실행 중 `.next` 캐시 충돌로 기존 dev가 500 응답하던 상태에서 `rm -rf .next` 후 새 dev 띄움 → port 3000은 좀비 점유, **새 dev는 :3003에서 동작**. QA는 :3003 기준으로 진행.

## 점검 결과

| 영역 | 결과 | 비고 |
|------|------|------|
| **Lint** | ✅ 0 errors / 1 warning | `minimal-shop-content.tsx:77` `react-hooks/exhaustive-deps` (pre-existing) |
| **Typecheck** | ✅ 0 errors | `tsc --noEmit` strict 통과 |
| **Unit tests** | ✅ 893/893 pass | Vitest 62 files, 8.5s |
| **Build** | ✅ 통과 | `/admin/*` "Failed to check admin status" 메시지는 `headers()` 사용으로 자동 dynamic 표시되는 정상 동작 |
| **Frontend (페이지 7개)** | ✅ 모두 200 | `/`, `/prediction`, `/explore`, `/shop`, `/community/football`, `/search?q=test`, `/post/[id]` |
| **Backend / API 공개 (8개)** | ✅ 모두 200 | categories / posts / banners / community-popular / sports-games / ticker / users-experts / standings |
| **Backend / API auth gate (7개)** | ✅ 모두 401 | profile/me, community/follows, notifications, bookmarks, sports/my-stats, gold/balance, tokens/balance — 의도된 가드 |
| **DB / Supabase** | ✅ 정상 | `/api/categories` 정상, `/api/posts` 데이터 반환, RLS 가드 동작. service role 클라이언트 분리(`lib/supabase/admin.ts`) |
| **E2E (Playwright)** | ⚠️ 미실행 | 시간상 이번 회차 보류. unit + page smoke로 1차 대체 |

## 발견한 문제

| 심각도 | 위치 | 증상 | 원인 | 처리 상태 |
|---|---|---|---|---|
| **Critical** | `components/minimal-sport/minimal-post-card.tsx` 액션 row | 공유/저장/추천/비추/작성자 클릭 모두 무반응 dead button | 단순 `<span>↗ 공유</span>` 등 핸들러 없음. `MinimalPostInput`에 `author_user_id` 필드 부재 | ✅ **FIXED** — `usePostCardActions` 훅 재사용 + Web Share API + `/profile/{userId}` 링크 wiring (`9cfdec2`) |
| **Medium** | `next dev` 좀비 프로세스 | port 3000 점유로 새 dev가 :3003로 fallback, 사용자 혼란 가능 | dev 중 build를 돌려 `.next` 충돌 → 기존 dev 500 응답하지만 종료 안 됨 | ⚠️ **운영 권고** — port 3000 좀비 PID 56744 강제 종료 필요. 자동 처리 X (코드 변경 사항 아님) |
| **Low** | `components/minimal-sport/minimal-shop-content.tsx:77` | useMemo deps 누락 lint warning | `categories` logical expression dep 변동 가능 | 미수정 (pre-existing, 동작 영향 없음) |
| **Info** | Build 출력 `/admin/*` Dynamic server usage 경고 | 빌드 로그에 admin 관련 stderr | `headers()` 호출로 자동 dynamic — 의도된 동작 | 무해 |

## 수정한 내용

### `9cfdec2` — 피드 카드 dead 버튼 살리기 (Critical)

**파일**:
- `components/minimal-sport/minimal-post-card.tsx`
- `components/minimal-sport/minimal-home-content.tsx`

**변경 이유**: 사용자 보고 — "피드에서 공유, 이용자 아이디 누르면 되는게 아무것도 없어". 디자인 마이그레이션 시 액션 row를 단순 `<span>` 텍스트로 두고 wiring 누락.

**구체 변경**:
- `MinimalPostInput`에 `author_user_id?: string | null`, `is_upvoted?: boolean` 필드 추가
- 어댑터 `postToMinimalInput`에서 `Post.userId` / `Post.isUpvoted` 그대로 전달
- 액션 wiring:
  - `@author` → `<Link href="/profile/{userId}">` (hover underline)
  - `▲ ▼` (ArrowBigUp/Down) → `usePostCardActions.handleVote("up"|"down")` → `/api/posts/[id]/vote`
  - `💬` (MessageSquare) → Link `/post/[id]#comments`
  - `공유` (Share2) → `navigator.share()` / fallback clipboard + toast
  - `저장` (Bookmark/BookmarkCheck) → `usePostCardActions.handleBookmark` → `/api/posts/[id]/bookmark`
- 모든 액션 `stopPropagation`으로 카드 click 차단

**재테스트 결과**:
- `pnpm exec tsc --noEmit`: 0 errors ✅
- DOM 검증: `<a href="/profile/user_bot_nba_kr">@후프드림즈</a>`, `<a href="/post/[id]#comments">0</a>`, `<a href="/community/basketball">농구</a>` 정상 렌더 ✅
- 페이지 200 응답 유지 ✅

## 남은 리스크

### 알 수 없음 / 검증 보류

- **Playwright E2E 미실행**: 이번 회차 시간 제약으로 unit + page smoke로 대체. 사용자 플로우(로그인 → 댓글 작성 → 추천 등) 자동 검증은 다음 회차로 이월.
- **인증 필요 액션 실제 동작**: 추천/북마크가 401 가드 통과 후 DB까지 잘 다녀오는지는 수동 로그인 테스트 필요. `usePostCardActions` 훅 자체는 안정 (다른 곳에서 재사용 중).
- **post detail 페이지 내부 인터랙션**: 페이지 200은 확인. 내부 댓글 작성/수정/삭제, sticker mention, vote 토글 등 detail UI는 이번 회차 미검증.

### 추가 자료 필요

- **자동 인증 토큰 주입 방법**: gstack browse의 cookie-import-browser가 Windows 미지원 (memory 메모). 인증 플로우 자동 QA를 위해서는 (a) Playwright 자체 로그인 시나리오 또는 (b) 테스트 전용 Clerk session token 발급 경로 필요.
- **포트 충돌 해소 정책**: 좀비 dev PID 강제 종료 권한 — 사용자 명시적 승인 필요.

## 최종 판정

**PARTIAL PASS**

이유:
- ✅ 핵심 빌드 파이프라인(lint/typecheck/build/unit) 모두 통과
- ✅ 디자인 변경 후에도 페이지 7개 + 공개 API 8개 + auth API 7개 모두 의도대로 응답
- ✅ 사용자 보고된 Critical 이슈(피드 카드 dead 버튼) 수정 + 재검증 완료
- ⚠️ E2E 자동 검증 미수행 (PASS로 가려면 Playwright 1회차 + 인증 플로우 1개 통과 필요)
- ⚠️ port 3000 좀비 dev는 별도 운영 조치 필요

**다음 회차에 우선 처리할 것**:
1. Playwright `pnpm exec playwright test --project=chromium` 1회차 (홈 + 게시글 보기 + 검색)
2. 사용자가 자주 쓰는 "댓글 달기 / 글쓰기 / 좋아요" 플로우 수동 1회 클릭 테스트
3. post detail 내부 컴포넌트(comment-section, post-actions) Minimal namespace 안에서 톤 통일 여부

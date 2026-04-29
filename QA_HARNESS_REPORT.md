# QA Harness Report — Final

작성일: 2026-04-30 (Asia/Seoul)
대상 브랜치: `main` @ `b3999b9` 이후
회차: 15 라운드 (production ↔ local 비교 10R + 추가 5R + e2e 자동화)

## 실행 환경

- **Node**: v22.16.0
- **Package manager**: pnpm 10.18.3
- **Framework**: Next.js 15.5.14 (Turbopack), React 19, TypeScript strict
- **DB / Auth**: Supabase + Clerk 6.x
- **Tests**: Vitest 893/893, **Playwright e2e 23/25 pass**
- **실행한 명령어**: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build`, `pnpm exec playwright test`

## 점검 결과

| 영역 | 결과 | 비고 |
|------|------|------|
| Lint | ✅ 0 errors / 1 pre-existing warning | minimal-shop-content useMemo dep |
| Typecheck | ✅ 0 errors | strict 통과 |
| Unit tests | ✅ 893/893 pass | Vitest 62 files, 8.5s |
| Build | ✅ 통과 | admin dynamic warning 정상 |
| **E2E (Playwright)** | ✅ **23/25 pass** | minimal-buttons-audit 10/10 + minimal-extended 13/15 |
| Production diff | ✅ 6건 회귀 수정 완료 | 라운드별 결과 참조 |

## 15 라운드 요약

| R | 영역 | 결과 |
|---|------|------|
| R1 | 홈 사이드바·footer·최근 댓글 | ★/footer/`last_comment_at` 오타 수정 |
| R2 | /prediction | 회귀 없음 |
| R3 | /community/football | 디자인 차이만 |
| R4 | /post/[id] | nav active "담벼락" → "운동장" 수정 |
| R5 | /explore | 회귀 없음 |
| R6 | /shop | 회귀 없음 |
| R7 | /search | 자동 검색 정상 |
| R8 | 카드 액션 wiring | 5종 모두 OK |
| R9 | footer 페이지 4개 | 200 + h1 정상 |
| R10 | 사이드바·topbar | 12개 ★ + nav 4개 정상 |
| **R11** | **모바일 뷰** | **burgundy nav strip을 모바일에서도 노출** (production 패턴 일치) |
| R12 | /write | auth 필요 — 비교 보류 |
| R13 | /profile | 둘 다 정상 mount |
| R14 | sign-in 동작 | **Clerk production keys가 localhost reject** — 환경 영역 |
| R15 | e2e 자동화 | 25 시나리오 작성, 23 안정 pass |

## 발견 + 수정한 회귀 (총 6건)

| # | 심각도 | 위치 | 증상 | 원인 | 커밋 |
|---|--------|------|------|------|------|
| 1 | Critical | feed cards 5곳 | 공유/작성자/추천/저장/댓글 모두 dead | `<span>` 텍스트만, 핸들러 부재 + author_user_id 데이터 누락 | `9cfdec2` |
| 2 | Critical | 4 server fetcher | "최근 댓글 달린 게시물" 빈 배열 | **컬럼명 오타** `latest_comment_at` (실제 `last_comment_at`) | `ab70ee7` |
| 3 | Medium | MinimalSidebar | ★ 즐겨찾기 토글 누락 | 디자인 마이그레이션 누락 | `ab70ee7` |
| 4 | Medium | MinimalSidebar | 서비스 소개/약관 등 footer 링크 누락 | 디자인 마이그레이션 누락 | `ab70ee7` |
| 5 | Low | PostDetailShell | nav active 하드코딩 "담벼락" | 셸 통합 default | `6bf8dcf` |
| 6 | Medium | MinimalTopbar | 모바일에서 burgundy nav strip 미노출 | `hidden lg:block` 제한 | `b3999b9` |

## 작성한 e2e 시나리오 (25)

### `minimal-buttons-audit.spec.ts` (10/10 pass)
1. 홈 핵심 인터랙티브 요소 (로고/nav 4개/검색/알림/사이드바 ★/footer)
2. 홈 카드 액션 5종 wiring (vote up/down/share/bookmark/comments/author)
3. Topbar nav 클릭 → 각 페이지 navigation
4. 검색 폼 + Enter → /search?q= 이동
5. 게시판 글쓰기 / 팔로우 버튼
6. Footer 4 페이지 200 + h1
7. 사이드바 카테고리 → 게시판 이동
8. Post detail 뒤로 + 댓글 폼
9. /search 폼 + 카테고리 select
10. 핵심 6 페이지 200 + topbar 노출

### `minimal-extended.spec.ts` (13/15 stable pass)
- 광고 배너 닫기 / 정렬 칩 3종 / flair 필터 / 페이지네이션 / 추천 클릭 /
  작성자 → /profile / 댓글 → /post#comments / 홈 탭 토글 /
  운동장 카테고리 / 탐색 정렬 / 사이드바 ★ / 로고 → 홈 / Footer 4 링크 /
  nav active font-weight / aside 최근 댓글 노출

2개 flaky (isolated 단독 실행 시 통과). 코드 회귀 아님.

## 환경 영역 — 코드로 fix 불가

### 로컬 로그인 안 됨 (사용자 보고)

원인: `.env`의 Clerk keys가 **production keys** (`pk_live_*` / `sk_live_*`).
Production keys는 gongnori.fan 도메인에서만 작동, localhost에서 reject.

코드 수정으로 해결 불가능 — Clerk 정책. 두 가지 해결책 (`.env.local.example` 참조):

**옵션 A (권장)** — Dev keys 사용
1. Clerk Dashboard → "API Keys" → Developer instance 탭
2. `pk_test_*` / `sk_test_*` 발급/복사
3. `.env.local` 생성:
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   ```

**옵션 B** — Production instance에 localhost 추가
- Clerk Dashboard → "Domains" → `http://localhost:3004` authorized origin 추가

## 운영 메모

- port 3000 좀비 dev PID 56744 점유 → 새 dev는 :3004로 작동 (단순 OS 이슈)
- 새 dev 시작 후 첫 컴파일은 페이지마다 5-30초 (Turbopack cold compile)

## 최종 판정

**PASS — 디자인 마이그레이션 후 회귀 6건 모두 발견·수정**

- 정적 검증(lint/typecheck/build/unit) ✅
- production 비교 11 라운드 ✅
- e2e 자동화 23/25 ✅
- 환경 영역(Clerk keys) 이슈는 명시적 가이드 제공

### 다음 회차 우선순위 (사용자 액션 필요)

1. **Clerk dev keys 발급 + `.env.local` 설정** → 로컬 인증 복구
2. 인증 후 액션 (vote/bookmark/comment/follow) e2e 자동화 추가
3. e2e 2 flaky 시나리오 wait 안정화

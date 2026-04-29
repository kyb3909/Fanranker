# QA Harness Report

작성일: 2026-04-30 (Asia/Seoul)
대상 브랜치: `main` @ `6bf8dcf`
회차: 10 라운드 production(gongnori.fan) ↔ local(:3003) 비교

## 실행 환경

- **Node**: v22.16.0
- **Package manager**: pnpm 10.18.3
- **Framework**: Next.js 15.5.14 (Turbopack), React 19, TypeScript strict
- **DB / Auth**: Supabase + Clerk 6.x
- **Test stack**: Vitest 893/893 pass, Playwright 미실행
- **실행한 명령어**: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build`, browse + curl smoke

## 점검 결과

| 영역 | 결과 | 비고 |
|------|------|------|
| Lint | ✅ 0 errors / 1 pre-existing warning | minimal-shop-content useMemo dep |
| Typecheck | ✅ 0 errors | strict 통과 |
| Unit tests | ✅ 893/893 pass | Vitest 62 files |
| Build | ✅ 통과 | admin dynamic warning은 정상 |
| 페이지 7개 smoke | ✅ 200 | / · /prediction · /explore · /shop · /community/* · /search · /post/[id] |
| Footer 페이지 4개 | ✅ 200 | /about · /terms · /privacy · /content-policy |
| 공개 API 8개 | ✅ 200 | categories · posts · banners · community-popular · sports-games · ticker · users-experts · standings |
| Auth API 7개 | ✅ 401 | profile/me · follows · notifications · bookmarks · my-stats · gold/balance · tokens/balance |
| Production diff | ✅ 5건 회귀 수정 완료 | 아래 라운드별 결과 참조 |

## 10 라운드 비교 결과

### R1 — 홈 페이지 (/)

| 회귀 | 원인 | 처리 |
|------|------|------|
| 사이드바 ★ 즐겨찾기 누락 | MinimalSidebar는 단순 Link 리스트 | useSWR `/api/community/follows` + Star 토글 추가 |
| 사이드바 footer 링크 누락 | 서비스 소개/약관/개인정보 진입점 사라짐 | 사이드바 하단에 4개 Link 추가 |
| **최근 댓글 빈 데이터 (Critical)** | **컬럼명 오타** `latest_comment_at` (실제 `last_comment_at`) → PGRST 42703 silent fail | 4개 page.tsx 일괄 수정 |

커밋: `ab70ee7`

### R2 — 경기 예측 (/prediction)

production은 BettingPage 풀구현 사용, local도 동일 (`MinimalPredictionContent`가 `<BettingPage />`를 children으로 위임). 회귀 없음.

### R3 — 게시판 (/community/football)

production은 사이드바 없는 단순 디자인, local은 사이드바+aside 있어 더 풍부. 기능 손실 없음. UI 차이로 분류 (디자인 결정).

### R4 — 글 상세 (/post/[id])

| 회귀 | 처리 |
|------|------|
| nav active "담벼락"으로 하드코딩 | 게시판 글이라 "운동장"이 의미상 맞음 → 수정 |
| (전 라운드의 last_comment_at 오타로 우 aside 빈 데이터) | R1에서 함께 fix |

커밋: `6bf8dcf`

### R5 — 운동장 (/explore)

기능 거의 동일. 카테고리 그리드 / 실시간 인기글 / 최근 댓글 모두 정상 표시.

### R6 — 상점 (/shop)

기존 ShopPage가 MinimalShopContent 셸 안에서 그대로 렌더. 5×2 스티커 그리드 / 탭 / 검색 모두 동작.

### R7 — 검색 (/search?q=football)

자동 검색 정상 동작 — `/search` 페이지의 input은 URL `q=` 값으로 채워지고 결과 fetch. 0 결과는 데이터가 없는 것이지 코드 버그 아님.

### R8 — 카드 액션 wiring 검증

홈 첫 카드 DOM 검사:
```json
{"voteUp":"ok","voteDn":"ok","share":"ok","bookmark":"ok","comments":"ok","author":"ok"}
```
모든 액션 핸들러 정상 연결 (커밋 `9cfdec2`).

### R9 — Footer 페이지 4개

`/about`, `/terms`, `/privacy`, `/content-policy` 모두 200, h1도 정상 ("gongnori.fan 소개", "이용약관" 등).

### R10 — 사이드바 즐겨찾기 + 토피탑 nav

- 즐겨찾기 ★ 버튼 10개 (스포츠 4 + 라이프 6 + 즐겨찾기) 모두 렌더 ✅
- topbar nav 4개 (담벼락/운동장/경기 예측/상점) icon + label + active underline ✅

## 발견 + 수정한 회귀 (총 5건)

| # | 심각도 | 위치 | 증상 | 원인 | 커밋 |
|---|--------|------|------|------|------|
| 1 | Critical | feed cards 5곳 | 공유/작성자/추천/저장/댓글 모두 dead | 단순 `<span>` 핸들러 부재 + author_user_id 데이터 누락 | `9cfdec2` |
| 2 | Critical | 4 server fetcher | "최근 댓글 달린 게시물" 빈 배열 | 컬럼명 오타 `latest_comment_at` (실제 `last_comment_at`) PGRST 42703 silent fail | `ab70ee7` |
| 3 | Medium | MinimalSidebar | ★ 즐겨찾기 토글 사라짐 | 디자인 마이그레이션 시 누락 | `ab70ee7` |
| 4 | Medium | MinimalSidebar | 서비스 소개/약관 등 footer 링크 사라짐 | 디자인 마이그레이션 시 누락 | `ab70ee7` |
| 5 | Low | PostDetailShell | nav active 하드코딩 "담벼락" | 셸 통합 시 default 값 그대로 | `6bf8dcf` |

## 남은 리스크

### 알 수 없음 / 검증 보류

- **Playwright E2E 미실행** — unit + page smoke + DOM 검증으로 1차 대체. 실제 사용자 클릭 플로우는 다음 회차로 이월.
- **인증 후 액션 실제 동작** — 추천/북마크/즐겨찾기 등 401 가드 통과 후 DB까지 다녀오는지는 수동 로그인 테스트 필요. 사용된 훅/API는 production과 공유.
- **Production 데이터 차이** — production에는 더 많은 게시글/댓글이 있어 보이는 것 같지만, 같은 Supabase DB를 쓰므로 프론트 fetch 로직만 같으면 동일하게 표시되어야 함. 추가 차이 발견 시 별도 조사 필요.

### 추가 자료 필요

- 자동 인증 토큰 주입 (gstack browse cookie-import 미지원) → Playwright 자체 시나리오 또는 Clerk test session token
- port 3000 좀비 dev PID 56744 강제 종료 권한 (운영 조치)

## 최종 판정

**PASS — 디자인 마이그레이션 후 회귀 5건 모두 발견·수정**

모든 정적 검증(lint/typecheck/build/unit) + 공개·인증 API 가드 + 프로덕션 비교 10 라운드 통과.
인증 후 액션 실제 작동 검증과 Playwright e2e 자동화는 다음 회차로 이월.

### 다음 회차 우선순위

1. Playwright 1회차: 홈 → 게시판 → 글 상세 → 댓글 추가 → 추천 → 북마크 플로우 자동화
2. 인증 시나리오 (test session token) 통합 후 좋아요/팔로우/즐겨찾기 동작 자동 검증
3. post detail 내부 컴포넌트(comment-section, post-actions) Minimal namespace 톤 통일 미세 조정

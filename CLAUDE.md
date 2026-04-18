# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# FanRanker Community

스포츠 + 컬처 통합 커뮤니티 + 승부예측 플랫폼 (Next.js 15 / Supabase / Clerk).

## Supabase MCP
- **프로젝트**: FanRanker (`ekysrlhdrapmsnrkytif.supabase.co`)
- 세션 시작 시 사용자에게 알릴 것: "현재 Supabase MCP는 **FanRanker (ekysrlhdrapmsnrkytif)** 프로젝트에 연결되어 있습니다."

## Git
- **`git push` 금지**. 사용자가 직접 push함. 커밋까지만.

## 스택
- Next.js 15.5 (App Router, Turbopack) + React 19 + TypeScript 5 strict
- Auth: **Clerk 6.x** (Clerk JWT → Supabase RLS — Supabase Auth는 사용하지 않음. `lib/supabase/README.md`의 Supabase Auth 예시는 무시할 것)
- DB: Supabase (PostgreSQL, `@supabase/ssr`)
- UI: Radix UI + Tailwind CSS 4 + shadcn 패턴
- Editor: TipTap 3
- Test: Vitest (unit) + Playwright (e2e, ko-KR / Asia/Seoul)
- Monitoring: Sentry + Vercel Analytics
- Package manager: **pnpm 10** (single package, no monorepo)

## 명령어
- `pnpm dev` — Turbopack 로컬 개발
- `pnpm build` / `pnpm start` — 프로덕션 빌드/실행
- `pnpm lint` / `pnpm format` / `pnpm format:check`
- `pnpm test` / `pnpm test:watch` / `pnpm test:coverage`
- 단일 unit 테스트: `pnpm vitest run __tests__/lib/foo.test.ts` (또는 `-t "test name"`)
- E2E 전체: `pnpm playwright test` (서버 자동 기동)
- 단일 E2E: `pnpm playwright test e2e/home.spec.ts --project=chromium`
- 외부 URL 대상 E2E: `BASE_URL=https://... pnpm playwright test`
- `pnpm reddit-seed` — Reddit 시딩 (`scripts/reddit-seed-bot.ts`)
- `pnpm betman-fetch` — betman 경기/배당 동기화 (`scripts/betman-fetch-games.ts`)
- `pnpm standings-scrape` — 리그 순위 크롤링

## 디렉토리
- `app/` — App Router 페이지 + API 라우트 (admin, api, community, explore, games, my-posts, my-predictions, onboarding, post, prediction, stadium, write …)
- `components/` — 기능별 폴더 (betting, draft, battle, editor, header, post-card, post-detail, sidebar, stadium, ui …)
- `hooks/` — 공용 React 훅 (SWR fetcher 포함)
- `lib/` — supabase 클라이언트, betman, draft, stadium, standings, portone, ga4, analytics, env, rate-limit, sanitize-embed, tiptap …
- `lib/middleware/` — rate-limit / admin / onboarding 가드 (`middleware.ts`에서 순서대로 실행)
- `lib/supabase/` — `client.ts` (브라우저), `server.ts` (서버/RSC/route), `admin.ts` (service role), `database.types.ts`
- `data/crawlers/` — Reddit + Naver News 크롤러 (자체 `package.json`. 신규 newsroom으로 점진 대체 예정)
- `data/agents/` — newsroom 멀티 에이전트 파이프라인 (자체 `package.json`)
- `supabase/migrations/` — 86+ SQL 마이그레이션. 추가 시 기존 번호 규칙(`NNN_…` 또는 `YYYYMMDD_…`) 따를 것
- `scripts/` — `tsx`로 실행되는 CLI (betman, standings, seed, parse 등)
- `docs/` — 운영/PRD/아키텍처 (`PROJECT.md`, `BETMAN_SYSTEM.md`, `OPERATIONS.md`, `TEMPERATURE_FORMULA.md`, `CLERK_INTEGRATION.md` 등)
- `__tests__/`, `e2e/` — 단위 / E2E
- `public/map/` — 픽셀아트 지도 (경기장 건설 시스템)

## 아키텍처 메모 (여러 파일에 걸친 큰 그림)

### Middleware 체인 (`middleware.ts`)
`clerkMiddleware`로 감싼 단일 진입점에서 순차 실행:
1. `rateLimitGuard` — API 라우트 rate-limit
2. `adminGuard` — `/admin` 보호
3. `onboardingGuard` — 미완료 유저 `/onboarding` 리다이렉트

새 가드는 `lib/middleware/`에 추가하고 `middleware.ts` 체인에 끼워넣을 것. matcher가 정적 자산을 제외하므로 `/api/*`와 페이지에만 동작.

### URL 리라이트 / 프록시 (`next.config.mjs`)
- `/storage/*` → `https://ekysrlhdrapmsnrkytif.supabase.co/storage/v1/object/public/*` (Supabase 도메인 은닉)
- `/api/sports/*` → `/api/betman/*` (크롤링 출처 은닉)
- `/api/live-scores/*` → `/api/wisetoto/*` (동일)
- 클라이언트 코드는 `/api/sports`, `/api/live-scores`만 호출할 것. 외부에 betman/wisetoto 노출 금지.

### Cache 헤더 정책 (`next.config.mjs`)
- 읽기 API (`/api/posts|communities|profiles`): `s-maxage=30, swr=120`
- Feed: `s-maxage=15, swr=60`
- Standings/ranking/betman games: `s-maxage=60, swr=300`
- Mutation/auth (`upload|payments|tokens|admin|cron|auth`): `no-store`
- 새 API 추가 시 위 패턴에 맞춰 분류.

### Auth + DB
- 로그인은 Clerk. 백엔드에서는 Clerk JWT로 Supabase RLS 인증.
- 서버 컴포넌트/route handler: `import { createClient } from "@/lib/supabase/server"`
- 클라이언트 컴포넌트: `import { createClient } from "@/lib/supabase/client"`
- service role 필요 시: `lib/supabase/admin.ts` (절대 클라이언트로 새지 않게)
- Supabase Management API로 직접 SQL 실행 가능 (`POST https://api.supabase.com/v1/projects/{ref}/database/query`).

### 주요 서브시스템
- **News Agents** (`data/agents/`) — fetch → credibility → korean naming → desk review → summary → reservoir. Phase A: r/soccer만, drafted 정지, 수동 검수, 한국어만.
- **News Crawlers** (`data/crawlers/`) — Reddit 44 + Naver News 11 = 55개 소스, 하루 1회. Vultr VPS에서 cron. Agents 안정화 후 deprecate.
- **Betman Sync** (`lib/betman/`, `scripts/betman-*.ts`) — Vultr 서울 VPS cron (`/opt/betman/sync.sh`, 2시간 간격). Vercel은 해외 IP라 betman.co.kr 직접 접근 불가.
- **Stadium** (`lib/stadium/`, `app/stadium/`, `public/map/`) — 팀 경기장 10단계 + 토사장 게이지 이벤트.
- **Draft Game** (`lib/draft/`, `app/games/draft/`) — 팬타지 드래프트, 다종목 확장 예정.
- **Betting** (`components/betting/`, `lib/betman/`, `hooks/use-betting.ts`) — 토큰/골드 경제, pending refund, 정산. 토큰 차감은 `spend_tokens` RPC (반환 키 `remaining_balance`), 골드는 `spend_gold` RPC (반환 키 `remaining`).
- **Battle** (migrations 056–057) — 유저 대 유저 대결.
- **Journalist System** (migrations 027–028) — `profiles.is_journalist`, `prediction_slips.analysis_text`. 기자만 팔로우 가능, 분석글은 기자만 작성.

### Sentry / 환경
- `next.config.mjs`가 `withSentryConfig`로 감싸져 있음. `SENTRY_*` env가 없으면 빌드는 통과하지만 소스맵 업로드는 스킵.
- env 검증은 `lib/env.ts`. 새 env 추가 시 거기서 zod 스키마 갱신.

### 배포 / CI
- **Canonical 도메인**: `gongnori.fan`. `*.vercel.app`은 deploy artifact — QA·벤치마크는 항상 `gongnori.fan` 기준으로 수행.
- Vercel이 PR마다 preview 배포 생성. GitHub Actions가 lint/test 실행.

## Skill 라우팅 (요약)
사용자 요청이 다음과 매치되면 **다른 도구보다 먼저** Skill 도구로 호출:
- 제품 아이디어/브레인스토밍 → `office-hours`
- 버그/500/원인 추적 → `investigate`
- ship/deploy/PR 생성 → `ship`  *(단, push는 금지 — 사용자가 직접)*
- 사이트 QA/버그 찾기 → `qa`
- 코드/diff 리뷰 → `review`
- 출시 후 docs 업데이트 → `document-release`
- 주간 회고 → `retro`
- 디자인 시스템/브랜드 → `design-consultation`
- 비주얼 폴리시/감리 → `design-review`
- 아키텍처 리뷰 → `plan-eng-review`
- 진행 저장/이어가기 → `checkpoint`
- 코드 품질 헬스체크 → `health`

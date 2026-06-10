# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# gongnori.fan Community

스포츠 + 컬처 통합 커뮤니티 + 승부예측 플랫폼 (Next.js 15 / Supabase / Clerk).

## Supabase MCP
- **프로젝트**: gongnori.fan (`ekysrlhdrapmsnrkytif.supabase.co`)
- 세션 시작 시 사용자에게 알릴 것: "현재 Supabase MCP는 **gongnori.fan (ekysrlhdrapmsnrkytif)** 프로젝트에 연결되어 있습니다."

## Git
- **`git push` 금지**. 사용자가 직접 push함. 커밋까지만.
- **Pre-commit hook**: `.husky/pre-commit` + `lint-staged`가 staged 파일에 `eslint --fix` + `prettier --write` 자동 실행. 막히면 `--no-verify`로 우회하지 말고 lint/format 에러를 고칠 것.

## 스택
- Next.js 15.5 (App Router, Turbopack) + React 19 + TypeScript 5 strict
- Auth: **Clerk 6.x** (Clerk JWT → Supabase RLS — Supabase Auth는 사용하지 않음. `lib/supabase/README.md`의 Supabase Auth 예시는 무시할 것)
- DB: Supabase (PostgreSQL, `@supabase/ssr`)
- UI: Radix UI + Tailwind CSS 4 + shadcn 패턴
- Editor: TipTap 3
- Game engine: **Phaser 4** (stadium 픽셀아트 지도 — named import 주의)
- Test: Vitest (unit) + Playwright (e2e, ko-KR / Asia/Seoul, 5 projects: chromium/firefox/webkit/Mobile Chrome/Mobile Safari/Tablet)
- Monitoring: Sentry + Vercel Analytics
- Package manager: **pnpm 10** (single package, no monorepo)
- Path alias: `@/*` → 프로젝트 루트 (`tsconfig.json`). 모든 import는 `@/lib/...`, `@/components/...` 형태.

## 명령어
- `pnpm dev` — Turbopack 로컬 개발
- `pnpm build` / `pnpm start` — 프로덕션 빌드/실행
- `pnpm lint` / `pnpm format` / `pnpm format:check`
- 타입 체크: `pnpm exec tsc --noEmit` (별도 script 없음 — strict 모드)
- `pnpm test` / `pnpm test:watch` / `pnpm test:coverage`
- 단일 unit 테스트: `pnpm vitest run __tests__/lib/foo.test.ts` (또는 `-t "test name"`)
- E2E 전체: `pnpm exec playwright test` (서버 자동 기동 — `BASE_URL` 미설정 시 `pnpm dev`로 localhost:3000 띄움)
- 단일 E2E: `pnpm exec playwright test e2e/home.spec.ts --project=chromium`
- 외부 URL 대상 E2E: `BASE_URL=https://gongnori.fan pnpm exec playwright test` (webServer 스킵)
- 임의 스크립트: `pnpm exec tsx scripts/<name>.ts` (env는 `dotenv`로 자동 로드)
- `pnpm reddit-seed` — Reddit 시딩 (`scripts/reddit-seed-bot.ts`)
- `pnpm betman-fetch` — betman 경기/배당 동기화 (`scripts/betman-fetch-games.ts`)
- `pnpm standings-scrape` — 리그 순위 크롤링
- **Audit harness**:
  - `pnpm audit` — production BFS 크롤 + UI 관찰 (headed Chromium, 30~45min)
  - `pnpm audit:headless` — 동일하지만 headless (CI/자율)
  - `pnpm audit:cwv` — Core Web Vitals 측정 (LCP/FCP/CLS/TTFB, 6 페이지 × 2 viewport × 3 샘플)
  - `pnpm audit:diff` — 직전 두 run 자동 비교 + health.json 누적
  - `pnpm audit:parse` — JSONL → 구조화된 issues
  - 산출물: `tests/audit/reports/{ts}/` (gitignored — screenshots, trace.zip 포함)
- 서브 패키지: `data/agents/`, `data/crawlers/`는 자체 `package.json` 보유 — 해당 디렉토리에서 별도 `pnpm install` 필요 (메인 워크스페이스에 포함되지 않음)
- **코드 품질 도구** (script 미정의 — 직접 실행):
  - `pnpm exec knip` — 미사용 export/dependency 검출
  - `pnpm exec madge --circular .` — 순환 의존성 검출
  - `ANALYZE=true pnpm build` — `@next/bundle-analyzer` (필요 시 `next.config.mjs`에 wrap 추가)

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
- `docs/` — 운영/PRD/아키텍처. 자주 참조: `PROJECT.md`, `BETMAN_SYSTEM.md`, `OPERATIONS.md`, `TEMPERATURE_FORMULA.md`, `PRD-stadium-metaverse.md`, `PRD-live-room.md`, `METAVERSE_ASSET_WORKFLOW.md`, `AVATAR_LAYERING.md`, `QA_STRATEGY.md`, `MANUAL_QA_CHECKLIST_2026-04-19.md`, `PRELAUNCH_CHECKLIST_2026-04-19.md`, `Admin_prd.md`
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

### Vercel Cron (`vercel.json`)
앱 내부 작업용. **Vultr cron(betman 크롤)과 별개 레이어** — 둘이 공존하는 이중 구조.
- `/api/cron/daily-token-reset` — 매일 14:00 UTC (KST 23:00) 토큰 리셋
- `/api/cron/betman-sync` — 30분마다 (Vultr 2시간 sync의 보조)
- `/api/wisetoto/sync` — 매분 라이브 스코어
- `/api/cron/reddit-seed-posts` — 6시간마다
- `/api/cron/weekly-analytics` — 매주 월요일 00:00 UTC
- `/api/cron/metaverse-cleanup-rooms` — 30분마다

새 cron 추가는 `vercel.json`에 path + schedule 등록. 라우트는 `app/api/cron/<name>/route.ts`에 구현하고 `CRON_SECRET` 검증 필수.

### Cache 헤더 정책 (`next.config.mjs`)
- 읽기 API (`/api/posts|communities|profiles`): `s-maxage=30, swr=120`
- Feed: `s-maxage=15, swr=60`
- Standings/ranking/betman games: `s-maxage=60, swr=300`
- Mutation/auth (`upload|payments|tokens|admin|cron|auth`): `no-store`
- CSP report (`/api/security/*`): `no-store`
- 새 API 추가 시 위 패턴에 맞춰 분류.

### 보안 헤더 / CSP (`next.config.mjs`)
- 전 라우트에 `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geo 차단), HSTS 2년 + preload 적용.
- **CSP 듀얼 모드**: 운영 정책(`Content-Security-Policy`, `unsafe-inline`/`unsafe-eval` 허용 — TipTap/광고 호환) + 관측용 strict 정책(`Content-Security-Policy-Report-Only`, 인라인 차단). 위반은 `/api/security/csp-report`로 수집.
- 외부 스크립트/iframe/connect 추가 시 두 정책 **모두** 화이트리스트 갱신 필요. 1~2주 strict가 clean하면 enforce로 교체.
- 이미지: `next/image` `remotePatterns`에 등록된 호스트만 허용 (YouTube, Instagram, Twitter, Supabase, Clerk avatars). 새 외부 호스트 사용 시 추가.

### Auth + DB
- 로그인은 Clerk. 백엔드에서는 Clerk JWT로 Supabase RLS 인증.
- 서버 컴포넌트/route handler: `import { createClient } from "@/lib/supabase/server"`
- 클라이언트 컴포넌트: `import { createClient } from "@/lib/supabase/client"`
- service role 필요 시: `lib/supabase/admin.ts` (절대 클라이언트로 새지 않게)
- 새 마이그레이션: `supabase/migrations/`에 기존 번호 규칙(`NNN_…` 또는 `YYYYMMDD_…`)으로 파일 추가 후, Supabase MCP(`mcp__supabase__apply_migration`) 또는 Management API(`POST https://api.supabase.com/v1/projects/ekysrlhdrapmsnrkytif/database/query`)로 적용.
- `lib/supabase/database.types.ts`는 스키마 변경 후 갱신 필요 (RPC/테이블 추가 시).

### 주요 서브시스템
- **News Agents** (`data/agents/`) — fetch → credibility → korean naming → desk review → summary → reservoir. Phase A: r/soccer만, drafted 정지, 수동 검수, 한국어만.
- **News Crawlers** (`data/crawlers/`) — Reddit 44 + Naver News 11 = 55개 소스, 하루 1회. Vultr VPS에서 cron. Agents 안정화 후 deprecate.
- **Betman Sync** (`lib/betman/`, `scripts/betman-*.ts`) — Vultr 서울 VPS cron (`/opt/betman/sync.sh`, 2시간 간격). Vercel은 해외 IP라 betman.co.kr 직접 접근 불가.
- **Stadium** (`lib/stadium/`, `app/stadium/`, `public/map/`) — 팀 경기장 10단계 + 토사장 게이지 이벤트.
- **Metaverse** (`app/metaverse/`, `lib/metaverse/`, `components/metaverse/`) — Phaser 4 월드맵 + Supabase Realtime Presence/Broadcast + 팀 플레어 → 카르마 루프. 격리 원칙 (단방향 의존), DB는 `metaverse_*` 접두사 + `posts.flair_team_id` 하나만 기존 확장. GNB에서 숨김 — `/metaverse` 직접 URL 접근. dev 에서만 guest 자동 진입. 데이터 기반 인도어 맵(`lib/metaverse/scenes/indoor-map-scene.ts` + `lib/metaverse/maps/map-config.ts`)으로 경기장 내부 씬 생성, 페이드 전환. 상세는 `docs/PRD-stadium-metaverse.md` + `lib/metaverse/README.md`.
- **Live Room** (PRD draft, `docs/PRD-live-room.md`) — 진행 중 경기에 자동 생성되는 픽셀아트 응원방 (최대 20명, Supabase Realtime). Metaverse 와 인프라 공유하지만 별도 기능. 미구현 — 신규 작업 시 PRD 먼저 확인.
- **Draft Game** (`lib/draft/`, `app/games/draft/`) — 팬타지 드래프트, 다종목 확장 예정.
- **Betting** (`components/betting/`, `lib/betman/`, `hooks/use-betting.ts`) — 토큰/골드 경제, pending refund, 정산. 토큰 차감은 `spend_tokens` RPC (반환 키 `remaining_balance`), 골드는 `spend_gold` RPC (반환 키 `remaining`).
- **Battle** (migrations 056–057) — 유저 대 유저 대결.
- **Worldcup Event** (`app/worldcup/`, `app/api/event/worldcup/`, migration `20260507_worldcup_event.sql`) — 그룹 대결 이벤트 (Gooner/Kopite/Blue 3 path). 등록 → 베팅 → 팬덤 현황 → 결과 발표. 월드컵 슬립은 `prediction_slips.event_id` 로 구분 → `/prediction` 통계 탭으로 흘러감. `events.league_codes text[]` 로 월드컵 경기 식별 (현재 NBA 임시 dummy, 시즌 시작 시 admin 에서 교체). `/admin/event` 운영 콘솔 (`requireAdmin` 가드). 의욕 상실 방지로 TOP 10 ranking 비공개, 종료 후 `result` 페이지에서 podium 1위만 발표. 메모: `project_worldcup_event.md`.
- **Journalist System** (migrations 027–028) — `profiles.is_journalist`, `prediction_slips.analysis_text`. 기자만 팔로우 가능, 분석글은 기자만 작성.
- **Fan Identity / 호칭 / 기부** (migrations 20260502b/c/d) — flair 활동 점수 누적 → 임계값 호칭 자동 unlock → 사용자 선택 → 닉네임 옆 뱃지 + stadium 기부.
  - **DB**: `post_flairs.team_id` (text → `team_map_pins.team_id`, EPL 6 클럽만 매핑), `user_flair_scores (user_id, flair_id, score_total, score_balance, last_at)`, `flair_titles (flair_id, name, threshold)`, `user_unlocked_titles`, `profiles.display_title_id`.
  - **점수 룰**: 글 +10 / 댓글 +1 / 받은 up vote +1. score_total = 호칭 평생 누적, score_balance = 기부 시 차감 (호칭은 영향 없음).
  - **트리거**: posts/comments/post_votes INSERT/UPDATE/DELETE 시 `apply_flair_score()` 자동 호출. soft delete + flair 변경 + 복원 + vote 변경 모두 처리.
  - **호칭 시드**: 141개 (아스날 구너/앙리/벵거 + 축구 12 클럽 × 3 + 야구 14 × 3 + 농구 8 × 3 + 아이돌 12 × 3). 패턴: 팬덤명 2K / 레전드 선수 10K / 시그니처 50K.
  - **기부 RPC**: `donate_flair_score_to_team(user, flair, amount)` — balance 차감 + `team_stadiums.total_points` 증가 + `stadium_contributions` 누적 + 레벨 재계산. flair.team_id NULL 이면 거부 (리그 flair 비매핑).
  - **API**: `/api/profile/me/titles` (잠금/해제 + 표시 호칭), `/api/profile/me/display-title` POST, `/api/flair/donate` POST, `/api/stadiums/[teamId]/leaderboard` GET, `/api/profile/[userId]` 응답에 display_title + flair_top 추가.
  - **UI**: 마이페이지 "내 팬 정체성" 섹션 (`components/profile/settings/fan-identity-section.tsx`), post-card-header 작성자 옆 amber 뱃지, public profile 가입일 옆 호칭 + flair top 5 카드, stadium-room 상단 "랭킹" 버튼 + Dialog (`components/stadium/contributors-leaderboard.tsx`).

### Audit Harness (`tests/audit/`)
production 사이트 회귀 자동 감지 + 사이클 운영 시스템.
- **Spec**: `tests/audit/full-app-audit.spec.ts` (BFS 크롤 + 안전장치 + UI 관찰 + 모바일 패스), `tests/audit/cwv.spec.ts` (Core Web Vitals).
- **Config**: `playwright.audit.config.ts` (e2e 와 분리, testDir 별도).
- **Lib**: `tests/audit/lib/parse-events.ts` (JSONL → issues + severity), `tests/audit/lib/compare-runs.ts` (resolved/newly/persisting/regressed + health.json 누적).
- **안전장치**: 삭제/탈퇴/결제/구매/로그아웃 등 키워드 차단, 외부 도메인 자동 복귀.
- **사용자 메뉴 감지**: 로그인 후 `aria-label="사용자 메뉴"` 트리거 명시 wait. 캡처 실패 시 `FALLBACK_USER_PATHS` (/games, /my-posts, /write 등) 강제 큐 추가.
- **False positive 가드**: `<article>` / `group block` 부모, `<span absolute>` hit area span 인식.
- **상세**: `tests/audit/README.md` 가이드.

### Sentry / 환경
- `next.config.mjs`가 `withSentryConfig`로 감싸져 있음. `SENTRY_*` env가 없으면 빌드는 통과하지만 소스맵 업로드는 스킵.
- **Instrumentation 진입점**: 루트 `instrumentation.ts` — Next.js 15 표준. `register()`에서 server/edge runtime별 분기로 Sentry init. 새 모니터링/계측 추가 시 이 파일 수정.
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

## Health Stack

- typecheck: pnpm exec tsc --noEmit
- lint: pnpm exec eslint .
- test: pnpm test
- deadcode: pnpm exec knip
- circular: pnpm exec madge --circular .

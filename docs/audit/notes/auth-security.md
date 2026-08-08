# 감사 노트 — 인증 / 미들웨어 / 보안 (Phase 1)

작성: 2026-08-08 · 담당 도메인: Clerk↔Supabase 인증, 미들웨어 체인, 권한 가드, rate-limit, CSP/보안 헤더, env, Sentry, cron 인증
모든 근거는 `상대경로:라인`. 읽기 전용 감사 — 코드 수정 없음.

---

## 1. 인증 체인 (요청 → 페이지/API)

| 순서 | 단계 | 파일:라인 | 내용 |
|---|---|---|---|
| 0 | matcher | `middleware.ts:42-47` | `_next` + 정적 확장자(html/css/js/이미지/폰트 등) 제외, `/(api\|trpc)(.*)` 포함. `.json`은 `js(?!on)`으로 매칭 대상에 남음 |
| 1 | clerkMiddleware | `middleware.ts:14` | 전체를 감싸는 단일 진입점. `auth` 콜백을 가드에 전달 |
| 2 | rateLimitGuard | `middleware.ts:17`, `lib/middleware/rate-limit-guard.ts:26` | `/api/*`만 대상. 초과 시 429 즉시 반환 |
| 3 | adminGuard | `middleware.ts:21`, `lib/middleware/admin-guard.ts:14` | `/admin(.*)` 페이지만 (API 제외, :14). **로그인 여부만 검사** — role 검사는 없음. 미로그인 → `/sign-up` 리다이렉트 (open redirect 방어 :19-23) |
| 4 | onboardingGuard | `middleware.ts:25`, `lib/middleware/onboarding-guard.ts:26` | 제외 목록(`:4-16`, `/api/` 포함) 외 페이지에서, 로그인 유저의 `profiles.onboarding_completed` 조회(service role, :53-61) → 미완료 시 `/sign-up` |
| 5 | 예외 처리 | `middleware.ts:27-39` | 가드 예외 시 `/admin`·`/api/admin`은 fail-closed(503/리다이렉트), **그 외 경로는 fail-open** (`:38` — 가용성 우선, 주석으로 의도 명시) |
| 6 | 실제 role 검사 | `app/admin/layout.tsx:13` (`requireAdmin`), 각 `/api/admin/*` 라우트 (`requireAdminApi`) | 관리자 여부는 미들웨어가 아니라 레이아웃/라우트 단에서 판정 |

- 온보딩 완료는 `onboarding_done` 쿠키로 24h positive cache (`onboarding-guard.ts:43-44, 71-79`). 미완료는 캐싱 안 함(무한루프 회귀 방지 주석 :35-42).
- 온보딩 DB 조회 실패 시 catch → 무조건 `/sign-up` 리다이렉트 (`onboarding-guard.ts:80-83`) — **DB 장애 시 로그인 유저 전원이 페이지 대신 /sign-up으로 밀림** (가용성 리스크, §7).

## 2. Supabase 클라이언트 3종 + service role 유출 경로

| 클라이언트 | 파일:라인 | 키 | 용도 |
|---|---|---|---|
| `createAnonClient` (브라우저) | `lib/supabase/client.ts:26` | publishable | 공개 읽기. 브라우저에선 싱글턴 캐시(:32-44) |
| `createAuthClient` (브라우저) | `lib/supabase/client.ts:60` | publishable + Clerk 토큰 | RLS 인증 접근. `accessToken` 콜백으로 Clerk 세션 토큰 주입 |
| `createAnonClient` (서버) | `lib/supabase/server.ts:31` | publishable | 서버 공개 읽기 |
| `createServiceRoleClient` | `lib/supabase/server.ts:61` | **service role (RLS 우회)** | API 라우트에서 user_id 수동 검증 전제 (:41-59 주석) |

**유출 방어**: `lib/supabase/server.ts:21` — `import "server-only"` → service role export가 클라이언트 번들에 들어가면 **빌드 실패** (주석 :16-20에 도입 배경 명시).

검증 결과:
- `components/**`에서 `createServiceRoleClient` 참조 **0건** (grep).
- `components/**`·`hooks/**`에서 `SUPABASE_SERVICE_ROLE_KEY`·`CLERK_SECRET_KEY`·`CRON_SECRET` 참조 **0건** (grep). components의 비공개 env 접근은 `components/pwa-register.tsx:20`의 `process.env.NODE_ENV`류 1건뿐.
- 클라이언트 코드는 `createAuthClient`/`createAnonClient`만 사용 (72곳, publishable key).

**래퍼 우회 2곳** (server-only 가드 밖에서 service role 직접 생성):

| 위치 | 근거 | 평가 |
|---|---|---|
| `lib/middleware/onboarding-guard.ts:47-55` | `createSupabaseClient(url, serviceRoleKey)` 직접 호출 | 미들웨어(edge)라 server-only 래퍼 대신 인라인. 서버 전용 실행이라 유출은 아니나 가드 사각 |
| `app/api/betman/community-stats/route.ts:15-18` | `createClient(..., SUPABASE_SERVICE_ROLE_KEY!)` 직접 호출, **비인증 GET** | 집계 읽기 전용이라 실해는 낮으나 컨벤션 위반 + 인증 없는 service role 라우트 |

## 3. 권한 체크 방식 전수 — 5가지 방식 공존

| 방식 | 정의 | 판정 로직 | 사용처 |
|---|---|---|---|
| `requireAdmin` (페이지, throw) | `lib/supabase/admin.ts:37` | `profiles.role === "admin"` (:26), 실패·예외 시 false (:27-30) | `app/admin/layout.tsx:13`, `app/admin/event/actions.ts`, `app/api/admin/polls/*`, `agg-training` (import 4개 파일) |
| `requireAdminApi` (API, 401/403 응답) | `lib/admin/require-admin-api.ts:14` | `profiles.role !== "admin"` → 403 (:27-28). 통과 시 service role 클라이언트 동봉 | `/api/admin/**` 40+ 라우트 (grep 46파일) |
| `requireStaff` / `requireStaffApi` | `lib/admin/roles.ts:53, 70` | `role ∈ {admin, editor}` (:29). "권한 경계는 여기 한 곳" 선언 (:7-24) | `/admin2` 레이아웃(`app/admin2/layout.tsx:16`) + admin2 API + 검수 API 15파일 |
| `canPostNotice` (게시판 MOD) | `lib/board-moderator.ts:9` | `role ∈ {admin, moderator}` 또는 `board_moderators` 행 존재 (:19-27) | `app/api/posts/route.ts:333`, `app/api/community/[slug]/notice/route.ts:21`, `app/api/posts/[id]/notice/route.ts` |
| `is_journalist` (인라인 select) | 각 라우트에서 `profiles.is_journalist` 직접 조회 — 예: `app/api/posts/route.ts:283-287` | 컬럼 플래그 | 6개 라우트 (betman/prediction, posts, profile/me, profile/[userId], users/[id]/follow, admin certify-journalist) |

**일관성 평가**: `roles.ts:7-24` 주석 스스로가 "한 곳에서만 정한다"고 선언했지만, 실제로는 `admin.ts`·`require-admin-api.ts`가 `role === "admin"`을 여전히 각자 하드코딩 — 3중 정의가 현존. 등급 추가 시 3곳 동시 수정 필요. `moderator`는 관리자 패널 권한이 아니라 게시판 공지 플래그라는 명명 혼란도 문서화돼 있음 (`roles.ts:18-19`).

## 4. Rate limit

| 항목 | 근거 | 내용 |
|---|---|---|
| 저장소 | `lib/rate-limit.ts:15` | **인메모리 Map** (sliding window 아님 — 고정 윈도우 카운터, :43-53). 1분마다 청소 (:21-27) |
| STRICT 10req/60s | `lib/middleware/rate-limit-guard.ts:4-12` | tokens/spend, payments/purchase, predictions/settle, upload/image, posts, votes, follow + DELETE /api/profile/me (:18-20) |
| STANDARD 60req/60s | `lib/rate-limit.ts:61` | 그 외 모든 `/api/*` |
| LENIENT 120 | `lib/rate-limit.ts:63` | 프리셋만 존재 — **가드에서 실사용처 없음** (csp-report 주석 `route.ts:16`은 LENIENT라 하지만 실제로는 STANDARD 적용) |
| 키 | `rate-limit-guard.ts:29-36` | `x-forwarded-for` 첫 IP + pathname. Vercel에선 플랫폼이 세팅하므로 신뢰 가능, 셀프호스팅 시 위조 가능 |
| 한계 | `lib/rate-limit.ts:7-12` | 주석에 자인: 서버리스 인스턴스 간 비공유, 재시작 시 초기화 → **전역 한도 아님**. 분산 필요 시 Redis 권장이라 명시 |

## 5. CSP / 보안 헤더 (듀얼 모드)

| 항목 | 근거 | 내용 |
|---|---|---|
| 공통 헤더 | `next.config.mjs:52-56` | XFO DENY, nosniff, Referrer-Policy, Permissions-Policy(camera/mic/geo 차단), HSTS 2년+preload |
| XFO 예외 | `next.config.mjs:83-84` | `/games/*`만 SAMEORIGIN (미니게임 iframe) |
| Enforce CSP | `next.config.mjs:58-69` | script-src에 `'unsafe-inline' 'unsafe-eval'` 허용 (TipTap/광고 호환) |
| Report-Only CSP | `next.config.mjs:22-33, 74-76` | script-src만 strict (unsafe-* 제거), style-src는 `'unsafe-inline'` 유지 — React 인라인 스타일로 구조적으로 clean 불가 판단 (:13-21 주석, 2026-08-02 실측) |
| 화이트리스트 관리 | 두 정책이 각각 하드코딩된 문자열 — 외부 호스트 추가 시 **양쪽 수동 동기화** 필요 (CLAUDE.md 규칙으로만 강제, 코드 공유 상수 없음. enforce는 :61-68, report-only는 :22-33 별도 배열) |
| 위반 수집 | `app/api/security/csp-report/route.ts:20-51` | 비인증 POST(브라우저 자동 전송) → Sentry captureMessage. Level 2/3 포맷 모두 파싱 (:92-112) |
| 노이즈 필터 | `csp-report/route.ts:69-75` | `blocked-uri: inline/self` × script/style-src는 드롭 (Next 프레임워크 스크립트 — nonce CSP 전엔 불가피, :54-67). **외부 호스트 차단 위반은 전부 보고** (:64) |
| frame-ancestors | CSP에 미포함 — 클릭재킹은 XFO로만 방어 (구식이지만 동작) |

캐시 헤더: 개인화 응답 carve-out이 마지막 규칙으로 존재 (`next.config.mjs:122-144`) — `/api/(posts\|communities\|profiles)` public 캐시 패턴의 communities/profiles는 실재하지 않는 경로임을 주석으로 못박고 "고치지 말 것" 명시 (:134-136).

## 6. Cron 인증 전수 검사

- 검증 함수: `lib/cron-auth.ts:11` — `CRON_SECRET` Bearer 비교, **timingSafeEqual** (:26-33), env 미설정 시 500 거부 (:13-19).
- `app/api/cron/**` **32개 라우트 전부** `verifyCronSecret` 호출 확인 (grep 교차 대조 — glob 32 vs grep 32, 누락 0). 추가로 `app/api/betman/*` 12개·`app/api/wisetoto/sync`·`app/api/news/*` 3개도 동일 인증 (VPS 호출용).
- `vercel.json:2-111`의 스케줄 27개 경로 전부 해당 라우트에 `GET` export 존재 (Vercel cron은 GET 호출) — 예: `app/api/cron/daily-token-reset/route.ts:80`.
- POST 전용(스케줄 미등록, 수동/VPS 트리거): `update-temperatures`, `standings/ingest`, `saga-queue-publish` (+`saga-test-publish`는 GET 전용). 모두 verifyCronSecret 있음.
- 실행 로그: `lib/cron/log-run.ts:15` `withCronLog` — `cron_run_log`에 성공/에러/소요시간 기록. 로그 insert 실패는 의도적 무시 (:49-51, best-effort 주석).

## 7. 특이사항 / 냄새

| # | 심각도 | 내용 | 근거 |
|---|---|---|---|
| S1 | 중 | **미들웨어 fail-open**: 가드 예외 시 admin 외 전 경로 통과 → rate-limit·온보딩 가드가 조용히 무력화될 수 있음 (의도된 트레이드오프, 주석 있음) | `middleware.ts:27-39` |
| S2 | 중 | **onboarding_done 쿠키 미서명**: httpOnly지만 값 검증 없는 평문 `"1"` — 유저가 직접 쿠키를 세팅하면 온보딩 강제를 우회 가능 (피해는 온보딩 스킵뿐) | `onboarding-guard.ts:43-44, 73-78` |
| S3 | 중 | **온보딩 가드 DB 장애 시 전원 /sign-up 리다이렉트** (catch → redirect) — Supabase 장애가 사이트 전체 접근 불능으로 증폭 | `onboarding-guard.ts:80-83` |
| S4 | 중 | **rate-limit이 인스턴스 로컬** — 서버리스 스케일아웃 시 실효 한도 = limit × 인스턴스 수. STRICT(돈 경로)도 동일 | `lib/rate-limit.ts:7-12` |
| S5 | 하 | 관리자 role 판정 3중 정의 (`admin.ts` / `require-admin-api.ts` / `roles.ts`) — roles.ts의 "한 곳" 원칙과 모순, 등급 추가 시 갈라질 위험 | §3 표 |
| S6 | 하 | `community-stats`: 비인증 GET에서 service role 직접 생성 (래퍼·server-only 가드 우회, 읽기 전용 집계라 실해 낮음) | `app/api/betman/community-stats/route.ts:15-18` |
| S7 | 하 | CSP 화이트리스트가 enforce/report-only 두 문자열에 중복 하드코딩 — drift 방지 장치 없음 | `next.config.mjs:22-33` vs `:61-68` |
| S8 | 하 | 에러 삼킴 패턴: `isAdmin` catch→false(`lib/supabase/admin.ts:27-30`), `getRole` catch→null(`roles.ts:38-41`), csp-report 전체 catch→204(`csp-report/route.ts:47-50`), cron 로그 catch→무시(`log-run.ts:49-51`). 전부 fail-safe 방향(권한은 거부, 관측은 무해)이라 보안상 문제는 아니나 장애 시 원인 파악 어려움 |
| S9 | 정보 | adminGuard는 로그인만 검사 — role 검사는 `app/admin/layout.tsx:13`에 의존. `/api/admin/*`은 미들웨어 adminGuard 대상 제외(`admin-guard.ts:14`)라 각 라우트의 `requireAdminApi`가 유일한 방어선 (라우트 하나가 빠뜨리면 구멍 — 현재 grep상 전 라우트 적용) |
| S10 | 정보 | Sentry: `instrumentation.ts:44-51` node/edge 분기 init, `sanitizeEvent`(:3-26)가 cookie/authorization 헤더 + secret 계열 extra 마스킹, production만 활성(:30). `onRequestError`(:61-73)로 디스코드 병행 알림 |

## 8. env 검증

- `lib/env.ts:7-55` 서버 스키마: **필수 3종** = `SUPABASE_SERVICE_ROLE_KEY`·`CLERK_SECRET_KEY`·`CRON_SECRET` (:8-10), 나머지(OpenAI/Discord/GA4/Sentry/CF 등)는 전부 optional — 미설정 시 해당 기능 no-op 설계.
- 클라이언트 스키마 :61-73 (NEXT_PUBLIC만). import 시점 검증·실패 시 throw (:91-118). `env`를 `ServerEnv`로 단언(:118)해 클라이언트에서 서버 키 접근 시 런타임 undefined — 타입은 통과하는 허점 있으나 실사용 위반 0건 (§2).

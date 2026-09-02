---
name: gongnori-api-route
description: app/api/ 아래에 새 route.ts 를 만들 때, 기존 API 라우트의 응답·캐시·인증을 고칠 때, 클라이언트에서 fetch("/api/...") 를 새로 부를 때, next.config.mjs 의 headers()/rewrites() 를 만질 때 쓴다. betman·wisetoto·sports·live-scores 경로를 다룰 때, service role(lib/supabase/admin.ts)을 쓰려 할 때, rate-limit 을 붙일 때도 쓴다.
allowed-tools: Read, Edit, Grep, Bash
---

# 새 API 라우트 규약

## 1. 캐시 헤더 분류

`next.config.mjs` `headers()` 의 다섯 갈래 중 하나로 분류돼야 한다.

| 성격 | 값 |
|---|---|
| 읽기 (`posts`) | `public, s-maxage=30, stale-while-revalidate=120` |
| 피드 (`feed/*`) | `public, s-maxage=15, stale-while-revalidate=60` |
| 순위·경기 (`standings`·`ranking`·`betman/games`) | `public, s-maxage=60, stale-while-revalidate=300` |
| 변경·인증 (`upload`·`payments`·`tokens`·`admin`·`cron`·`auth`) | `no-store` |
| 개인화 GET | `private, no-store` |

**⚠️ 순서가 규칙의 일부다.** 같은 키는 **뒤 규칙이 이긴다**. 개인화 항목이 반드시
마지막에 온다 — 위 read-only 패턴에는 메서드·인증 조건이 없어서, 자체 헤더를 세우지
않는 개인화 GET 이 `public, s-maxage` 를 물려받는다. 로그인 유저 응답이 CDN 에 얹히면
남에게 그대로 나간다.

**⚠️ `/api/(posts|communities|profiles)` 의 `communities|profiles` 는 실재하지 않는
경로다 — 일부러 헛돌게 둔 것이다.** "오타 수정"하면 캐시 범위가 넓어진다. 손대지 말 것.

## 2. 출처 은닉

클라이언트가 부를 수 있는 것은 **`/api/sports/*` 뿐**이다.

`next.config.mjs` `rewrites()`:

```
/api/sports/*       →  /api/betman/*
/storage/*          →  ekysrlhdrapmsnrkytif.supabase.co/storage/v1/object/public/*
```

`/api/live-scores/* → /api/wisetoto/*` 별칭은 2026-09-02 에 걷어냈다. wisetoto 가 접근을
막아 7일간 점수 0건이었고(한국 IP 로도 빈 응답), 살아 있을 때도 라이브 점수는 준 적이 없다.
라이브·FT 점수는 LFA 상세 캐시(`match_details_cache`)가 공급한다 — `pickScore` 우선순위.

`/storage/*` 도 같은 이유다 — Supabase 도메인을 감춘다. 업로드 이미지는 이 경로로 낸다.

`betman`·`wisetoto` 를 외부에 노출하면 크롤링 출처가 드러난다. 컴포넌트·훅에서
직접 경로를 쓰지 않는다. (지금은 테스트와 `rate-limit-guard` 에만 직접 경로가 있다.)

## 3. 나머지

- **rate-limit**: `lib/middleware/rate-limit-guard.ts` 에 등록한다. `middleware.ts` 는
  `rateLimitGuard → adminGuard → onboardingGuard` 순서로 돈다.
- **service role**: `lib/supabase/admin.ts` 만 쓴다. 이 import 가 클라이언트 컴포넌트
  경로로 새면 서비스 키가 번들에 실린다 — 새 import 를 넣었으면 확인할 것.
- 서버/route 는 `@/lib/supabase/server`, 클라이언트 컴포넌트는 `@/lib/supabase/client`.
- 인증은 Clerk JWT → Supabase RLS. **Supabase Auth 는 안 쓴다** (`lib/supabase/README.md`
  의 Supabase Auth 예시는 무시).

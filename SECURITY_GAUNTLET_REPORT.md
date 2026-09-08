# SECURITY GAUNTLET — Round 1 리포트

- 대상: gongnori.fan 커뮤니티 (Next.js 15.5.18 / React 19.2.3 / @supabase/supabase-js 2.89.0 / Clerk 6.39.3)
- 일자: 2026-09-08
- 방식: 정적 코드 감사 + Supabase 읽기 전용 인트로스펙션(정의·권한 조회). **프로덕션 뮤테이션·실데이터 조작 없음(ROE 준수).**
- 익스플로잇 검증은 최소 침습 원칙에 따라 "권한 부여 + 함수 정의 + 도달 경로" 삼중 확인으로 대체 — 실제 파괴적 RPC 는 호출하지 않음.

---

## 커버리지 맵 (§4 체크리스트)

| # | 공격면 | 상태 | 결과 |
|---|--------|------|------|
| 2 | 시크릿 노출 | ✅ Clean | `.env` 실파일 git 히스토리에 없음(템플릿만). `NEXT_PUBLIC_*` 시크릿 없음. service_role 은 서버 전용 파일·스크립트에만. `instrumentation.ts` 가 Sentry 이벤트에서 secret/token/service_role 스크러빙 |
| 4 | 미들웨어 우회 | ✅ Clean | Next 15.5.18 → CVE-2025-29927(segment-prefetch 우회)는 15.2.3 패치됨, 해당 없음. adminGuard 는 `/admin` 페이지만 보호하고 `/api/admin` 은 각 라우트가 `requireStaff/requireAdminApi` 로 자체 게이트(fail-closed) |
| 1/7 | RLS / 뷰·함수 | ✅ 수정·검증 | `rls_disabled_in_public` 0건(테이블 RLS 전부 활성, deny-by-default). SECURITY DEFINER RPC 51개 REST 노출 → **Finding #1, 2026-09-08 적용·검증 완료** |
| 11 | Cron 인증 | ✅ Clean | cron 38개 전부 `verifyCronSecret`(timing-safe 비교, CRON_SECRET 미설정 시 거부 = fail-closed) |
| 12 | LLM/에이전트(DoW) | ✅ Round1 한정 Clean | `/api/tarot/reading`(비로그인 LLM) 은 `checkRateLimit STRICT` + 서버 카드 추출. LLM cron 은 전부 CRON_SECRET 게이트 |
| 5 | IDOR / BOLA (앱단) | ✅ Clean (Round 2) | 뮤테이션/민감 라우트 24개(~41 메서드) 전수 감사 — 전부 SAFE. 소유권 fetch-then-compare 또는 auth-derived id 스코핑, 특권은 role 게이트 |
| 3 | 경제 뮤테이션 인가 | ✅ Clean (Round 2) | tokens/gold/invest/donate/purchase 6개 — 유저는 `currentUser().id`로 유도(body 스푸핑 불가), 금액 양수·상한·서버 상수 가격. RPC 는 원자적 `UPDATE … WHERE balance>=amount` |
| 9 | 헤더 / 전송 | ✅ Clean (Round 2) | XFO DENY, nosniff, Referrer-Policy, Permissions-Policy(cam/mic/geo 차단), HSTS 2y preload, enforcing CSP + Report-Only 듀얼모드 |
| 6 | 인젝션 / Stored XSS | ✅ Clean (Round 3) | TipTap sanitizer 화이트리스트 + `isSafeUrl`(URL 스킴 검증) 전 쓰기 경로 적용. `.or()` 필터는 정화(`stickers`) 또는 무영향(`posts`) |
| 10 | 의존성 | ⚠️ 업그레이드 권장 (Round 3) | **Next 15.5.18 → ≥15.5.21**(Server Actions SSRF·DoS·엔드포인트 노출). sanitize-html 2.17.5→≥2.17.7, @tiptap/core→≥3.30.4. vitest critical=dev 전용 |
| 12 | LLM / 간접 프롬프트 인젝션 | ⚠️ F1 수정✅ / F2 설계상 수용 | 접지 방어 대체로 견고(사전 오염·신규선수·구단·이미지 fail-closed). **F1**(지어내기 게이트 dead code) 수정 완료. **F2**(official 마커 신뢰)는 운영자 테스트로 잠긴 의도된 정책 |
| 8 | 세션 / 인증 | ✅ Clean | Clerk↔Supabase 3rd-party JWT — Clerk 관리, 저위험 |

---

## [Critical] Finding #1 — SECURITY DEFINER RPC 직접 호출로 경제·권한 조작 (BOLA)

**심각도:** Critical (CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:H/A:L ≈ 8.3)
**상태:** ✅ 닫힘 — 2026-09-08 프로덕션 적용·검증 완료 (아래 재검증 결과 참조)

**위치:** DB `public` 스키마 SECURITY DEFINER 함수 51개.
대표: `apply_flair_score`, `sync_stadium_contribution`, `metaverse_create_chat_room`, `vote_sticker`, `metaverse_equip_avatar`, `betman_update_sync_state`.
호출부는 전부 서버(service_role)지만 함수 권한이 `authenticated`/`anon` 에 열려 있어 REST 로 직접 도달.

**참조 기법·출처:**
- OWASP API Security Top 10 — API1:2023 BOLA (Broken Object Level Authorization)
- Supabase Database Linter — `0029_authenticated_security_definer_function_executable`, `0028_anon_security_definer_function_executable`
  (https://supabase.com/docs/guides/database/database-linter)

**재현 (개념 PoC — 실제 뮤테이션은 ROE 상 미실행):**
브라우저 콘솔에서 로그인 세션으로:
```js
// publishable 키 + Clerk 토큰(role=authenticated) → PostgREST 직접 호출. Next 미들웨어·라우트 미경유.
const sb = createAuthClient(() => session.getToken())   // lib/supabase/client.ts 의 실제 팩토리
await sb.rpc('apply_flair_score', { p_user_id: '<내 clerk id>', p_flair_id: '<flair>', p_delta: 999999999 })
// → user_flair_scores.score_total/score_balance 무한 + 임계값 넘는 전 호칭 자동 언락.
//   score_balance 는 donate_flair_score_to_team 의 재화 → 경기장 기부로 환산 가능.
await sb.rpc('sync_stadium_contribution', { p_user_id: '<나>', p_team_id: '<팀>', p_new_points: 9999999999 })
// → team_stadiums.total_points 임의 세팅 + 최고 레벨 + 본인 1위 기여자 기록.
```
확인된 사실(뮤테이션 없이):
1. `has_function_privilege('authenticated', fn, 'EXECUTE') = true` (anon 도 2개: `increment_post_view_count`, `stadium_bricks_today`)
2. 함수 정의가 신원을 `auth.jwt()` 가 아니라 인자 `p_user_id` 로 받고 그대로 신뢰(정의 원문 확인)
3. `lib/supabase/client.ts` `createAuthClient` 가 Clerk 토큰을 붙임 → PostgREST 가 `authenticated` 로 실행
4. RPC 는 `<project>.supabase.co/rest/v1/rpc/*` 로 가므로 `middleware.ts`(rate-limit/admin/onboarding)·route handler 를 경유하지 않음

**영향:** 로그인한 임의 유저가 앱단 검증을 우회하여
- flair 점수·호칭·경기장 기부잔액 무한 조작(경제 파탄)
- 경기장 포인트/레벨·기여 랭킹 임의 세팅
- 메타버스 방 정가(100) 우회 생성, 타인 아바타 변경(그리핑)
- 스티커 표 채워 검수 자동승인 우회
- 베팅 라운드 동기화 포인터 오염(무결성)
- 무단 유지보수 함수(`recalc_all_user_temperatures`, `cleanup_*`) 트리거로 DB 부하

**근본 원인:** Supabase 기본값은 새 함수 EXECUTE 를 PUBLIC 에 부여한다. Clerk 3rd-party auth 로 `authenticated` 롤이 브라우저에서 실도달 가능해지면서, "서버에서만 부른다"는 암묵 전제가 DB 권한으로 강제되지 않았다.

**수정:** `supabase/migrations/20260908b_revoke_security_definer_rpc_execute.sql`
- 51개 함수 EXECUTE 를 `PUBLIC, anon, authenticated` 에서 회수(PUBLIC 함께 회수 — anon-only 회수는 no-op)
- 서버가 직접 부르는 30개는 `service_role` 재부여(트리거 전용은 owner 실행이라 불필요)
- 심층 방어: DB 권한(이번) + 앱단 route handler 인증·소유권(기존 유지) 이중
- **의도적 제외:** `increment_post_view_count`, `stadium_bricks_today` 는 `createAnonClient`(anon)로 호출되는 공개 집계·조회수 — 운영자 결정(20260728/20260904b) 유지. (조회수 dedup 우회는 알려진 저위험 수용)

**재검증 (2026-09-08 적용 후 실측):**
```sql
-- anon/authenticated 가 아직 실행 가능한 SECURITY DEFINER 함수 조회
select p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.prosecdef
  and (has_function_privilege('anon', p.oid,'EXECUTE') or has_function_privilege('authenticated', p.oid,'EXECUTE'))
order by p.proname;
```
결과: **`increment_post_view_count`, `stadium_bricks_today` 2개만 남음** (의도된 예외). 회수 대상 51개는 전부 목록에서 사라짐 → 익스플로잇 경로 차단 확인.
기능 무손상 확인: `apply_flair_score`·`sync_stadium_contribution`·`vote_sticker`·`metaverse_*`·`betman_update_sync_state` 등 서버 호출 함수는 `service_role_exec=true` / `auth_exec=false`.
(원격 마이그레이션 이력에 `revoke_security_definer_rpc_execute` 로 기록됨. 로컬 파일은 `20260908b_...` — REVOKE/GRANT 는 멱등이라 재적용해도 무해.)

---

## [Low / 수용] 부수 관찰

- `POST /api/draft/stats` — 의도적 익명(익명 게임). 입력 엄격 검증 + draft_id 멱등. 남용 시 분석 테이블 오염만(경제·개인정보 무관). 미들웨어 rate-limit 적용. → 수용.
- `increment_post_view_count` anon 직접 호출 시 `ip_address_param` 을 호출자가 넘겨 per-IP dedup 우회 → 조회수 인플레만. 운영자 기수용(20260728).

---

## Round 2 결과 (2026-09-08) — IDOR/경제/헤더

**신규 Critical/High 없음.** 앱단 인가는 일관되게 견고하다.

- **IDOR/BOLA (24 라우트, ~41 메서드) 전부 SAFE.** 3개 배치 병렬 감사(콘텐츠 / 룸·소셜 / 투표·읽기).
  모든 뮤테이션이 Clerk auth-derived id 를 행 주체로 사용, body/param 의 user_id 는 인가에 쓰지 않음.
  소유권은 `row.user_id !== caller → 403`(posts/comments), `.eq("user_id", caller)` 스코핑(bookmark/vote/follow/block/my-bricks),
  특권은 `owner_user_id`(chat-room 삭제)·`canPostNotice`/`isSiteAdmin`(공지) 게이트.
  `profile/[userId]` 는 공개 컬럼만 반환(email/role/private flag 없음).
- **경제 뮤테이션 6개 인가 Clean.** 유저 id auth-derived, 금액 양수·상한·서버 상수 가격, RPC 원자적 잔액 차감.
- **보안 헤더 Clean.** (next.config.mjs) XFO=DENY, X-Content-Type-Options=nosniff, Referrer-Policy, Permissions-Policy(cam/mic/geo 차단), HSTS 2년+preload, enforcing CSP + Report-Only 듀얼모드 마이그레이션 중.
- **관찰(비취약):** `vote_sticker`/`purchase_sticker` RPC 의 `p_user_id` 는 라우트가 `user.id` 로 넘겨 안전 —
  Finding #1(RPC 직접호출 차단)과 합쳐 심층 방어 성립. `ticker/[id]/comments` GET 이 원 클럭 user_id 를
  노출하나 profile 라우트로 이미 공개된 값이라 유출 아님.

**서사:** 앱단(route handler) 인가는 원래 튼튼했다. 실제 구멍은 앱 코드를 경유하지 않는 **DB RPC 우회 경로(Finding #1)** 였고, 그게 닫히면서 앱단·DB단 두 겹이 맞물린다.

---

## Round 3 결과 (2026-09-08) — 인젝션·의존성·LLM

### 인젝션 / Stored XSS — ✅ Clean
- TipTap sanitizer(`lib/tiptap/sanitize.ts`) 화이트리스트 노드/마크 + `isSafeUrl`(`new URL()` + 프로토콜 allowlist)로 link href·image/video src·embed url 의 `javascript:`/`data:`/`vbscript:` 차단. **전 쓰기 경로**(posts 생성/수정, news-review, published-fixes, auto-publish, saga-publish, agent-draft, notices)에서 호출. 댓글은 평문.
- `.or()` PostgREST 필터: `stickers` 는 `replace(/[^a-zA-Z0-9_-]/g,"")` 정화, `posts` excludeFlairs 는 자기 피드 필터라 영향 없음.

### 의존성 — ⚠️ 업그레이드 권장
- **[High] ✅ Next.js 15.5.18 → 15.5.21 적용(2026-09-08)** — Server Actions SSRF/DoS, rewrites SSRF(우리 rewrite 는 정적이라 직접 악용성 낮음), 내부 Server Function 엔드포인트 노출, 이미지 최적화 SVG DoS 등 패치. `pnpm install` + `tsc --noEmit` 통과. (⚠️ `pnpm build` 런타임 검증은 미실행 — 배포 전 권장.)
- [Moderate] `sanitize-html` 2.17.5 → ≥2.17.7 (embed sanitizer — SVG/`</textarea/>` XSS 우회. 입력이 신뢰 제공자 oEmbed 라 실노출 낮음).
- [Moderate] `@tiptap/core` → ≥3.30.4 (mergeAttributes proto).
- [dev-only, 실런타임 무관] vitest critical, vite/esbuild/browserslist 등 빌드타임 DoS.

### LLM 간접 프롬프트 인젝션 — ⚠️ 2건 (콘텐츠 무결성)

접지(grounding) 방어는 대체로 견고 — **검증됨(fail-closed):** 이름 사전 오염 불가(네이버 접지 + `canAbsorbAlias`), 신규선수 사가 불가(사전 매칭 강제), 구단 날조 차단(`filterClubsByEvidence`), 이미지 출처 차단(vision gate). 아래 둘만 실질 갭:

**[High] F1 — 지어내기 검사 게이트가 죽어 있음.** `lib/news/quality-gate.ts` `inspectDraft(title, content, sourceText)`.
`sourceText`(원문 재료)를 인자로 받고 호출부(`news-auto-publish/route.ts:522`)·JSDoc 둘 다 "원문 대조로 지어내기를 잡는다"고 명시하지만, 실제 LLM 요청 body(L164)는 `제목 + 본문` 만 전송 — **`sourceText` 가 모델에 안 들어간다.** 프롬프트의 check #0("원문에 없는 내용", 유일한 구조적 지어내기 탐지)이 원문 없이는 건너뛰어진다(프롬프트 규칙). 결과: 검사관은 표면 결함(미번역·오타·불일치)만 잡고, LLM 이 덧붙인 허위 사실(날조 인용·금액·의도, 의미역전 "관심→계약")은 통과.
→ **✅ 수정 적용(2026-09-08):** `inspectDraft` user 메시지에 `원문:` 섹션으로 `sourceText`(4000자 상한) 주입, 없으면 `(원문 없음)` → check #0 자동 스킵(프롬프트 L75와 일치). `tsc --noEmit` 통과. 죽어 있던 지어내기 게이트가 이제 작동한다.

**[Low·설계상 수용] F2 — official 티어가 외부 제목의 `[오피셜]`/`이적 확정` 마커를 신뢰.** `lib/transfer/feed.ts` `classifyTier`.
이론상 공격자가 reddit/RSS 제목에 "[오피셜]"/"공식 발표"를 심어 등재선수 사가를 "확정"으로 뒤집는 경로가 있다(saga 경로는 네이버 교차검증 없음).
**그러나 이는 버그가 아니라 운영자가 테스트로 잠근 의도된 정책이다** — `__tests__/lib/transfer/classify-tier.test.ts`("워룸: 오피셜 라벨 오염", 2026-08-04)가 `source_id="reddit-soccer"` 기본값으로 `[오피셜]`·`이적 확정` 마커 → `official` 을 **명시적으로 단언**한다. "[오피셜]" 마커 자체가 "공식 발표가 있었다"는 증거로 취급되며, 어느 애그리게이터가 재게시했는지는 가리지 않는다(기자발 here we go/completed 만 유력으로 강등).
- 시도했던 수정(제목-텍스트 official 을 naver 로 한정)은 이 테스트 9건 중 첫 케이스를 깨서 **되돌림**. classifyTier 는 잘못된 계층이다.
- 잔여 리스크를 줄이고 싶다면 계층은 **saga 자동-확정 게이트**다(티어 라벨이 아니라, 사가를 confirmed/exposed 로 뒤집기 전에 네이버/구단도메인 교차검증을 요구). 이는 운영자가 튜닝한 정책 영역 → **운영자 판단**으로 남긴다(강제 변경 안 함).

**[Low] F3~F5** — auto-publish 는 공격자 자기 원문에만 충실성 대조(루머 티어는 네이버 교차검증 없음), 약한 구분자 raw 연결. 루머 자동발행은 운영자 의도 설계(`상한/루머차단 제거` 결정) — F1/F2 의 enabler.

---

## 종합 현황 (Round 1~3)

- 🔴 **Round 1:** Critical 1 — SECURITY DEFINER RPC 51개 REST 노출 → **적용·검증 완료(닫힘)**.
- 🟢 **Round 2:** IDOR/BOLA 24 라우트 · 경제 인가 · 헤더 — **전부 Clean**.
- 🟡 **Round 3:** 인젝션/XSS **Clean** · 의존성 **Next 15.5.21 적용✅** · LLM **F1 수정✅ · F2 설계상 수용(변경 없음)**.
- ✅ 그 외 Clean: 시크릿, 미들웨어/CVE, Cron 인증, RLS, LLM DoW(tarot).

**적용 완료:** Finding #1(RPC 회수, 프로덕션 검증) · Next 15.5.21 · F1(지어내기 게이트 복구, tsc 통과).
**F2:** 운영자 테스트로 잠긴 의도된 정책 확인 → 시도한 패치 되돌림(classify-tier 테스트 9/9 통과). 잔여 리스크 완화는 saga 자동-확정 교차검증 계층에서, 운영자 판단으로 남김.
**남은 조치:** ① 배포 전 `pnpm build` 런타임 검증 ② (선택) sanitize-html≥2.17.7 / @tiptap/core≥3.30.4 ③ (운영자) F2 saga-confirm 교차검증 도입 여부.

## 변경 파일 (미커밋 — 사용자가 커밋)
- `supabase/migrations/20260908b_revoke_security_definer_rpc_execute.sql` (신규, 프로덕션엔 적용됨)
- `lib/news/quality-gate.ts` (F1)
- `package.json` + `pnpm-lock.yaml` (Next 15.5.21)
- `SECURITY_GAUNTLET_REPORT.md` (이 리포트)

---

## 부록 — 참조 리서치 소스
- OWASP API Security Top 10 (BOLA), OWASP Top 10:2025
- OWASP LLM Top 10 2025 — Unbounded Consumption(DoW)
- Supabase Database Linter 0028/0029, Splinter 보안 advisor
- Next.js Security / CVE-2025-29927 (미들웨어 우회, 15.2.3 패치 — 현 버전 해당 없음)

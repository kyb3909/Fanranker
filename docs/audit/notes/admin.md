# Phase 1 감사 — 어드민 콘솔 도메인

작성: 2026-08-08 · 범위: `app/admin/**`, `app/admin2/**`, `app/api/admin/**`, `app/api/admin2/**`, 가드, 모더레이션, 감사 로그
표기: ✅ 확인됨 / ⚠️ 냄새 / ❓ 미확인

## 1. 화면 전수 (`app/admin/*`)

레이아웃 가드: `app/admin/layout.tsx:12-16` — `requireAdmin()` 실패 시 `redirect('/')`. **admin 전권만** 진입.

| URL | 파일 | 역할 | 사용하는 API |
|---|---|---|---|
| /admin | `app/admin/page.tsx` | 대시보드 (KPI·알림·크롤러) | `/api/admin/operations/dashboard`, `/api/admin/content/ticker/dashboard`, `/api/admin/data-integrity` |
| /admin/operations | `app/admin/operations/page.tsx` | 운영 모니터링 | `/api/admin/operations/dashboard` (`_components/operations-dashboard.tsx:50`) |
| /admin/analytics | `app/admin/analytics/page.tsx` | 주간 분석 리포트 | `/api/admin/analytics/reports`, `…/reports/[id]`, `…/generate` (`_components/analytics-dashboard.tsx:99-113`) |
| /admin/stats | `app/admin/stats/page.tsx` | 통계 | `/api/admin/stats` (`stats/page.tsx:78`) |
| /admin/users | `app/admin/users/page.tsx` | 사용자 목록 | `/api/admin/users` (`users/user-directory-table.tsx:52`) |
| /admin/users/[userId] | `app/admin/users/[userId]/page.tsx` | 상세·역할·경제조정 | `/api/admin/users/[id]`, `…/role`, `…/adjust-economy` (`user-detail-tabs.tsx:91-141`) |
| /admin/content/posts | `content/posts/page.tsx` | 게시글 관리 | `/api/admin/content/posts` |
| /admin/content/notices | `content/notices/page.tsx` | 일괄 공지 | `/api/admin/content/notices` |
| /admin/content/moderators | `content/moderators/page.tsx` | 게시판 MOD 관리 | `/api/admin/content/moderators` |
| /admin/content/comments | `content/comments/page.tsx` | 댓글 관리 | `/api/admin/content/comments` |
| /admin/content/ticker | `content/ticker/page.tsx` | 뉴스 티커 | `/api/admin/content/ticker` |
| /admin/content/boards | `content/boards/page.tsx` | 카테고리 설정 | `/api/admin/content/boards` |
| /admin/content/banners | `content/banners/page.tsx` | 배너 CRUD·순서 | `/api/admin/content/banners`, `…/[id]` |
| /admin/content/stickers | `content/stickers/page.tsx` | 스티커 승인 큐 | `/api/admin/content/stickers` |
| /admin/content/reports | `content/reports/page.tsx` | 신고 처리 큐 | `/api/admin/content/reports` (`report-queue.tsx:96,108`) |
| /admin/content/metaverse-reports | `content/metaverse-reports/page.tsx` | 메타버스 신고 | `/api/admin/content/metaverse-reports` |
| /admin/content/newsroom | `content/newsroom/page.tsx` | 뉴스룸 큐 상태 열람 (RSC 직조회) | API 없음 — `createServiceRoleClient` 직접 |
| /admin/content/polls | `content/polls/page.tsx` | 설문 생성·관리 | `/api/admin/polls`, `…/[id]` |
| /admin/news-review | `news-review/page.tsx` | **AI 뉴스+사가 통합 검수** (아래 §2) | `/api/admin/news-review`, `/api/admin2/news/bulk`, `/api/admin2/saga`, `/api/admin/published-fixes`, `/api/admin/player-dictionary` |
| /admin/saga-review | `saga-review/page.tsx:5` | redirect → /admin/news-review | — |
| /admin/agg-review | `agg-review/page.tsx` | AI 커뮤글 검수 (RSC 직조회) | `/api/admin/agg-review` (`agg-review-client.tsx:63`) |
| /admin/agg-training | `agg-training/page.tsx` | AI 글 학습 | `/api/admin/agg-training` |
| /admin/matches | `matches/page.tsx` | 경기 관리·결과 입력 | `/api/admin/matches/list`, `…/schedule`, `…/result` |
| /admin/team-dictionary | `team-dictionary/page.tsx` | 팀 사전·경기 매핑 | `/api/admin/team-dictionary` (`components/admin/team-dictionary.tsx:60,75`) |
| /admin/experts | `experts/page.tsx` | 전문가 승인 | `/api/admin/users/certify-expert` (`expert-approval-table.tsx:38`) |
| /admin/settlements | `settlements/page.tsx` | 정산 처리 | `/api/admin/matches/result` (`settlement-table.tsx:75`) |
| /admin/tokens | `tokens/page.tsx` | 토큰 모니터링 | `/api/admin/tokens/balances` |
| /admin/refunds | `refunds/page.tsx` | 환불 큐 | `/api/admin/refunds` (`refund-queue.tsx:58,94`) |
| /admin/system | `system/page.tsx` | 시스템 상태·크론·betman 재동기화 | `/api/admin/system/health-ping`, `/api/admin/betman/resync` |
| /admin/notes | `notes/page.tsx` | 운영 메모장 | `/api/admin/notes` (GET/POST/PATCH/DELETE, `notes/page.tsx:26-81`) |
| /admin/event | `event/page.tsx` | 월드컵 이벤트 콘솔 (server actions) | API 없음 — `event/actions.ts` (`requireAdmin` :14,:40) |

사이드바(`_components/admin-sidebar.tsx:77-140`) 비노출 라우트: **/admin/event, /admin/saga-review** — 직접 URL 전용.

## 2. /admin2 상태 — "폐기 확정"의 실제

- 결론: **UI 껍데기는 축소됐지만 죽지 않았다.** 두 가지가 실사용 중:
  1. **editor 등급의 유일한 진입로.** `/admin` 레이아웃은 `requireAdmin`(admin 전권)이라 editor는 못 들어간다. `/admin2` 레이아웃만 `requireStaff`(`app/admin2/layout.tsx:16`) → editor의 뉴스/커뮤글 검수는 /admin2 경유가 유일 (`app/admin2/agg/page.tsx:11-14` 주석이 명시).
  2. **`/api/admin2/*` 를 정본 콘솔이 호출.** `/admin/news-review` 화면이 `/api/admin2/news/bulk`(`app/admin/news-review/fast-review.tsx:262`)와 `/api/admin2/saga`(`components/admin/saga-review-queue.tsx:85,255`)에 의존. admin2 디렉토리를 지우면 정본 검수가 깨진다.
- 페이지 구성 (전부 재사용 래퍼 — 화면 중복 없음):

| URL | 파일 | 실체 |
|---|---|---|
| /admin2 | `page.tsx` | 작업대(Workbench+Insight+Funnel 카드) — `/api/admin2/dashboard`, `…/insight`, `…/funnel` |
| /admin2/news | `news/page.tsx:15` | `/admin/news-review` 페이지 컴포넌트 그대로 렌더 (동일 화면 공유) |
| /admin2/agg | `agg/page.tsx:23` | `/admin/agg-review` 재사용 |
| /admin2/reports | `reports/page.tsx:21-24` | `/admin/content/reports` 재사용, **페이지 자체에서 admin 재검사** (editor면 redirect — 제재 권한) |
| /admin2/saga | `saga/page.tsx:5` | redirect → /admin2/news |

- ⚠️ 죽은 admin2 API: `/api/admin2/newsroom-funnel`, `/api/admin2/assignment-shadow` — 리포지토리 전체에서 호출자 0 (grep `admin2/(newsroom-funnel|assignment-shadow)` → route 파일 자신뿐).
- 사가 검수 관계: 화면은 `/admin/news-review` 안의 `<SagaReviewQueue />`(`news-review/page.tsx:227`)로 통합됐고, API만 `/api/admin2/saga`에 남음. 운영 메모의 "사가 검수는 admin2"는 API 위치 얘기로는 여전히 맞음.

## 3. 권한 가드 일관성

- 미들웨어: `middleware.ts:21` → `adminGuard`. matcher `/admin(.*)`(`lib/middleware/admin-guard.ts:4`)가 **/admin2도 커버**하지만 **인증만** 확인(역할 X), API는 제외(:14). 가드 예외 시 admin 영역은 fail-closed(`middleware.ts:33-37`). 역할 판정은 레이아웃+라우트별 가드 책임.
- **전수 결과: `app/api/admin/**` 42개 + `app/api/admin2/**` 7개 라우트 모두 가드 있음. 무가드 라우트 0.** 단, 가드 구현이 4계열로 분산:

| 가드 | 정의 | 판정 | 사용처 |
|---|---|---|---|
| `requireAdminApi` | `lib/admin/require-admin-api.ts:14-32` | role==='admin' → 401/403 응답 | admin API 34개 (돈·권한·콘텐츠 대부분) + `/api/admin2/funnel:18` |
| `requireStaffApi` | `lib/admin/roles.ts:70-89` | admin\|editor | `/api/admin/news-review:3`, `player-dictionary:3`, `team-dictionary:3`, `published-fixes:4`, admin2 5개(saga·dashboard·insight·news/bulk·assignment-shadow·newsroom-funnel) |
| `requireStaff` (throw형) | `lib/admin/roles.ts:53-57` | admin\|editor, throw | `/api/admin/agg-review:43-46`(catch→403 처리 ✅), `/admin2` 레이아웃 |
| `requireAdmin` (throw형) | `lib/supabase/admin.ts:37-42` | admin, throw | `/admin` 레이아웃, `/api/admin/polls:21`, `polls/[id]:16,52`, `agg-training:26`, `event/actions.ts:14,40` |
| 인라인 수동 검사 | — | `currentUser()`+profiles.role 직조회 | `users/certify-expert/route.ts:39`, `users/certify-journalist/route.ts`(동일 패턴), `metaverse/chat-rooms/[id]/route.ts:24` — 셋 다 admin 검사 자체는 존재 ✅ |

- ⚠️ 냄새: `lib/admin/roles.ts:7-11` 주석 스스로 "권한 경계는 한 곳에서만"이라 선언했지만, 인라인 3개 + `lib/supabase/admin.ts` throw형이 여전히 병존. 등급 추가 시 인라인 3개가 누락 지점.
- editor 개방 범위는 정책(`roles.ts:22-23` "기본값 requireAdminApi")과 실사용이 일치: staff 개방은 전부 콘텐츠 검수·사전 계열, 돈·권한·신고(제재)는 admin 전용(`app/admin2/reports/page.tsx:16-19`).

## 4. 모더레이션 — 신고→판정→제재

플로우 (구현 완료, 작동 체인 확인):
1. **신고 접수**: 유저 POST `app/api/reports/route.ts` → `content_reports`.
2. **판정**: admin PATCH `/api/admin/content/reports` (`route.ts:137-205`) — resolve / dismiss / reviewing 3액션, zod 검증.
3. **제재(자동 카드)**: resolve 시 `issueCardAndCheckSuspension`(`route.ts:30-106`) — 사유별 레드(차별·광고, 무기한)/옐로(욕설·괴롭힘·정치, 1년 만료) 카드 발급(`route.ts:16-22,56-59`) → `user_cards` insert → 유효 옐로 ≥2면 `user_suspensions` 자동 정지(`route.ts:87-102`).
4. **정지 집행**: `lib/check-suspension.ts:13-16` `isUserSuspended` — `app/api/posts/route.ts:8`, `app/api/comments/route.ts:5`, `app/api/ticker/[id]/comments/route.ts:5`에서 쓰기 차단.

| 테이블 | 상태 |
|---|---|
| `content_reports`, `user_cards`, `user_suspensions` | ✅ 실사용 (위 체인) |
| `metaverse_user_reports` | ✅ 별도 큐 (`/api/admin/content/metaverse-reports`, admin2 dashboard `route.ts:117-120`) |
| `content_flags`, `user_sanctions` | ⚠️ **앱 코드 참조 0** — 스키마(`supabase/migrations/00000000000001_prod_schema.sql`)·`database.types.ts`·`docs/Admin_prd.md`에만 존재. 모더레이션 P1 계획 산출물로 보이며 미배선 |

⚠️ 에러 삼킴: 카드 발급 실패 시 `console.error` 후 `{cardIssued:false}` 반환(`content/reports/route.ts:71-74`)인데 PATCH는 그대로 `success:true` 응답(`:201`) — 신고는 resolved로 닫히고 제재만 조용히 누락될 수 있음.

## 5. 감사 로그 — admin_audit_logs vs admin_activity_logs

| 테이블 | 쓰기 | 읽기 | 판정 |
|---|---|---|---|
| `admin_audit_logs` | `lib/admin/audit.ts:21` `writeAuditLog` — 호출 15파일(신고·환불·경제조정·역할변경·스티커·티커·게시글·댓글·공지·MOD·보드·resync·admin2/news/bulk·posts notice) + 직접 insert 2곳(`users/certify-expert/route.ts:96`, `certify-journalist/route.ts:94`) | **앱 내 조회 화면·API 없음** (`from("admin_audit_logs")` 검색: 쓰기 3곳뿐) | ✅ 실사용 (write-only, 열람은 DB 직접) |
| `admin_activity_logs` | 없음 | 없음 | ⚠️ **죽은 테이블** — `prod_schema.sql:4389`+`database.types.ts:41`에만 존재, 앱 코드 참조 0. `admin_audit_logs`와 목적 중복 |

⚠️ `writeAuditLog`는 insert 에러를 검사하지 않음(`lib/admin/audit.ts:21-28`) — 감사 기록 실패가 무음.

## 6. 특이사항 / 냄새 종합

| # | 항목 | 근거 |
|---|---|---|
| 1 | 정본(/admin) 검수 화면이 admin2 API에 의존 — admin2 정리 시 API 이전 필수 | `app/admin/news-review/fast-review.tsx:262`, `components/admin/saga-review-queue.tsx:85` |
| 2 | 죽은 API 2개: admin2 `newsroom-funnel`, `assignment-shadow` (호출자 0) | §2 |
| 3 | 죽은 배지: 사이드바가 `pendingSagaReview`를 fetch·매핑하지만 badge `"sagaReview"`를 쓰는 메뉴 항목이 없음 | `admin-sidebar.tsx:66,153,167` vs `navGroups:77-140` |
| 4 | 죽은 테이블: `admin_activity_logs`, 미배선: `content_flags`·`user_sanctions` | §4, §5 |
| 5 | 권한 판정 4계열 분산 (인라인 3개 라우트 포함) — 구멍은 없으나 등급 확장 시 위험 | §3 |
| 6 | 카드 발급 실패 무음 + 감사 로그 insert 에러 미검사 | §4, §5 |
| 7 | `adminGuard` 미인증 리다이렉트가 `/sign-in`이 아닌 `/sign-up` | `lib/middleware/admin-guard.ts:18` |
| 8 | 뉴스 검수 큐 상한 500건·정렬 오래된순(만료 임박 우선) — 옛 50건 제한 문제는 수정됨 | `news-review/page.tsx:107-115` |
| 9 | `/admin/content/newsroom`·`/admin/agg-review`는 API 없이 RSC에서 service role 직조회 (레이아웃 가드에만 의존 — 현재는 안전) | `content/newsroom/page.tsx:2`, `agg-review/page.tsx:20` |

## ❓ 미확인

- `certify-journalist/route.ts` 본문은 import·라인 94만 확인 (certify-expert와 동일 패턴 추정, 전문 미정독).
- `app/api/admin/system/health/route.ts`·`data-integrity` 등 일부 라우트는 가드 존재만 확인, 로직 미정독.
- `admin_audit_logs`·`admin_activity_logs`의 실제 DB row 존재 여부 (코드 감사만, DB 미조회).
- admin2 Workbench/Insight/Funnel 카드의 실운영 사용 빈도 (코드로는 판단 불가).

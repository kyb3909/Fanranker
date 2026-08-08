# 이벤트/성장 계측 도메인 감사 노트 (Phase 1)

작성: 2026-08-08 · 범위: 월드컵/시즌 이벤트, UTM 귀속, 퍼널 계측, 주간 크리에이터 맞대결, GA4/주간 리포트

---

## 1. 이벤트 2세대 구분

### 1-1. 월드컵 (구, `worldcup-2026`, closed)

| 단계 | 파일:라인 | 비고 |
|---|---|---|
| 랜딩 | `app/worldcup/page.tsx` | D-day 하드코딩 `2026-06-28T13:00` (`:72`) |
| 등록 UI | `app/worldcup/register/page.tsx:22-41` | 등록자면 `/worldcup/games` 리다이렉트 |
| 등록 API | `app/api/event/worldcup/register/route.ts:16-22` | slug `worldcup-2026`, `gooner` 단일 enum |
| 슬립 귀속 | `app/api/betman/prediction/route.ts:293-345, 404` | `event_slug` → `events` 조회 → `prediction_slips.event_id` 부착. **status `"live"` 요구** (`:306`) |
| 순위 | `app/worldcup/leaderboard/page.tsx:63-94` | event_id 필터 정상 |
| 결과 | `app/worldcup/result/page.tsx:68,124` + `app/api/event/worldcup/report/route.ts` | report는 `/prediction` 통계 탭 후기 보드가 계속 사용 (route 주석 `:19-31`) |
| 운영 콘솔 | `app/admin/event/page.tsx:14` | **여전히 `worldcup-2026` 전용** — 시즌 이벤트용 콘솔 부재 |

**월드컵 잔재 (살아있는 코드에 남은 것)**:
- `app/page.tsx:121`, `app/prediction/page.tsx:48` — 홈/예측 페이지가 매 렌더마다 `worldcup-2026` status 조회 (배너 전환용).
- `app/admin/event/*` 전체가 월드컵 전용. 시즌 이벤트는 어드민 콘솔 없이 마이그레이션/SQL로만 운영.
- 🐞 `app/worldcup/page.tsx:55-58` 등록자 카운트, `:63-68` 내 등록 여부 조회 모두 **`event_id` 필터 없음** → 시즌 이벤트 등록자가 월드컵 카운트·"등록됨" 판정에 섞임 (교차 오염).
- status 어휘 이원화: 월드컵 슬립 경로는 `"live"`(`prediction/route.ts:306`), 시즌은 `draft/open/closed`(`app/api/event/season/register/route.ts:59-64`, 시드 `supabase/migrations/20260731b_season_open_event.sql:4`). 시즌은 event_slug 슬립 경로를 안 쓰므로 실해는 없으나 혼동 요인.

### 1-2. 시즌 개막 (현, `season-open-2026`)

| 단계 | 파일:라인 | 비고 |
|---|---|---|
| 랜딩 | `app/season/page.tsx:32,130-135` | `?preview=1` 표본 숫자 하드코딩 (`:256`, kop 138/blues 121) |
| 팀 등록 | `components/season/team-picker.tsx:57-64` → `app/api/event/season/register/route.ts:16-21` | kop/blues 2팀, `traffic_source`에 최초터치 UTM source 동봉 (`team-picker.tsx:62`) |
| 슬립 귀속 | `lib/event/season-stats.ts:40-44` | **event_id 미사용** — RPC `season_event_slips_range`가 "등록자 × 기간 × EPL 정산슬립"을 동적 조인 |
| 포인트/응모자격 | `lib/event/season-stats.ts:75-77,108` | 임계 30점 + 커뮤 활동 3회 상수 |
| 주간 순위 스냅샷 | `app/api/cron/season-weekly-snapshot/route.ts` | 월 00:00 KST (`vercel.json:60-62`) → `event_leaderboard_snapshots` insert (`:86`) |
| 주간 추첨+맞대결 | `app/api/cron/season-weekly-draw-snapshot/route.ts` | 월 00:05 KST (`vercel.json:63-66`) → `season_weekly_draws` + 발표 글 |
| 데일리 치킨 | `app/api/cron/season-chicken-draw/route.ts` | ⚠️ 아래 6절 — **vercel.json 미등록** |
| 발표 UI | `app/season/page.tsx:168-237` | 스냅샷 최신 묶음 + 최신 추첨 1회차만 노출 |

---

## 2. 유입 귀속 체인 (UTM → 가입 → user_acquisition)

| # | 단계 | 파일:라인 |
|---|---|---|
| 1 | 루트 레이아웃 마운트 | `app/layout.tsx:273` `<AttributionTracker/>` |
| 2 | 최초터치 캡처 → localStorage `gn_attr_v1` (덮어쓰기 없음) | `lib/analytics/attribution.ts:56-83` |
| 3 | 랜딩 GA4 `landing_view` (세션당 1회) | `components/analytics/attribution-tracker.tsx:16-21` |
| 4 | 온보딩 완료 시 `POST /api/attribution` (fire-and-forget) | `app/sign-up/[[...sign-up]]/page.tsx:421-428` |
| 5 | 서버: upsert ignoreDuplicates + `utm_source IS NULL`일 때만 백필 | `app/api/attribution/route.ts:62-79` |
| 6 | 퍼널 단계가 먼저 오면 빈 행 선생성 | 마이그 `20260729b_user_acquisition.sql:61-62` (RPC) |

**"라이브 1행뿐" 코드상 원인 후보** (귀속 컬럼이 안 채워지는 경로):
1. **호출부가 단 한 곳** — `/api/attribution` POST는 커스텀 온보딩 완료 핸들러(`sign-up/page.tsx:423`)에서만 발사. `/onboarding`은 `/sign-up`으로 redirect만 하므로(`app/onboarding/page.tsx:4`) 신규 유저는 이론상 통과하지만, **테이블 도입(2026-07-29) 이전 가입자는 영원히 귀속 불명** — 소급 경로 없음.
2. **`if (attribution)` 가드** (`sign-up/page.tsx:422`) — localStorage 차단(시크릿 모드, `attribution.ts:33-36` catch)이면 POST 자체를 스킵. 이 경우 행은 퍼널 RPC가 만들 때까지 안 생김.
3. **완전한 에러 삼킴** — `.catch(() => {})`(`sign-up/page.tsx:427`) + 응답 미확인. 401(Clerk 세션 타이밍)·429(rate limit `attribution/route.ts:29`)·500 전부 무증상. 서버 측 `console.error`(`route.ts:66,78`)만 남고 Sentry/알림 배선 없음.
4. 가입 자체가 이 핸들러를 안 타는 경로(예: 온보딩 미완료 상태로 이탈)면 `signup_at`조차 기록 안 됨 — `signup_at`은 오직 `/api/attribution`이 씀 (`route.ts:56`).
   ❓ 실제 프로덕션에서 어느 후보인지는 코드만으로 확정 불가 (user_acquisition 행 내용·서버 로그 대조 필요).

---

## 3. 퍼널 계측 — GA4 vs DB 원장

| 이벤트 | 매체 | 발사 지점 |
|---|---|---|
| landing_view | GA4만 | `attribution-tracker.tsx:18-21` (비로그인이라 DB 불가 — `api/admin2/funnel/route.ts:12-13` 주석) |
| signup_complete | GA4만 | `sign-up/page.tsx:429-432` |
| signup_at (원장) | DB | `api/attribution/route.ts:56` |
| first_slip | DB→GA4 | `app/api/betman/prediction/route.ts:559` RPC → true면 클라가 `first_prediction` GA4 (`hooks/use-betting-slip.ts:270-275`) |
| first_post | DB→GA4 | `app/api/posts/route.ts:383` → `hooks/use-write-submit.ts:122` (`first_community_action`) |
| first_comment | DB→GA4 | `app/api/comments/route.ts:246` → `hooks/use-comments.ts:21` |
| board_view / post_read | GA4만 | `components/community-content.tsx:96`, `hooks/use-post-view-tracker.ts:39` |
| prediction_submit | GA4만 | `hooks/use-betting-slip.ts:264-268` |

- "진짜 최초" 판정은 DB RPC가 boolean 반환으로 담당 (`lib/analytics/funnel.ts:14-31`, 절대 throw 안 함).
- **소비처**: `GET /api/admin2/funnel` (`app/api/admin2/funnel/route.ts:26-77`) + `app/admin2/funnel-card.tsx:37`. ⚠️ **/admin2는 폐기 확정(2026-08-04)인데 채널 퍼널 카드는 admin2에만 존재** — `app/admin` 하위에 funnel 검색 결과 0건. 정본 어드민으로 이관 필요.

---

## 4. 주간 크리에이터 맞대결 체인

| 단계 | 파일:라인 | 내용 |
|---|---|---|
| 영상 수집 | `app/api/cron/sync-videos/route.ts:33-65` | 매시 (`vercel.json:40-42`), YouTube RSS → `creator_videos` upsert. 크리에이터 4명 레지스트리 `lib/constants/creators.ts:23-61` |
| 영상 소비 | `app/api/creators/[creatorId]/videos/route.ts:25` | 크리에이터 보드 히어로+최근 |
| 맞대결 판정 | `lib/event/weekly-draw.ts:145-189` | `event_groups.captain_user_id` 주장 2인의 **그 주** skill_score 비교. 판정 규칙 순수 함수 분리 (`decideDuelWinner :199-214`) |
| 추첨 실행 | `app/api/cron/season-weekly-draw-snapshot/route.ts:73-97` | 후보(`buildCandidates`) → 스팀 5명(`drawWinners`, CSPRNG `weekly-draw.ts:108-118`) → 승리 팬덤에서 유니폼 1명 (스팀 당첨자 제외) |
| 저장/발표 | 같은 파일 `:99-168` | `season_weekly_draws` upsert + 봇 발표 글 → `/season` `WeeklyDrawReveal` (`app/season/page.tsx:775-790`) |

- creator_videos와 맞대결 판정은 **코드상 직접 연결 없음** — 크리에이터는 `captain_user_id`로만 이벤트에 연결. captain 미설정이면 매주 "주장 2명 미만"으로 유니폼 미지급 (`weekly-draw.ts:155-161`). ❓ 프로덕션 `event_groups.captain_user_id` 설정 여부 미확인 — 어드민 설정 UI 없음(SQL로만 가능).

---

## 5. 테이블 읽기/쓰기 매트릭스

| 테이블 | 쓰는 곳 | 읽는 곳 |
|---|---|---|
| events | 시드 마이그만 + `app/admin/event/actions.ts:24,49` (월드컵 status/league_codes) | worldcup/season 페이지·API, `app/page.tsx:121`, `app/prediction/page.tsx:48`, `betman/prediction:298`, `betman/games:84-91`, `discord-daily-digest:52` (이벤트 경기 제외용) |
| event_groups | 시드 마이그만 | season/worldcup 페이지, register API 2종, `weekly-draw.ts:150`, snapshot cron `:46` |
| event_registrations | register API 2종 insert (`worldcup:104`, `season:100`) | season/worldcup 페이지, admin/event, `betman/prediction:332`, chicken-draw `:76`, `weekly-draw.ts:84` |
| event_leaderboard_snapshots | `season-weekly-snapshot:86` | `app/season/page.tsx:169,184` |
| season_weekly_draws | `season-weekly-draw-snapshot:167-168` | `app/season/page.tsx:208` |
| season_chicken_draws | `season-chicken-draw:154` | 자기 자신 중복체크 `:65` — **소비 UI 없음** (발표는 봇 글/디스코드로만) |
| creator_videos | `sync-videos:61` | `api/creators/[creatorId]/videos:25` |
| user_acquisition | `api/attribution:62-79`, RPC `record_funnel_milestone` | `api/admin2/funnel:27` |
| weekly_analytics_reports | `cron/weekly-analytics:50` | `api/admin/analytics/reports*`, `lib/admin/insight.ts:65` (운영 인사이트 LLM 입력) |

GA4 리포트 생성: `lib/ga4/client.ts` (서비스계정 env 3종) + `lib/ga4/fetch-weekly-report.ts` → cron `weekly-analytics` (월 00:00 UTC, `vercel.json:28-30`) — 중복 기간 skip (`route.ts:29-43`).

---

## 6. 특이사항 / 냄새

| 심각도 | 항목 | 근거 |
|---|---|---|
| 🔴 | **season-chicken-draw cron 미등록** — 라우트 주석은 "매일 23:10 KST" 주장하나 `vercel.json`에 항목 없음. 외부 트리거 없으면 데일리 치킨 추첨은 한 번도 안 돎 | `app/api/cron/season-chicken-draw/route.ts:11` vs `vercel.json:1-112` (전수 확인) ❓외부(VPS 등) 호출 여부는 미확인 |
| 🔴 | **worldcup 페이지 event_id 미필터** — 시즌 등록자가 월드컵 등록자 수로 집계되고, 시즌만 등록한 유저도 월드컵 "등록됨" 판정 | `app/worldcup/page.tsx:56-58, 64-68` |
| 🟡 | **buildCandidates의 event_registrations 전수 조회** — event_id 필터 없어 월드컵 등록 행이 group_slug 매핑에 섞임. 양쪽 등록 유저는 순서에 따라 `gooner`가 이겨 유니폼 pool 필터(`draw-snapshot:93-95`)에서 누락될 수 있음 | `lib/event/weekly-draw.ts:83-91` |
| 🟡 | **채널 퍼널 카드가 폐기 확정된 /admin2에만 존재** — 정본 /admin에 이관 안 됨 | `app/admin2/funnel-card.tsx:37`, /admin 하위 funnel 0건 |
| 🟡 | **귀속 실패 무증상** — 클라 `.catch(()=>{})` + 서버 console.error만. "행이 안 쌓이는" 문제를 코드가 스스로 보고할 수 없음 | `sign-up/page.tsx:427`, `api/attribution/route.ts:66,78` |
| 🟡 | 추첨 cron의 발표 글 insert **error 미확인** — 글 생성 실패해도 `announced_post_id: null`로 조용히 진행 | `season-weekly-draw-snapshot:99-148`, `season-chicken-draw:142-152` |
| 🟢 | season-chicken-draw만 `withCronLog` 미적용 (다른 season cron 2종은 적용) | `season-chicken-draw:24-29` vs `season-weekly-snapshot:20` |
| 🟢 | 하드코딩: 자유게시판 category_id 2곳 중복 (`chicken-draw:21`, `draw-snapshot:19`), 월드컵 D-day 날짜(`worldcup/page.tsx:72`), preview 표본 숫자(`season/page.tsx:256`) | 좌기 |
| 🟢 | 홈·예측 페이지가 closed된 월드컵 status를 매 렌더 조회 — "이벤트 슬롯" 명목이나 slug 하드코딩이라 시즌 이벤트로 안 이어짐 | `app/page.tsx:121`, `app/prediction/page.tsx:48` |
| 🟢 | 이벤트 발표 글 작성자 = 뉴스 봇 계정 재사용 (`NEWS_BOT_USER_ID`) — 뉴스/이벤트 도메인 결합 | `draw-snapshot:6,102`, `chicken-draw:6,145` |

### 잘 된 점 (참고)
- 추첨 감사 가능성: 후보 명단 sha256 지문(`weekly-draw.ts:55-59`), CSPRNG(`:108-118`), (event_id, week_start/draw_date) unique로 재실행 안전.
- 시즌 슬립 동적 귀속(event_id 무부착)은 유저 마찰 0 + 소급 재계산 가능 — 월드컵 방식(event_id 부착 + 등록 검증 403)보다 단순.
- 퍼널 RPC의 "최초 1회" boolean 반환으로 GA4 중복 발사 문제를 DB가 해결 (`funnel.ts:6-8` 주석).

# 게임 도메인 감사 노트 (드래프트 / 미니게임 / 배틀·이상형월드컵)

작성: 2026-08-08, Phase 1 전수 감사. 근거는 전부 `상대경로:라인`.

## 1. 드래프트

### 1.1 진입 동선
| 단계 | 근거 |
|---|---|
| GNB에서 `/games` 숨김 (직접 URL 접근) | `components/header/header-nav.tsx:92` 주석 "게임(/games)·스타디움은 메뉴에서 숨김 (2026-07-26)" |
| `/games` 허브 → 플래그십 카드 `/games/draft` | `components/games/games-hub.tsx:79` |
| `/games/draft` = 카탈로그 카드 그리드 | `app/games/draft/page.tsx:10` → `components/draft/game-select-screen.tsx:5` (`DRAFT_GAMES` 사용) |
| 카탈로그: **arsenal만 active**, epl/slamdunk/3kingdoms/kpop/tour는 `hidden:true` | `lib/draft/games-catalog.ts:63-64` (epl `active:false, hidden:true`), `:87` (arsenal `active:true`) |
| `/games` 하위 공통 탭 내비 (드래프트+미니게임 3종) | `components/games-tab-nav.tsx:10-15`, `app/games/layout.tsx:16` |

### 1.2 솔로 모드 (클라이언트 전용, DB 무접촉)
- `app/games/draft/arsenal/page.tsx:11` → `DraftGame slug="arsenal"` → `components/draft/draft-game.tsx:9-58` (setup→drafting→placement→completed 4페이즈).
- 상태 머신은 순수 클라이언트: `components/draft/use-draft-game.ts:23-66` (`lib/draft/engine.ts`의 `createInitialState/makePick/getAIPick`). 서버 저장 없음 — 새로고침 시 소실.
- 선수 풀: 클라 `fetch("/data/arsenal-players.json")` (`lib/draft/players.ts:19`), 서버는 `public/data/arsenal-players.json` fs 읽기 + 메모리 캐시 (`lib/draft/server-players.ts:17`).

### 1.3 멀티플레이어 (방 생성→참여→스네이크→정리)
| 단계 | 파일:라인 | 테이블 |
|---|---|---|
| 방 생성: `POST /api/draft-rooms` (Clerk 인증+STRICT rate limit) → `createRoom` (호스트 좌석 0, invite_code 6자, 실패 시 방 롤백) | `app/api/draft-rooms/route.ts:38-66`, `lib/draft/rooms.ts:108-166` | `draft_rooms`, `draft_room_seats`, `draft_room_messages` |
| 참여: 초대코드 `POST join-by-code`, URL 직접 진입 시 서버 컴포넌트가 자동 join | `components/draft/draft-setup.tsx:106-136`, `app/games/draft/epl/room/[id]/page.tsx:32-52` (`joinRoom` `lib/draft/rooms.ts:219-286`) | 〃 |
| 공개 방 목록: `GET /api/draft-rooms` (익명 허용, 15초 폴링) | `app/api/draft-rooms/route.ts:21-30`, `components/draft/draft-setup.tsx:50-69` | `draft_rooms`+seats 집계 (`lib/draft/rooms.ts:376-433`) |
| 시작(호스트): 빈 좌석 AI fill → snake_order 셔플(짝수 라운드 정순/홀수 역순) → `status='drafting'`+30초 deadline | `lib/draft/multi-engine.ts:97-199` (스네이크 `:156-166`) | `draft_rooms`, `draft_room_seats` |
| 픽: `POST [id]/pick` → `pickPlayer` — 차례/예산/포메이션 슬롯 검증, 중복픽 race는 unique 23505로 방어, AI 차례면 서버에서 chain | `lib/draft/multi-engine.ts:226-355` (race `:292-298`), chain `:361-388`, AI 추천 휴리스틱 `:393-441` | `draft_room_picks`, `draft_room_messages` |
| 이탈: `POST [id]/disconnect`가 `disconnected_at` 마킹 (unmount/visibilitychange 시) | `app/api/draft-rooms/[id]/disconnect/route.ts:13-33` | `draft_room_seats` |
| 정리 cron: 매 5분 (`vercel.json:36-38`) — 30초 초과 disconnected 좌석→AI 전환+픽 chain, 30분 초과 waiting 방→abandoned | `app/api/cron/draft-rooms-cleanup/route.ts:17-39` → `runDraftRoomCleanup` `lib/draft/multi-engine.ts:580-588` (AI 전환 `:476-544`, abandon `:549-575`) | 〃 |
| 결과: `[id]/result` 페이지, 상태별 redirect 가드 | `app/games/draft/epl/room/[id]/result/page.tsx:26-36` | — |

- **Realtime 사용함**: 채널 `draft:room:{roomId}`, Postgres Changes(`draft_rooms`/`draft_room_seats`/`draft_room_picks`) + Presence. `hooks/use-draft-room-realtime.ts:63-79`, `hooks/use-draft-room-game.ts:54-70`. 변경 감지 시 REST refetch(`/api/draft-rooms/[id]` 또는 `/full`)로 전체 상태 재조회하는 "신호만 Realtime" 패턴.
- 모든 mutation은 service role로 RLS 우회, API route에서만 호출 (`lib/draft/rooms.ts:4-7`).

## 2. 미니게임 (minigame_scores)

| 게임 | 진입점 | 게임 본체 |
|---|---|---|
| 코너킥 히어로 | `app/games/corner-hero/page.tsx:14-15` | `public/games/corner-hero.html` (셀프컨테인드, iframe) |
| 패스 서바이버 | `app/games/pass-survivor/page.tsx` | `public/games/pass-survivor.html` |
| 론도 | `app/games/rondo/page.tsx` | `public/games/rondo.html` |

- 흐름: iframe HTML이 종료 시 `postMessage({type:'minigame:score'})` (예: `public/games/rondo.html:567`) → 부모의 `MiniGameLeaderboard`가 수신·origin 검증 (`components/games/mini-game-leaderboard.tsx:52-79`) → `POST /api/minigames/score`가 `minigame_scores` insert (`app/api/minigames/score/route.ts:40-44`, zod로 game enum 3종+score 0~1M 제한).
- 순위: `GET /api/minigames/leaderboard` → RPC `get_minigame_daily_leaderboard` (KST 당일 유저별 최고점 TOP10, s-maxage=15) — `app/api/minigames/leaderboard/route.ts:23-36`. 스키마: `supabase/migrations/20260612_minigame_scores.sql:4`.
- iframe 래퍼는 mount 시 focus만 처리 — `components/games/mini-game-frame.tsx:12-14`.

## 3. 죽은/휴면 기능 판정

| 기능 | 테이블 | 라우트/링크 | 판정 | 근거 |
|---|---|---|---|---|
| 배틀(응원전 cheer) | `battle_rooms/sides/participants/comments` | API `GET /api/battles/rooms`만 생존, 페이지 없음 | **휴면(의도적 보존)** | `app/api/battles/rooms/route.ts:8-44`. UI 소비자는 이상형 월드컵 페이지뿐(`components/worldcup/worldcup-page.tsx:27`). 테이블 정의 `supabase/migrations/00000000000001_prod_schema.sql:4539-4591` |
| 이상형 월드컵 | `worldcup_candidates/sessions/votes` | **app 라우트 없음** — `WorldcupPageClient`를 import하는 곳 0곳 | **죽음(도달 불가, 의도적 보존)** | `components/worldcup/worldcup-page-client.tsx:26` 정의만 존재. `components/games-tab-nav.tsx:7-8` 주석 "이상형 월드컵은 notFound 숨김… 재오픈 시 app/games/worldcup/page.tsx 원복"(해당 파일 미존재). knip 예외 등록 `knip.json:26-32`, 보존 지시 `docs/REFACTOR_PLAN.md:33` "삭제·수정 금지" |
| 〃 API 반쪽 | 〃 | vote/finish만 존재, **start/stats 없음** | 라우트 결손 | 훅이 `POST /api/battles/worldcup/start`(`hooks/use-worldcup.ts:37`)·`GET …/stats`(`:116,158`) 호출하나 `app/api/battles/` 하위엔 rooms/vote/finish 3개뿐. 재오픈 시 시작 자체가 불가 |
| 〃 생성 다이얼로그 | — | 스텁 | 죽음 | `components/battle/create-worldcup-dialog.tsx:3-12` "준비 중인 기능입니다" — null 반환 |
| 영화 퀴즈 | `movie_quizzes`, `movie_quiz_results` | 앱 코드 참조 0 | **완전 죽음** | `database.types.ts`와 `prod_schema.sql:5711-5726`에만 존재. app/components/lib/hooks grep 결과 코드 없음 |
| 가상 캐스팅 | `virtual_castings/_votes/_suggestions` | 앱 코드 참조 0 | **완전 죽음** | `prod_schema.sql:6723-6748`에만 존재 |
| 커미션 | `commission_orders/packages/milestones/messages` | 테이블 조회 코드 0 | **완전 죽음(잔재)** | `prod_schema.sql`+`database.types.ts:1284-1482`만. `app/admin/tokens/economy-health.tsx:18-20`은 토큰 원장 reason 라벨이지 테이블 접근 아님 |
| reviews/favorites/banners/inquiries/disputes/faqs/announcements | 각 동명 테이블 | 앱 코드에서 `from("...")` 호출 **0건** | **완전 죽음(구 앱 잔재)** | 테이블 정의 `prod_schema.sql:4498,4517,5140,5337,5353,5465,6174`. `{app,components,lib,hooks}` 전체 grep 무일치 |

- 참고: 이상형 월드컵(`worldcup_*` 테이블, `/api/battles/worldcup/*`)과 **이벤트 월드컵**(`app/worldcup/page.tsx:52`, `prediction_slips.event_id` 기반)은 이름만 같은 완전 별개 시스템. 이벤트 쪽은 이 노트 범위 밖.

## 4. 특이사항 / 냄새

| # | 냄새 | 근거 |
|---|---|---|
| 1 | **EPL 라우트가 아스날 풀을 서빙**: `/games/draft/epl`은 메타데이터가 "EPL FPL 드래프트 · 예산 £80"(`app/games/draft/epl/page.tsx:5-6`)인데 선수 데이터는 arsenal-players.json 하나뿐(`lib/draft/players.ts:19`, `lib/draft/server-players.ts:17`). 카탈로그에서 epl은 hidden인데 라우트는 살아있어 직접 URL로 도달 가능 | 위 각 라인 |
| 2 | **멀티플레이어 gameSlug 하드코딩**: arsenal 화면에서 멀티 모드를 선택해도 방 생성 body는 `gameSlug:"epl"` 고정, 이동 경로도 전부 `/games/draft/epl/room/...` 하드코딩 | `components/draft/draft-setup.tsx:82,98,130`, `components/draft/waiting-room.tsx:51-95`, `components/draft/multi-draft-board.tsx:142-145` |
| 3 | 멀티 픽 파이프라인에 **트랜잭션 없음**: pick INSERT와 `current_pick` UPDATE가 별개 쿼리 — 중복픽만 unique로 방어되고 INSERT 성공 후 UPDATE 실패 시 상태 불일치 가능 | `lib/draft/multi-engine.ts:285-317` |
| 4 | 카탈로그 `plays` 수치가 정적 하드코딩(epl 12480 등) — 실플레이 집계 아님. 허브 카피는 "기록 0판" 하드코딩 | `lib/draft/games-catalog.ts:54`, `components/games/games-hub.tsx:102` |
| 5 | `startRoom`이 참가자 1명이어도 시작 허용(최소 1) — 4인 방을 혼자 열고 AI 3 채워 시작 가능. 의도(솔로 대체)인지 확인 필요 | `lib/draft/multi-engine.ts:113-115` |
| 6 | 이상형 월드컵 훅의 silent catch 다수 — 단, REFACTOR_PLAN이 보류 영역으로 명시해 의도된 방치 | `hooks/use-worldcup.ts:59-61`, `docs/REFACTOR_PLAN.md:204` |
| 7 | 미니게임 점수는 클라 postMessage 신뢰 — 서버 검증은 상한 1M뿐이라 임의 점수 조작 가능(데일리 리더보드 한정 리스크) | `app/api/minigames/score/route.ts:7-10`, `components/games/mini-game-leaderboard.tsx:52-57` |

## ❓ 미확인
- `battle_*`·`worldcup_*`·`movie_quiz*`·`virtual_casting*`·commission·reviews 등 잔재 테이블의 **실제 행 수 0 여부** — DB 미조회(읽기 전용 감사, 코드 근거만). 메모리 기록상 2026-02-20 "타 앱 테이블 14개 삭제" 이후 프로덕션에 남았는지 별도 확인 필요.
- `get_minigame_daily_leaderboard` RPC 본문(마이그레이션 파일 내 정의 여부) — 호출부만 확인.
- `public/games/*.html` 3종의 내부 로직(각 500~1500라인)은 점수 postMessage 라인만 확인.

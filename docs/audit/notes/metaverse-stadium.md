# 감사 노트 — 메타버스 / 스타디움 (Phase 1)

작성: 2026-08-08 · 담당 도메인: Phaser 픽셀아트 월드(메타버스), 팀 경기장 건설/기부, 팬 점수 기부 루프
근거 표기: `상대경로:라인`. 미확인 항목은 ❓.

---

## 1. 메타버스 구조

### 1-1. 라우트 지형 (prod 노출 여부)

| 라우트 | prod 접근 | 가드 근거 |
|---|---|---|
| `/metaverse` | ✖ redirect→highbury | `app/metaverse/page.tsx:13` (`NODE_ENV !== "development"` redirect) |
| `/metaverse/highbury` | ✔ **유일한 정식 공간** | `app/metaverse/highbury/page.tsx:10-14` (PIP 바인딩만) |
| `/metaverse/prototype` | ✖ redirect | `app/metaverse/prototype/page.tsx:16` |
| `/metaverse/uk` (폐기 월드맵 입구) | ✖ redirect | `app/metaverse/uk/layout.tsx:8` |
| `/metaverse/interior-demo` | ✖ notFound | `app/metaverse/interior-demo/layout.tsx:4` |
| `/lounge` | ✖ redirect | `app/lounge/page.tsx:17` |
| `/stadium/chat-preview` | ✖ notFound | `app/stadium/chat-preview/layout.tsx:4` |
| `/stadium`, `/stadium/[teamId]`, `/stadium/map/[region]` | ✔ (GNB 비노출, 직접 URL) | `components/header/header-nav.tsx:92-97` (숨김 주석) |

데모/개발 라우트는 전부 env 가드가 있어 프로덕션 노출 없음 — 양호.

### 1-2. Phaser 씬 구성

| 씬 | 파일 | 용도 |
|---|---|---|
| WorldMapScene (734줄) | `lib/metaverse/scenes/world-map-scene.ts` | 영국 월드맵 — **폐기 방향** (`app/metaverse/page.tsx:11-12` 주석). prod 진입 경로 없음 |
| SideScrollerScene (1,207줄) | `lib/metaverse/scenes/side-scroller-scene.ts` | 사이드뷰 데모 — dev 전용 (`interior-demo`, `lounge`) |
| IndoorMapScene (812줄) | `lib/metaverse/scenes/indoor-map-scene.ts` | **정본**. 데이터 기반 인도어 맵 (`lib/metaverse/maps/map-config.ts`의 mapId로 재시작+페이드) |

부팅 팩토리 3종: `bootMetaverseGame` / `bootSideScrollerDemo` / `bootIndoorMap` — `lib/metaverse/boot.ts:34,89,132`. HiDPI는 indoor만 물리픽셀 backing store + `zoom: 1/dpr` 처리 (`boot.ts:140-157`).

### 1-3. Supabase Realtime 사용

| 래퍼 | 채널명 | 방식 | 근거 |
|---|---|---|---|
| WorldChannel | `metaverse:world` | Presence(위치, 200ms throttle) + Broadcast(`chat:world`, `room:created/closed`) | `lib/metaverse/realtime/world-channel.ts:68-99,128` |
| IndoorPresenceChannel | `metaverse:indoor:highbury:room-N` | Presence만 (채팅 없음), 5s keepalive | `lib/metaverse/realtime/indoor-presence-channel.ts:1-30` |
| RoomChannel | `metaverse:chat:{roomId}` (highbury-N) | Broadcast 채팅 + Presence 인원수. **채팅 비영속** (DB 저장 없음) | `lib/metaverse/realtime/room-channel.ts:1-50` |
| SideScrollerChannel | `metaverse:sidescroll:default` | 데모용 + `probeChannelOccupancy` 재사용 | `lib/metaverse/realtime/sidescroll-channel.ts` |
| server-broadcast | 서버→월드 `room:closed` | cron이 사용 | `lib/metaverse/realtime/server-broadcast.ts` |

- 전 채널 `private: true` + `realtime.messages` RLS가 topic `metaverse:%`에 한해 anon+authenticated 허용 — `supabase/migrations/20260625_metaverse_realtime_presence_rls.sql:17-28`.
- 예외: `/stadium/[teamId]` 채팅은 `stadium:{teamId}` **비-private 공개 채널** (`hooks/use-stadium-chat.ts:83-85`) — metaverse RLS 체계 밖. 로그인 유저만 구독하지만 채널 자체는 무인증 (냄새 §6-7).

### 1-4. 방 샤딩 + guest 진입

- 방 수 = 아스날(`epl_arsenal`) 경기장 레벨 (Lv.1=1방…Lv.10=10방): `app/api/lounge/config/route.ts:22-28`. 방당 정원 10: `lib/metaverse/constants.ts:49`.
- 배정 알고리즘: presence 채널을 track 없이 구독→인원 확인→자리 있으면 trackSelf, 만석이면 다음 방. 직접 선택(desiredRoom) 우선, 만석 시 자동 폴백. realtime 다운 시 싱글플레이 폴백: `components/metaverse/highbury-stage.tsx:258-318`.
- Phaser 청크(~1.3MB) 다운로드를 방 배정과 병렬 실행: `highbury-stage.tsx:249-251`.
- **guest는 프로덕션에서도 진입 가능**: 전역 `GlobalStadium`이 `<HighburyStage allowGuest>` 하드코딩 (`components/metaverse/stadium-pip.tsx:192-193`), guest identity는 클라 생성 `guest-gandalf-NNNN` (`highbury-stage.tsx:144-153`). 단 **API는 dev에서만 guest 허용** (`lib/metaverse/auth.ts:25`) — 즉 prod guest는 presence/채팅(broadcast)만 되고 아바타 구매·신고 등 API는 401. "guest 진입은 dev만"이라는 통념과 상충 ❓(의도 확인 필요 — highbury/page.tsx:13 주석은 의도로 읽힘).
- PIP: `/metaverse/highbury` 진입=full, 이탈=mini(연결 유지), ✕=unmount: `stadium-pip.tsx:4-13,209-217`.

## 2. 격리 원칙 검증 (기존 → metaverse import 금지)

README 원칙(`lib/metaverse/README.md:7`) 대비 위반 grep 결과 — 메타버스 외부에서 `lib/metaverse|components/metaverse` import는 정확히 4곳:

| 파일 | import 대상 | 판정 |
|---|---|---|
| `components/app-shell-client.tsx:8` | `StadiumPipProvider` | **위반 (의도적)** — PIP 전역 상주 설계로 원칙이 사실상 폐기됨. 전 페이지가 메타버스 코드에 의존 |
| `app/api/comments/route.ts:7,179` | `awardFlairKarma` | 위반이지만 README가 예정한 브리지 (`lib/metaverse/karma-award.ts:7-9`). 단 실동작 안 함 (§6-3) |
| `app/lounge/page.tsx:2` | `LoungeRoom` | dev 전용 라우트 — 영향 미미 |
| `app/api/lounge/config/route.ts:3` | `METAVERSE` 상수만 | 상수 참조 수준 |

결론: **"단방향 의존" 원칙은 문서상으로만 유효**. PIP·라운지·카르마 브리지로 이미 3방향 침투. README 갱신 필요.

## 3. 스타디움 — 레벨/기여 시스템 플로우

기여(=total_points 증가) 경로 3갈래:

| 경로 | 트리거 | 쓰기 방식 | 근거 |
|---|---|---|---|
| (a) 예측수익 투자 | UI `InvestDialog` (`components/stadium/stadium-room.tsx:233`, `stadium-world.tsx:311`) → `POST /api/stadiums/invest` | **RPC 없이 8단계 순차 write (비원자)** | `app/api/stadiums/invest/route.ts:58-170` |
| (b) flair 점수 기부 | 마이페이지 팬 정체성 → `POST /api/flair/donate` → RPC `donate_flair_score_to_team` | 원자적 (RPC 단일 호출) | `app/api/flair/donate/route.ts:44-48`; 함수 정의 `supabase/migrations/00000000000001_prod_schema.sql:1016` |
| (c) 정산 자동 동기화 | betman 정산 → `syncStadiumContributions` → RPC `sync_stadium_contribution` (delta 기반 멱등) | 원자적 | `lib/betman/settle.ts:4`; `lib/stadium/contribution-sync.ts:19-77` (공식: 예측×10+적중×25, `:8-10`) |

- 투자 잔액 = `SUM(betman_predictions.points_earned) − SUM(stadium_investments.points_invested)`: `invest/route.ts:57-78`, 조회는 `my-earnings/route.ts:24-46`.
- 레벨 재계산: invest는 `stadium_level_thresholds`를 직접 질의 (`invest/route.ts:121-131`); donate는 RPC 내부 처리 ❓(SQL 본문 미검증).
- 조회면: `/stadium/[teamId]` SSR(`app/stadium/[teamId]/page.tsx:17-52`, revalidate 30), 리더보드 `app/api/stadiums/[teamId]/leaderboard/route.ts:21-27`, 리그 지도 `app/api/stadiums/map/route.ts`.
- 방 수 연동(기부 당위성 루프): 경기장 레벨 → 라운지/하이버리 방 수 (`app/api/lounge/config/route.ts:9-11,27`).

## 4. 테이블 사용 현황

| 테이블 | 읽는 곳 | 쓰는 곳 | 상태 |
|---|---|---|---|
| `team_stadiums` | `app/api/lounge/config/route.ts:16`, `app/stadium/[teamId]/page.tsx:23`, `app/api/stadiums/map` | `invest/route.ts:112-131,167-170`, donate RPC, sync RPC | 활성 |
| `team_map_pins` | `app/stadium/[teamId]/page.tsx:18`, `invest/route.ts:46-51`, `app/api/metaverse/teams/route.ts:22-27`, map API | (시드/관리) | 활성 |
| `stadium_contributions` | `[teamId]/page.tsx:46-52`, leaderboard API:21-27 | `invest/route.ts:135-158`, donate RPC, sync RPC | 활성 |
| `stadium_level_thresholds` | `invest/route.ts:122`, `app/api/stadiums/[teamId]/route.ts:60` | — | 활성 (단 §6-4 이원화) |
| `stadium_investments` | `invest/route.ts:70-75`, `my-earnings/route.ts:36-41` | `invest/route.ts:92-96` | 활성이나 **행수 미확인** ❓ (UI는 살아있으므로 미사용 단정 불가) |
| `metaverse_chat_rooms` | chat-rooms API 3종 | cron `metaverse-cleanup-rooms/route.ts:28-33` | **휴면** — 방 생성 UI는 폐기된 월드맵(dev 전용)에만. cron만 30분마다 공회전 (`vercel.json:32`) |
| `metaverse_world_plots` | `app/api/metaverse/plots/route.ts:16` | — | 휴면 (월드맵 전용) |
| `metaverse_fandom_memberships` | **코드 참조 0** (`lib/supabase/database.types.ts:2858`뿐) | — | **죽은 테이블** |
| `metaverse_avatar_items` / `metaverse_avatar_inventory` / `metaverse_user_activity_balance` | avatar/activity-balance API 4종 (prod 노출) | RPC `metaverse_purchase_avatar` 등 | **휴면** — UI(`AvatarShopModal`)는 dev 데모에만 (`components/metaverse/lounge-room.tsx:29`, `side-scroller-demo.tsx:23`). prod highbury-stage는 미사용 |
| `metaverse_user_reports` | admin API (`app/api/admin/metaverse/chat-rooms/[id]`) | `app/api/metaverse/reports/route.ts:35` ← highbury `ReportUserDialog` (`highbury-stage.tsx:30,176-181`) | 활성 (prod 유일의 metaverse_* 쓰기 경로) |

메타버스 API 인증은 공통 `resolveMetaverseUser` (Clerk 필수, dev만 guest 헤더): `lib/metaverse/auth.ts:18-32` — 9개 라우트 전부 일관 사용 확인.

## 5. 번들 영향 (Phaser)

- Phaser 직접 import는 `lib/metaverse/scenes,avatar,boot` + `lib/stadium/game/scenes`에 한정. 진입은 전부 **클라 컴포넌트 useEffect 내 dynamic import**:
  - `components/metaverse/highbury-stage.tsx:251` (`import("@/lib/metaverse/boot")`)
  - `components/metaverse/side-scroller-demo.tsx:100-102`, `lounge-room.tsx:133-136`
  - `components/stadium/game-canvas.tsx:40` + `next/dynamic ssr:false` (`game-canvas-dynamic.tsx:11`)
- 따라서 Phaser(~1.3MB, `highbury-stage.tsx:249` 주석)는 초기 번들에 미포함, 하이버리 진입 시에만 로드 — 양호.
- **단, PIP 전역 상주 탓에** `highbury-stage.tsx`(736줄) + 채팅 UI 5종 + realtime 래퍼 2종 + constants/presets가 `app-shell-client.tsx:8` 정적 체인으로 **전 페이지 클라 번들에 포함** (`stadium-pip.tsx:26`이 HighburyStage 정적 import). Phaser는 아니지만 공짜는 아님 — lazy 전환 여지.
- `/stadium`(StadiumWorld/StadiumRoom)은 Phaser 미사용 — DOM/CSS 렌더 (`components/stadium/stadium-view.tsx:15-25` 색상 테이블 기반). Phaser판(`lib/stadium/game/`)은 chat-preview(dev)만 사용 — 교체 준비 중간 상태 (`app/stadium/chat-preview/page.tsx:8-11` 주석).

## 6. 특이사항 / 냄새

1. **`/api/stadiums/invest` 비원자 (돈 경로)**: 잔액 검사(`:78`)→insert(`:92`)→total_points 갱신(`:112`)→레벨(`:121`)→기여 upsert(`:135`)→fan_count(`:161`)가 트랜잭션 없이 순차 실행. 동시 요청 시 **이중 투자(잔액 초과) race** + 중간 실패 시 부분 반영. donate가 RPC로 한 것과 대조적. 실피해는 트래픽 낮아 미미하나 RPC화 권장.
2. **fan_count 산정이 전 행 로드**: `invest/route.ts:161-165`가 기여자 row 전체를 select해 `length`로 카운트. DB 함수 `update_stadium_fan_counts`가 존재하나 (`prod_schema.sql:4129`) **호출처 0** (types 참조뿐).
3. **카르마 적립 사실상 사망**: `awardFlairKarma`는 comments 라우트에만 배선(`app/api/comments/route.ts:179`, 조건 `flair_team_id` non-null)인데, posts insert가 `flair_team_id: null` 하드코딩 (`app/api/posts/route.ts:346`)이고 non-null로 쓰는 코드가 전무 → 조건이 영원히 false. `karma-award.ts:8` 주석의 "POST /api/posts (+10)"도 미배선. RPC `metaverse_award_flair_karma`(`prod_schema.sql:2053`)는 죽은 경로. ※ flair 활동점수(`apply_flair_score` 트리거)와는 별개 시스템 — 그쪽은 활성.
4. **레벨 정의 이원화**: 하드코딩 `lib/constants/stadium-levels.ts` (self 주석 "DB와 동기화", `:3`)를 SSR 페이지·stadium-world가 쓰고 (`app/stadium/[teamId]/page.tsx:35-42` 진행도 계산), invest/[teamId] API는 DB `stadium_level_thresholds`를 씀. 두 소스가 어긋나면 화면 진행도 ≠ 실제 레벨업 지점.
5. **월드맵 체인 = 폐기 예정 죽은 코드 덩어리**: WorldMapScene(734줄)·WorldChannel·plot-marker·country-picker·chat-rooms/plots API·`bootMetaverseGame` 전부 dev 전용 진입뿐. 관련 cron(`metaverse-cleanup-rooms`)은 prod에서 30분마다 빈 UPDATE 공회전 (`vercel.json:32`). 정리 대상.
6. **격리 원칙 문서 부패**: README(`lib/metaverse/README.md:7,38-40`)의 "기존 코드는 절대 import 금지 / GNB 비노출"은 PIP 전역 상주(§2)로 무효화. 폴더 맵(`README.md:54-62`)의 `metaverse-stage.tsx`, `karma.ts`, `fandom.ts`, `plot.ts`도 실재 안 함.
7. **`/stadium/[teamId]` 채팅 채널 비보호**: `stadium:{teamId}`는 private 아님 (`hooks/use-stadium-chat.ts:83-85`) → RLS 없이 anon 키만으로 broadcast 송신 가능. metaverse 채널(`private:true`+RLS)과 정책 불일치.
8. 에러 처리: fire-and-forget 패턴이 일관 적용(카르마 `karma-award.ts:40-48` console.error 후 무시, presence track 실패 warn `world-channel.ts:150`, cron broadcast `Promise.allSettled` `metaverse-cleanup-rooms/route.ts:41`) — 침묵 삼킴이 아닌 로그 남김 확인. 닉네임 로드 `.catch(() => {})` (`highbury-stage.tsx:132`)만 완전 무음(양성).

## ❓ 미확인

- `donate_flair_score_to_team` / `metaverse_*` RPC SQL 본문 (prod_schema.sql:1016,2053-2317) — 함수 존재만 확인, 내부 로직(레벨 재계산·cap) 미검증.
- `stadium_investments` 실제 행수 (0행 여부는 DB 조회 필요 — UI 경로는 살아있음).
- prod guest 진입(§1-4)이 의도인지 회귀인지 — 코드 주석은 의도로 읽히나 운영 결정 기록 미발견.
- `lib/stadium/regions.ts`·`map-utils.ts`의 상세 및 `/stadium/map/[region]` 실사용 트래픽.

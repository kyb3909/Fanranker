# 리팩토링 후보 (candidates)

> 작성일 2026-07-28 · 대상 커밋 `162414b7` (main, clean)
> 자매 문서: `risk-map.md` (위험 지도), `test-gaps.md` (테스트 커버리지 갭) — 본 문서는 그 둘을 건드리지 않는다.
> **코드는 일절 수정하지 않았다. 아래 수치는 전부 실제 도구 실행 결과다.**

## 0. 실행한 도구 · 원시 결과

| 도구 | 명령 | 결과 |
| --- | --- | --- |
| madge | `pnpm exec madge --circular .` | 1093 파일 스캔 → **순환 의존 0건** ✅ |
| knip | `pnpm exec knip` | unused files 4 · unused exports 15 · unused types 10 · unused devDep 1 |
| eslint | `pnpm exec eslint .` | **0 error / 1 warning** (`post-card-content.tsx:344` `no-img-element`) |
| tsc | `pnpm exec tsc --noEmit --listFilesOnly` | 프로그램 파일 3654개 (`data/agent-test/**` 는 제외됨 — 타입체크 비용 없음) |

### 코드베이스 규모 (스케일 감각용)

```
app/ page.tsx        87        components/*.tsx    191
app/api/**/route.ts 187        lib/**/*.ts         128
hooks/*.ts(x)        36        전체 소스           109,347 줄
500줄 초과 파일       32        300줄 초과 파일      78
```

---

## 1. 죽은 코드

### 1-1. ⭐ `lib/supabase/types.ts` — 2,647줄 완전 사장 + 스키마와 불일치

| 항목 | 내용 |
| --- | --- |
| 파일 | `lib/supabase/types.ts` (2,647줄) |
| 규모 | import 하는 파일 **0개** |
| 난이도 | **하** (파일 삭제 + `knip.json` ignore 항목 제거) |
| 폭발 반경 | **0개 파일**. `knip.json:ignore` 에서 한 줄 지우면 끝 |

`lib/supabase/types.ts` 와 `lib/supabase/database.types.ts` 두 개의 생성 타입 파일이 각각 `export type Database` 를 정의하는데, **둘 다 어느 파일도 import 하지 않는다** (`grep -rl "supabase/types"` → 0, `grep -rl "supabase/database.types"` → 0).

두 파일은 이미 갈라졌다:

```
lib/supabase/types.ts          엔트리  80개  ← 낡음
lib/supabase/database.types.ts 엔트리 192개  ← 현행
```

`types.ts` 에만 있는 것: `subscriptions`, `commission_escrow`, `escrow_hold_gold`, `escrow_refund_gold`, `settle_betman_game` — **2026-02-20 에 삭제된 타 앱 테이블**들이다. `database.types.ts` 에만 있는 것 112개 (`adj_titles`, `board_moderators`, `agent_runs`, `apply_flair_score` …).

**왜 고칠 가치가 있는가**: 온보딩 비용. 신규 작업자가 `Database` 타입을 찾으면 두 개가 나오고, 그중 하나는 존재하지 않는 테이블을 정의한다. 실수로 `types.ts` 를 참조하면 컴파일은 통과하지만 런타임에 없는 테이블을 치게 된다. 두 파일 모두 `knip.json:ignore` 에 들어 있어서 knip 이 영원히 침묵한다.

> ⚠️ **주의**: `database.types.ts` 는 삭제하지 말 것. 아래 5-1 의 타입 구멍을 메울 때 쓸 유일한 재료다. 지울 것은 `types.ts` 뿐이다.

---

### 1-2. `lib/utils/format.ts` — 테스트가 살려두고 있는 죽은 코드

| 항목 | 내용 |
| --- | --- |
| 파일 | `lib/utils/format.ts:2` `formatCount`, `:8` `formatMemberCount` (15줄) |
| 규모 | 프로덕션 호출처 **0**. 유일한 import 는 `__tests__/lib/utils/format.test.ts:2` |
| 난이도 | **하** |
| 폭발 반경 | 2개 파일 (`lib/utils/format.ts` + 해당 테스트) |

knip 이 못 잡았다 — 테스트가 import 하고 있어서 "사용 중"으로 계산된다. **knip 결과만 믿으면 안 되는 대표 사례.**

한편 같은 일을 하는 `formatBalls` 가 `components/betting/stats-tab.tsx:22` 에 로컬로 재구현돼 있고, `formatMemberCount` 와 1000~9999 구간에서 답이 다르다 (`"9,500명"` vs `"9.5천"`). → 4-3 참조.

**왜 고칠 가치가 있는가**: "테스트가 있으니 살아있는 코드"라는 잘못된 신호를 준다. 지우거나, 아니면 `formatBalls` 를 이쪽으로 통합해서 실제로 살려야 한다. 둘 중 하나.

---

### 1-3. 🚨 `data/agent-test/` — node_modules 2,410개가 git 에 커밋돼 있음

| 항목 | 내용 |
| --- | --- |
| 경로 | `data/agent-test/` |
| 규모 | git 추적 파일 **2,422개 / 21MB**. 그중 **2,410개가 `node_modules/`** |
| 난이도 | **하** (`git rm -r --cached` + `.gitignore` 한 줄) |
| 폭발 반경 | **0개 소스 파일**. 코드에서 `agent-test` 를 참조하는 곳 0건 |

```
$ git ls-files data/agent-test | wc -l          → 2422
$ git ls-files data/agent-test | grep -c node_modules → 2410
$ grep -rn "agent-test" app lib components scripts docs package.json → 0건
```

`.gitignore:99` 에 `data/crawlers/node_modules/` 는 있는데 `data/agent-test/node_modules/` 는 빠졌다.

**왜 고칠 가치가 있는가**: 두 가지 실측 비용.
1. **검색 오염** — 이 조사 중에 `as unknown as` 를 grep 했더니 결과 60건 중 **절반 이상이 `data/agent-test/node_modules/@supabase/**` 의 벤더 코드**였다. 사람이든 에이전트든 리포 전역 검색을 할 때마다 노이즈를 먹는다.
2. clone/checkout 21MB 추가.

타입체크 비용은 **없다** — `tsc --listFilesOnly` 로 확인했고 프로그램에 0개 포함된다. (이건 확인 안 하고 추측했으면 틀렸을 부분이다.)

> `data/agent-test/` 의 소스 12개(`gen.js`, `personas.json`, `runner.js` …)는 별개 판단 필요. 코드 참조는 없지만 일회성 스크립트 자산일 수 있다. **node_modules 만 먼저 걷어내는 게 안전하다.**

---

### 1-4. knip 이 잡은 "unused files" 4개 — ⚠️ 3개는 오탐, 지우면 안 됨

knip 원문:

```
Unused files (4)
components/header/gold-balance.tsx
components/home/content-section.tsx
components/worldcup/worldcup-recap-board.tsx
lib/youtube/resolve-channel.ts
```

역추적 결과:

| 파일 | 줄 | 판정 | 근거 |
| --- | --- | --- | --- |
| `components/header/gold-balance.tsx` | 72 | 🚫 **보존** | `components/header/header.tsx:13,88` 에 **주석으로 봉인**된 상태. "골드 경제 출시 전 숨김 (launch)". 복원 = 주석 해제 |
| `components/worldcup/worldcup-recap-board.tsx` | 126 | 🚫 **보존** | `app/worldcup/result/page.tsx:474`, `components/betting/betting-page.tsx:126` 두 곳에 주석 봉인 |
| `lib/youtube/resolve-channel.ts` | 15 | ⚠️ **보류** | `lib/constants/creators.ts:6` 주석이 "이 함수 결과를 캐시한 값"이라고 명시. 채널 추가 시 손으로 돌리는 일회성 툴 |
| `components/home/content-section.tsx` | 184 | ✅ **삭제 후보** | 주석 봉인조차 없음. `components/home/*` 8개 중 유일하게 importer 0. 마지막 손댄 커밋 `a92a9cfe`(팔로우 UI 전면 숨김) |

**이게 이 섹션의 핵심 교훈이다**: knip 의 "unused files" 4건 중 **정말 지워도 되는 건 1건뿐**이다. 나머지는 "출시 전 봉인" 패턴 — 주석 처리된 import 는 knip 에게 안 보인다. 자동으로 청소하면 골드 경제 UI 가 통째로 날아간다.

---

### 1-5. knip "unused exports" 15건 — ⚠️ 대부분 죽은 코드가 아니다

`classifyTier`, `isPrivateIp`, `buildTipTapDoc`, `TEAM_KEYWORDS`, `useStadiumPip`, `gandalfTexKey` … 전부 **같은 파일 안에서 실제로 호출된다**. knip 이 말하는 건 "`export` 키워드가 불필요하다"이지 "코드가 죽었다"가 아니다.

```
lib/ssrf-guard.ts:29   if (addrs.some((a) => isPrivateIp(a.address)))   ← 사용 중
lib/ssrf-guard.ts:34   export function isPrivateIp(...)                 ← knip 이 지목
lib/agg/publish.ts:108 const content = buildTipTapDoc(...)              ← 사용 중
```

진짜 잉여는 **1건**: `components/my-predictions/prediction-types.ts:2` 가 `@/types/betting` 의 `SPORT_ICONS`/`sportColorFill` 을 재수출하는데 아무도 이 경로로 import 하지 않는다 (실제 소비자 `components/betting/prediction-slip-card.tsx:7` 은 `@/types/betting` 을 직접 친다). 배럴 껍데기.

**권고**: `export` 제거 작업은 값어치가 낮다(런타임 영향 0, 버그 방지 효과 0). **하지 말 것을 권한다.** 대신 `knip.json` 에 `"includeEntryExports": false` 를 두거나, 이 15건을 노이즈로 인정하고 넘어가는 편이 낫다.

---

### 1-6. `hooks/use-worldcup.ts` — 존재하지 않는 API 를 부르는 배틀 월드컵 클러스터

| 항목 | 내용 |
| --- | --- |
| 파일 | `hooks/use-worldcup.ts` + `components/battle/{worldcup-view,worldcup-stats,create-worldcup-dialog}.tsx` + `components/worldcup/worldcup-page{,-client}.tsx` |
| 규모 | 6개 파일. 전부 `knip.json:ignore` 에 등재돼 있어 knip 이 침묵 |
| 난이도 | **중** (제품 판단 필요) |
| 폭발 반경 | 6개 파일 + `knip.json` |

```
hooks/use-worldcup.ts:37   fetch("/api/battles/worldcup/start")           ← 라우트 없음
hooks/use-worldcup.ts:116  fetch("/api/battles/worldcup/stats?...")       ← 라우트 없음
hooks/use-worldcup.ts:158  fetch("/api/battles/worldcup/stats?...")       ← 라우트 없음

$ find app/api/battles -name route.ts
app/api/battles/rooms/route.ts
app/api/battles/worldcup/finish/route.ts
app/api/battles/worldcup/vote/route.ts        ← start/stats 는 없음
```

`components/worldcup/worldcup-page-client.tsx` 는 importer 0. 나머지는 서로만 참조하는 고립 섬이다.

한편 실제로 출시된 월드컵은 완전히 다른 스택이다: `app/worldcup/*` (RSC) + `app/api/event/worldcup/*` + `components/worldcup/*`. **같은 이름의 기능이 두 벌 존재하고 그중 한 벌은 백엔드가 없다.**

**왜 고칠 가치가 있는가**: 온보딩 비용이 크다. "월드컵 코드 고쳐줘"라는 요청에 두 스택 중 어느 쪽인지 판단하는 데 시간이 든다. `knip.json:ignore` 로 덮어놨기 때문에 자동 검출도 안 된다. 제품 소유자 확인 후 통째로 제거하거나, 최소한 파일 상단에 DEPRECATED 주석이라도 박아야 한다.

---

## 2. 순환 의존

**0건.** `pnpm exec madge --circular .` → `✔ No circular dependency found!` (1093 파일, 41.6s)

이 축은 건강하다. 다음 스프린트에서 다룰 것 없음.

---

## 3. 거대 파일 / 다중 책임

500줄 초과 32개 중, **책임이 실제로 섞인** 것만 골랐다. (`lib/supabase/database.types.ts` 6453줄, `lib/supabase/types.ts` 2647줄은 생성 파일이라 제외)

### 3-1. ⭐ `app/api/betman/prediction/route.ts` — POST 하나가 538줄, 그것도 돈 경로

| 항목 | 내용 |
| --- | --- |
| 파일 | `app/api/betman/prediction/route.ts` (738줄) |
| 규모 | `POST` = `:41`–`:578` **단일 함수 538줄**, `GET` = `:579`–끝 |
| 난이도 | **상** (트랜잭션 경계 설계 판단 필요) |
| 폭발 반경 | 라우트 1개 + `lib/betman/*`. 클라이언트는 `/api/sports/prediction` 리라이트를 통해 부르므로 **호출부 변경 불필요** |

한 함수 안의 책임 목록:

1. Clerk 인증 (`:43`)
2. service-role 클라이언트 생성 (`:48`)
3. body JSON 파싱 + zod 검증 (`:49`–`:58`)
4. 멱등성 키 조회 (`:62`–`:77`)
5. 이벤트(월드컵) 슬립 해석
6. 경기 조회 + **가드 8종 직렬 체인** — `status !== scheduled`(`:150`), `match_time` null/NaN(`:161`), 팀 미정 placeholder(`:184`), 전반전 마켓 차단(`:197`), 리그 코드 검증(`:320`) …
7. 배당 검증 + `totalOdds` 곱셈 (`:385`–`:389`)
8. 토큰 차감 RPC
9. 슬립 + 아이템 INSERT

**왜 고칠 가치가 있는가**: 버그 유발 가능성. 가드 체인의 각 항목이 **과거 실제 사고의 흔적**이다 — 코드 주석이 그렇게 증언한다:

```
:159  // 경기 시간 미정 가드 — match_time 이 null/invalid 이면 베팅 차단.
:160  //  (deadline 비교가 NaN 으로 빠져서 통과되던 버그 수정)
:196  // 전반전(반쪽) 마켓 베팅 차단 (2026-06-14, 사용자 요청)
```

가드가 하나 늘 때마다 538줄짜리 함수가 더 길어지고, 어느 가드가 어느 순서에 있어야 하는지 아무도 모르게 된다. 각 가드를 `validateGames(games): GuardError | null` 로 뽑아내면 개별 단위 테스트가 가능해진다.

**추가 발견 — 같은 파일 안에서 에러 처리 방식이 섞여 있다**: `apiBadRequest`/`apiUnauthorized` 를 5회 쓰면서 동시에 raw `NextResponse.json({error}, {status})` 를 **13회** 쓴다. → 6-2 참조.

---

### 3-2. `components/post-card/post-card-content.tsx` — 1,050줄에 컴포넌트 20개

| 항목 | 내용 |
| --- | --- |
| 파일 | `components/post-card/post-card-content.tsx` (1,050줄) |
| 규모 | 한 파일에 **최상위 함수/컴포넌트 20개** |
| 난이도 | **중** (기계적 분할이지만 파일 수가 늘어남) |
| 폭발 반경 | 파일 자체 + `components/post-card/index.ts` 배럴. 외부 소비자는 `PostCardContent` 하나만 보므로 **외부 0** |

한 파일이 지고 있는 책임:

| 책임 | 심볼 |
| --- | --- |
| 메인 렌더 | `PostCardContent` (`:87`, 185줄) |
| 이미지 3종 | `FeedSideThumbnail`(`:272`) `FeedImageFrame`(`:308`) `FeedImageCarousel`(`:360`) |
| 비디오 2종 | `FeedVideoPlayer`(`:430`) `XVideoPlayer`(`:810`) |
| YouTube 임베드 | `YouTubeInlinePlayer`(`:446`) |
| X/Twitter 임베드 | `LazyXInlinePreview`(`:556`) `XInlineContent`(`:567`) `renderTweetText`(`:789`) `buildTwitterVideoProxyUrl`(`:552`) `toTwitterMedium`(`:30`) |
| Instagram 임베드 | `LazyInstagramPreview`(`:886`) `InstagramJsEmbed`(`:896`) `InstagramInlineContent`(`:922`) |
| 라이트박스 | `EmbedImageLightbox`(`:659`) — `createPortal` |
| 공통 칩/스켈레톤/아이콘 | `ProviderCard`(`:712`) `ProviderBadge`(`:758`) `EmbedSkeleton`(`:1008`) `XIcon`(`:1036`) `InstagramIcon`(`:1044`) |
| **데이터 페칭** | `oembedFetcher`(`:538`) + `useSWR` 2회 (`:568`, `:923`) |
| 텍스트 처리 | `stripUrlTokens`(`:52`), `CATEGORY_CHIP` 상수(`:40`) |

**왜 고칠 가치가 있는가**: 변경 비용. 인스타그램 임베드 하나 고치려고 1,050줄 파일을 열어야 하고, 그 안에는 X 비디오 프록시와 카테고리 칩 색상표가 같이 들어 있다. 실제로 메모리에 남은 사고 이력이 이 파일을 가리킨다 — "IG 임베드 리렌더 사라짐 (피드 리렌더가 embed.js iframe 을 덮어씀)".

**분할 제안** (자연스러운 경계가 이미 있다):
```
post-card-content.tsx          ← PostCardContent + stripUrlTokens + CATEGORY_CHIP
post-card-media.tsx            ← 이미지/비디오 5종
post-card-embed-x.tsx          ← X 6종
post-card-embed-instagram.tsx  ← Instagram 3종
post-card-embed-shared.tsx     ← ProviderCard/Badge/Skeleton/Lightbox/아이콘
```

리포 유일한 eslint warning(`:344` `no-img-element`)도 여기 있다.

---

### 3-3. `components/metaverse/highbury-stage.tsx` — useState 14개 · useEffect 10개

| 항목 | 내용 |
| --- | --- |
| 파일 | `components/metaverse/highbury-stage.tsx` (736줄) |
| 규모 | 단일 컴포넌트에 `useState` **14개**, `useEffect` **10개** (`:96,:122,:176,:185,:235,:355,:409,:427` …) |
| 난이도 | **상** (Realtime 구독 생명주기 = 설계 판단) |
| 폭발 반경 | 자신 + `lib/metaverse/realtime/*`. 소비자는 `/metaverse` 라우트뿐 |

섞인 책임: Clerk 인증 → 프로필 조회 → 경기장 config 조회 → **방 샤딩 로직**(`roomIndex`/`allFull`/`joinAttempt`/`desiredRoom`/`currentOccupancy`/`roomCounts`, 6개 state) → `RoomChannel` + `IndoorPresenceChannel` **두 개의 Realtime 구독 생명주기** → `sceneBridge` 로 Phaser 씬 명령 → 헤더 오프셋 측정 → 신고 다이얼로그 → 채팅 오버레이.

**왜 고칠 가치가 있는가**: 버그 유발 가능성이 리포에서 가장 높은 축에 든다. Realtime 구독 2개 × effect 10개 = cleanup 누락 시 유령 presence. `lib/supabase/client.ts:29`–`:36` 의 긴 주석이 이미 이 문제를 증언한다 — *"createAnonClient 를 여러 곳(메타버스 RoomChannel + IndoorPresenceChannel 등)에서 호출하면 GoTrueClient 가 중복 생성돼 presence sync 불안정(다른 유저가 안 보임)"*. 즉 이 컴포넌트의 복잡도가 이미 한 번 클라이언트 팩토리를 바꾸게 만들었다.

**분할 제안**: 방 샤딩 6-state 를 `useRoomShard()` 훅으로, Realtime 구독 2개를 `useStageRealtime()` 으로 뽑으면 본체가 렌더에만 집중한다.

---

### 3-4. 나머지 500줄 초과 파일 (참고)

| 파일 | 줄 | 성격 | 난이도 |
| --- | --- | --- | --- |
| `lib/metaverse/scenes/side-scroller-scene.ts` | 1207 | Phaser 씬 — 게임 루프는 원래 길다. **손대지 말 것** | — |
| `components/draft/multi-draft-result.tsx` | 781 | 렌더 전용 | 중 |
| `components/draft/multi-draft-board.tsx` / `draft-board.tsx` | 764 / 757 | **서로 복제** → 4-4 참조 | 중 |
| `components/cardnews/card-news-feed.tsx` | 754 | 컴포넌트 12개 + `useEffect` 페이징(`:696`) | 중 |
| `app/design-preview/preview-client.tsx` | 719 | 데모 페이지 | 하 |
| `app/design-demo/page.tsx` | 663 | 데모 페이지 | 하 |
| `components/ui/sidebar.tsx` | 686 | shadcn 원본 — **손대지 말 것** | — |
| `app/write/page.tsx` | 558 | 이미 `useWriteEditor` 로 분리 진행됨 (`docs/refactor/2026-06/05_write_decomposition_design.md`) | 중 |

> 🔎 **`app/design-demo/*` (총 ~1,800줄)**: 프로덕션 번들에 들어가는 디자인 데모 라우트다. `lib/middleware/onboarding-guard.ts:15` 에서 예외 처리만 돼 있고, `app/design-preview/page.tsx:19` 에는 `robots: { index: false }` 가 있지만 **`app/design-demo/` 에는 noindex 가 없다.** 검색 엔진 노출 가능. 삭제할지 noindex 를 붙일지 제품 판단 필요.

---

## 4. 중복 로직

### 4-1. 🚨 `app/api/admin/stats/route.ts` ≡ `app/api/betman/community-stats/route.ts` — 라우트 파일 통째 복제, 이미 4곳 갈라짐

| 항목 | 내용 |
| --- | --- |
| 파일 | `app/api/admin/stats/route.ts` (197줄) · `app/api/betman/community-stats/route.ts` (228줄) |
| 규모 | **비공백 동일 라인 94개**, `diff -b` 훅 17개. `toKSTDate` 헬퍼, `overall` 집계, 7일 `dailyTrend` 루프가 **완전 동일** |
| 난이도 | **중** |
| 폭발 반경 | 2개 라우트 + 신설 `lib/betman/stats-aggregate.ts`. 클라이언트 호출부 변경 없음 |

**이미 갈라진 4곳 (= 두 대시보드가 같은 날짜에 다른 숫자를 보여준다)**:

| 갈라진 지점 | admin/stats | betman/community-stats |
| --- | --- | --- |
| 이벤트 슬립 | 포함 | **제외** (`eventSlipIdSet` `:20-25,:145,:181`) → **house P&L 이 서로 다름** |
| `wagered`/`payout` 반올림 | 응답에서 반올림 (`:180-181`) | 반올림 안 함 (`:211-212`) |
| 쿼리 에러 | HTTP 500 전파 (`:87-90`) | 삼켜버리고 0 반환 |
| `bySport` | 행 1:1 매핑 (`totalPredictions`/`participants`) | `Map` 집계로 재작성 (`correctPredictions`/`wrongPredictions`) — **응답 스키마 자체가 다름** |

**왜 고칠 가치가 있는가**: 이건 미관 문제가 아니라 **데이터 신뢰성 문제**다. 운영자가 `/admin/stats` 에서 본 하우스 손익과 커뮤니티 통계 페이지의 숫자가 다르고, 어느 쪽이 맞는지 판단할 근거가 코드 안에 없다. 앞으로 집계 규칙이 바뀔 때마다 두 곳을 고쳐야 하고, 지금까지 4번 중 4번 다 한쪽만 고쳤다.

---

### 4-2. 🚨 UTC→KST 변환 — 구현체 17개, 그것도 **서로 호환되지 않는 두 계열**

| 항목 | 내용 |
| --- | --- |
| 규모 | 오프셋 산술 계열 **11개 파일 / 15 호출부** + `Intl` 계열 **6개** = 총 17 구현 |
| 난이도 | **중** (통합 자체는 기계적, 경계 케이스 검증이 일) |
| 폭발 반경 | 17개 파일 + 신설 `lib/utils/kst.ts`. 단 `lib/betman/daily-round.ts` 는 **베팅 회차 경계**라 별도 취급 필요 |

**계열 A — 수동 `+9h` 산술** (상수 철자만 4가지):

| # | 위치 | 철자 |
| --- | --- | --- |
| 1 | `lib/betman/daily-round.ts:22,:40,:115` | `9*60*60*1000` (한 파일 안에서 추가 오프셋이 `-8h`/`+1h`/`0` 로 각각 다름) |
| 2 | `app/api/admin/stats/route.ts:7-11` | `KST_OFFSET_MS` + `toKSTDate` |
| 3 | `app/api/betman/community-stats/route.ts:7-11` | **#2 와 바이트 동일** |
| 4 | `app/api/event/worldcup/report/route.ts:9,:101-103` | 같은 상수, 함수는 `toKSTDay` 로 인라인 |
| 5 | `app/admin/page.tsx:16-21` | `KST_OFFSET` (`_MS` 없음) |
| 6 | `app/explore/page.tsx:9-16` | `9 * 3_600_000` |
| 7 | `app/transfer/transfer-client.tsx:25-38` | `9 * 3600 * 1000` ×2 |
| 8 | `app/api/cron/discord-daily-digest/route.ts:31-36` | `formatKickoffKST` |
| 9 | `scripts/betman-sync.ts:217-222` | `toKSTISO` |
| 10 | `scripts/betman-fetch-games.ts:35-40` | **#9 와 바이트 동일** |
| 11 | `tests/e2e/setup/seed.ts:197` | 인라인 |

**계열 B — `Intl` timeZone** (계열 A 와 답이 다를 수 있음):

- `components/worldcup/worldcup-rules-modal.tsx:21-23` `todayKST()` → `toLocaleDateString("en-CA", {timeZone:"Asia/Seoul"})`
- `components/betting/betting-prediction-history.tsx:34-37` `getDateKey()` — **위와 본문 동일** (en-CA 트릭 2벌)
- `components/betting/betting-prediction-history.tsx:12-32` `formatDateLabel`
- `components/home/matchday-band.tsx:28-47` `fmtKstTime` + `fmtKstDate`
- `app/api/wisetoto/sync/route.ts:96-98`
- `app/admin/event/page.tsx:100`

**왜 고칠 가치가 있는가**: 계열 A 의 `.toISOString().slice(0,10)` 은 **미리 오프셋을 더해뒀기 때문에만** 맞는 값이다. 계열 B 는 그런 전제가 없다. 두 계열이 같은 앱 안에서 "오늘"을 계산하는데 — `app/transfer/transfer-client.tsx:29` 는 오프셋 시프트 후 `getUTC*`, `components/betting/betting-prediction-history.tsx:36` 은 `en-CA` — 한쪽 계열을 리팩토링하면 다른 쪽이 조용히 깨진다. 이미 메모리에 관련 사고 2건이 남아 있다 (일일 볼 이중 리셋 / betman 데일리 윈도우 8시 정각 규칙 과잉수정 후 롤백).

> ⚠️ **선행 조건**: 통합 전에 `lib/betman/daily-round.ts` 의 회차 경계 규칙(당일 08:00 초과 ~ 익일 08:00 이하, 전날 23:00 flip)을 **먼저 테스트로 고정**해야 한다. 이 파일만 테스트가 있고 나머지 16개는 없다. → `test-gaps.md` 와 교차 확인 권장.

---

### 4-3. 베팅 계산식 중복 — 배당 곱, 페이아웃, 적중률이 각각 갈라짐

| 항목 | 내용 |
| --- | --- |
| 난이도 | **상** (어느 쪽이 정답인지 제품 판단 필요) |
| 폭발 반경 | 6~8개 라우트 + `lib/betman/{settle,stats}.ts` |

**(a) 배당 곱 `acc * odds` — 5 구현, 기본값이 다름**

| 위치 | 미싱 배당 기본값 | 배당 출처 |
| --- | --- | --- |
| `hooks/use-betting-slip.ts:112` | `\|\| 1` | 클라이언트 |
| `app/api/betman/prediction/route.ts:385-389` | **`\|\| 0`** | 쓰기 경로 |
| `app/api/feed/predictions/route.ts:218-229` | `\|\| 1` | **live** `betman_games` |
| `app/api/predictions/my/route.ts:257-268` | `\|\| 1` | **live** — 위와 바이트 동일 복사 |
| `lib/betman/settle.ts:310-313` | `> 0 ? : 1` | **`locked_odds`** |

두 가지 발산: ① 쓰기 경로만 `0` 으로 폴백해서 `totalOdds` 가 0 으로 붕괴하고 읽기 경로는 1 로 폴백해 배당을 무시한다. ② 정산은 `locked_odds` 를 쓰는데 표시 경로 2개는 **실시간 배당**을 다시 읽는다 → 배당이 갱신되면 화면의 `totalOdds` 와 정산된 값이 어긋난다.

**(b) 페이아웃 `stake × odds` — 6 복사본**, 반올림이 제각각:
`lib/betman/settle.ts:326`(정본) · `lib/betman/stats.ts:136` · `app/api/admin/stats/route.ts:167` · `app/api/betman/community-stats/route.ts:197`(동일) · `app/api/event/worldcup/report/route.ts:78`(**반올림 없음**) · `app/api/predictions/my/route.ts:288`

**(c) 순손익 — 2가지 비호환 공식**:
`stake×odds − stake` (`app/api/feed/predictions/route.ts:232-237`, `lib/betman/stats.ts:153`) vs `stake×(odds−1)` (`app/worldcup/leaderboard/page.tsx:118`, `app/worldcup/result/page.tsx:150` — 이 둘은 12줄 바이트 동일). 대수적으로는 같지만 반올림이 달라 (`result/page.tsx:169` 는 `Math.round(x*10)/10`, 리더보드는 무반올림) **같은 유저의 손익이 두 페이지에서 다르게 표시된다.**

**(d) 적중률 — 5 복사본, 반올림 3종 + 집계 단위 2종**:
`lib/betman/stats.ts:152,:177`(pick 단위, 소수 2) · `app/api/admin/stats/route.ts:171` · `app/api/betman/community-stats/route.ts:201`(동일) · `app/api/event/worldcup/report/route.ts:90`(**slip 단위**) · `app/worldcup/result/page.tsx:171`(slip 단위, 소수 1) · `app/api/predictions/my/route.ts:432`(**무반올림**).

> 메모리에 이미 기록된 사안: "점수 모델 = 슬립 단위 net 손익 / points_earned=배당 함정". 즉 pick 단위 vs slip 단위 갈림은 **알려진 문제이며 아직 코드가 통일되지 않았다.**

**왜 고칠 가치가 있는가**: 돈이다. 표시값과 정산값이 다르면 유저 신뢰가 직접 깨지고, CS 로 들어왔을 때 어느 숫자가 옳은지 코드로 증명할 수 없다.

---

### 4-4. `profiles` + `user_equipped_titles` 작성자 붙이기 — 쿼리 5벌, 매핑 6벌이 갈라짐

| 항목 | 내용 |
| --- | --- |
| 규모 | 쿼리 복사 **5개**, 매핑 복사 **6개** |
| 난이도 | **중** |
| 폭발 반경 | 5~8개 파일 + 신설 `lib/authors/attach-authors.ts` |

동일한 `Promise.all([profiles.select("user_id, nickname, avatar_url"), user_equipped_titles.select("user_id, board_slug, adj_titles ( title, rarity ), noun_titles ( title )")])` 블록:

`app/page.tsx:59-65` · `app/community/[slug]/page.tsx:84-90` · `app/post/[id]/page.tsx:50-61`(단일 유저) · `app/api/posts/route.ts:213-218`(**`display_title_id` 추가 → 발산**) · `lib/comments/visible-comments.ts:85-89`

**매핑이 위험하게 갈라짐**:

| 위치 | `adj_titles` 언랩 | 맵 키 |
| --- | --- | --- |
| `app/community/[slug]/page.tsx:105-120` | `Array.isArray(x) ? x[0] : x` (방어적) | `${user_id}:${board_slug}` |
| `app/post/[id]/page.tsx:63-92` | 방어적 | — |
| `hooks/use-feed.ts:73,80-86` | **객체 가정** (`equipped.adj_titles?.title`) | `${user_id}:${board_slug}` |
| `lib/utils/comments.ts:44-53` | **객체 가정** | **`user_id` 만** ("첫 호칭 승") |

두 가지 결과: ① PostgREST 가 배열을 돌려주면 방어 없는 2곳은 조용히 `null` 을 렌더한다. ② 게시판별 호칭이 **글에는 나오고 댓글에는 안 나온다** — `lib/utils/comments.ts:45` 가 `board_slug` 를 키에서 빼먹었기 때문. 이건 지금 살아 있는 버그일 가능성이 높다.

> 참고로 `lib/admin/attach-nicknames.ts:10` 은 **제대로 중앙화돼 있다** (5 호출부, 복사본 0). 같은 팀이 같은 문제를 한 번은 옳게 풀었다 — 그 패턴을 여기에도 적용하면 된다.

---

### 4-5. 드래프트 보드 복제

| 항목 | 내용 |
| --- | --- |
| 파일 | `components/draft/draft-board.tsx` (757) ↔ `components/draft/multi-draft-board.tsx` (764) |
| 규모 | 공백 무시 시 **동일 라인 240개, 그중 25자 초과 유의미 라인 96개** |
| 난이도 | **중** |
| 폭발 반경 | 2개 파일 + 신설 공용 조각 |

복제된 것: 선수 풀 필터/정렬 UI (`SortKey` 배열, `filteredPool.length/poolCounts.ALL`), `draft-eyebrow` 칩 스타일 블록, `PitchViz` 래퍼, 인라인 스타일 상수(`border: "1px solid var(--draft-line)"` 류).

---

### 4-6. 그 밖의 중복 (묶음)

| 클러스터 | 복사 수 | 정본 | 발산 |
| --- | --- | --- | --- |
| "최근 댓글 달린 글" 사이드바 쿼리 | **3** (`app/page.tsx:93`, `app/community/[slug]/page.tsx:344`, `app/prediction/page.tsx:37`) | 없음 | 동일 |
| 어드민 페이지 ↔ 어드민 API 쿼리 쌍 | **2쌍** (`admin/content/posts` , `admin/content/comments`) | 없음 | `.range` 만 다름 |
| `.is("deleted_at", null)` | **39회 / 28파일** | 없음 (뷰/헬퍼 부재) | `app/api/admin/content/posts/route.ts:38` 만 조건부 |
| 1000행 페이징 루프 | **4** (`app/worldcup/result/page.tsx:131`, `app/api/event/worldcup/report/route.ts:48`, `lib/betman/settle-sweep.ts:63`, `scripts/backfill-unsettled-results.ts:110,:290`) | 없음 | 정렬 키가 `id` vs `created_at` |
| `formatRelativeTime` 포크 | **3 + 인라인 4** | `lib/utils/date.ts:4` (테스트 있음) | `app/design-preview/page.tsx:21`·`components/news-talk/ticker-detail-panel.tsx:27` 둘 다 **7일 컷오프 없음** → `"400일 전"` 렌더. `"방금"` vs `"방금 전"` |
| `formatKoreanTime` 우회 ko-KR 포맷 | **15** (어드민 11 + `components/battle/battle-types.ts:90` 등) | `lib/utils/date.ts:19` | 대부분 동일 |
| 페이지네이션 `.range(offset, offset+limit-1)` | **~20**, clamp 정책 **6종** | 없음 | **5개 라우트는 clamp 없음** — `app/api/users/experts/route.ts:21`, `app/api/bookmarks/route.ts:28`, `app/api/rankings/route.ts:23`, 어드민 `content/*` → `?limit=999999` DoS 여지 |
| 숫자 축약 | **3종** (`formatCount`/`formatMemberCount` 둘 다 죽음, `formatBalls` 만 살아있음) | 없음 | 1000–9999 구간 답이 다름 |
| `.toLocaleString()` 생짜 | **78회 / 34파일** | 래퍼 없음 | — |

---

## 5. 타입 구멍

### 5-1. 🚨 근본 원인: Supabase 클라이언트에 `<Database>` 제네릭이 **한 곳도** 안 붙어 있다

| 항목 | 내용 |
| --- | --- |
| 파일 | `lib/supabase/client.ts:17,:34,:41,:62` · `lib/supabase/server.ts:16,:24,:60` · `lib/supabase/admin.ts` |
| 규모 | `grep -rn "createClient<Database>\|SupabaseClient<Database>"` → **0건** |
| 난이도 | **상** (한 줄 바꾸면 수백 개 타입 에러가 한꺼번에 뜬다) |
| 폭발 반경 | **전 리포** — `.from()` 을 쓰는 모든 파일 |

```ts
// lib/supabase/server.ts:24
export function createAnonClient() {
  return createSupabaseClient(          // ← <Database> 없음
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
}
```

결과: 모든 `.from("posts").select(...)` 결과가 사실상 무타입이다. `strict: true` 를 켜놓고도 DB 레이어 전체가 타입 사각지대다.

**이게 아래 두 증상의 원인이다**:
1. **`as unknown as` 29회** (`node_modules` 제외 실측). 전부 "무타입 쿼리 결과를 억지로 형태 지정"하는 패턴이다:
   ```
   app/api/profile/[userId]/route.ts:131,:156,:191,:211,:243,:244   ← 한 파일에 6회
   app/api/predictions/my/route.ts:149,:229,:230,:231
   lib/comments/visible-comments.ts:77,:95
   app/page.tsx:70
   lib/betman/stats.ts:102
   app/api/bookmarks/route.ts:68,:84
   ```
2. **4-4 의 `adj_titles` 배열-vs-객체 발산**. PostgREST 임베드가 배열인지 객체인지 타입이 말해줬다면 애초에 안 갈렸을 문제다. `as unknown as` 로 덮은 4곳 중 2곳이 틀린 가정을 하고 있다.

**왜 고칠 가치가 있는가**: 이건 리포에서 가장 값비싼 단일 결함이다. 9,100줄짜리 타입 정의를 이미 **두 벌** 생성해놓고 **한 번도 연결하지 않았다.** 컬럼명 오타가 컴파일에서 안 잡히고 런타임에 터진다 — 메모리의 "Postgres 44% 에러율 = `posts.latest_comment_at` 오타(실제 `last_comment_at`)" 사고가 정확히 이 구멍으로 들어온 사고다. 제네릭이 붙어 있었다면 `tsc` 에서 잡혔다.

**단계적 접근 권고** (한 번에 하면 확실히 실패한다):
1. `lib/supabase/types.ts` 삭제 (→ 1-1, **난이도 하**)
2. `mcp__supabase__generate_typescript_types` 로 `database.types.ts` 갱신 → 현재 스키마와 일치 확인
3. **`lib/supabase/admin.ts` 한 곳에만** `<Database>` 부착 → 터지는 에러 수 계측 → 실측 후 범위 판단
4. 그 다음 `server.ts`, 마지막에 `client.ts`

### 5-2. `any` 는 실질적으로 없다

`app/`·`components/`·`lib/`·`hooks/`·`types/` 전역에서 명시적 `any` 는 손에 꼽는다 (`lib/tiptap/extensions/embed-paste.ts`, `components/editor/tiptap-content.tsx`, `app/api/posts/route.ts`, `app/api/posts/[id]/route.ts`, `app/api/admin/content/notices/route.ts` 각 1회). 나머지 `any` 는 `tests/e2e/helpers/auth.ts:37,:59` 의 `window.Clerk` 캐스팅으로, 테스트 코드다.

**즉 이 리포의 타입 문제는 `any` 남용이 아니라 5-1 한 가지다.** `any` 사냥은 하지 말 것 — 투자 대비 회수가 없다.

---

## 6. 일관성 붕괴

### 6-1. 🚨 service-role 클라이언트가 기본값이 돼버림 (168 vs 34)

| 항목 | 내용 |
| --- | --- |
| 규모 | `createServiceRoleClient` **168 파일** vs `createAnonClient` **34 파일** |
| 난이도 | **중** (개별 판단 필요, 기계적 치환 불가) |
| 폭발 반경 | 사례별 1파일씩 — 점진 가능 |

`lib/supabase/server.ts` 는 두 팩토리를 **같은 모듈에서** 내보내고, service-role 쪽에는 `⚠️ WARNING: This client bypasses all RLS policies!` 주석이 붙어 있다. 그런데 실제로는 그쪽이 기본 선택이 됐다.

**RSC 안에서 RLS 를 우회해 공개 페이지를 렌더하는 곳 — 11사이트 / 8파일**:
`app/snack/page.tsx:22` · `app/transfer/page.tsx:14` · `app/worldcup/{page:54, games/page:32, leaderboard/page:58, register/page:26, result/page:65}` · `app/games/draft/epl/room/[id]/{page:37,:70, play:46, result:47}`

**대조군**: `app/page.tsx:3`, `app/explore/page.tsx:1`, `app/prediction/page.tsx:3` 은 **동등한 공개 피드를 `createAnonClient` 로** 렌더한다. snack/transfer/worldcup 이 service-role 이어야 할 이유가 코드 어디에도 없다.

**인증 불필요 공개 GET 라우트에서의 service-role — 11건**:
`app/api/community/popular/route.ts:12` · `lounge/config:14` · `standings:27` · `polls/active:18` · `stadiums/map:29` · `stadiums/[teamId]/leaderboard:19` · `transfer/feed:14` · `feed/snack:15` · `minigames/leaderboard:22` · `metaverse/avatar/shop:9` · `news/correction-examples:25`

**팩토리를 통째로 우회한 곳 — 1건 (가장 위험)**:
```ts
// app/api/betman/community-stats/route.ts:16-19
createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
```
`lib/supabase/server.ts:60-63` 의 env 검증 가드를 건너뛴다. `app/**` 유일 사례. (`lib/middleware/onboarding-guard.ts:48` 도 env 를 직접 읽지만 미들웨어라 별개 판단)

**왜 고칠 가치가 있는가**: RLS 는 이 앱의 유일한 DB 레벨 방어선인데, 168개 파일이 그걸 우회하고 있고 **어느 것이 정당한 우회인지 구분할 방법이 없다.** import 문만 봐서는 `createAnonClient` 와 `createServiceRoleClient` 가 똑같이 생겼다. 최소한 service-role 을 별도 모듈(`lib/supabase/service-role.ts`)로 분리하면 import 경로만으로 감사(audit)가 가능해진다.

> ✅ 참고: `@/lib/supabase/admin` 을 import 하는 7개 파일은 전부 `requireAdmin`(인증 체크)만 가져온다. **raw 클라이언트 유출은 없다** — 이 경로는 깨끗하다.

---

### 6-2. API 에러 응답 — 헬퍼는 있는데 절반만 적용됨. **500 63건이 Sentry 에 안 잡힌다**

| 항목 | 내용 |
| --- | --- |
| 규모 | 187개 라우트 중 헬퍼 import **155(83%)**. 그런데 raw `NextResponse.json({error})` 가 **243사이트 / 81파일** |
| 난이도 | **하** (기계적 치환) |
| 폭발 반경 | 파일별 독립 — 한 파일씩 쪼개서 커밋 가능 |

`lib/api-error.ts:13` 의 `apiError(msg, status, err)` 는 **`Sentry.captureException` 을 호출한다.** raw 버전은 안 한다.

```
raw {error} + status 500 (한 줄 형태)      63건
raw {error} + status 500 (여러 줄 형태 포함) 77건
```

해당 파일에 **돈 경로가 포함된다**: `app/api/gold/reward/route.ts` · `app/api/admin/refunds/route.ts` · `app/api/betman/prediction/route.ts` · `app/api/metaverse/avatar/purchase/route.ts` · `app/api/admin/users/[userId]/adjust-economy/route.ts` · `app/api/betman/{expire-pending,games,my-stats,rankings,stats/recalculate,sync-state}` · 크론 3종.

**왜 고칠 가치가 있는가**: 관측 구멍이다. 미관 문제가 아니다. 골드 지급이 500 으로 실패해도 Sentry 에 아무것도 안 뜬다. 메모리에 "Sentry 클라이언트 꺼져있음 — 서버/edge 만 캡처"가 기록돼 있는데, **서버조차 63곳이 새고 있다.**

**섞인 스타일 최악 파일**: `app/api/profile/me/route.ts` (raw 15) · `app/api/betman/prediction/route.ts` (13) · `app/api/og/route.ts` (12) · `app/api/metaverse/reports/route.ts` (8) · `app/api/upload/image/route.ts` (7) · `app/api/draft-rooms/[id]/pick/route.ts` (7)

**헬퍼를 아예 안 쓰는 17개 파일**은 하나의 섬을 이룬다: agg/news/polls 클러스터 (`admin/agg-review`, `admin/agg-training`, `admin/news-review`, `admin/content/banners{,/[id]}`) + 메타버스 6종 (`metaverse/{activity-balance/me,avatar/equip,avatar/me,avatar/purchase,avatar/shop,plots}`) + `news/agent-draft` + `topic-share` + `banners` + 크론 3종.

**응답 봉투 5종**: `{error}`(지배적) · `{success:true}`(34파일) · `{ok:true}`(14파일, agg/news/cron 클러스터) · `{ok:false,error}`(1건, `cron/news-expire-drafts:43`) · `{message}`(`draft-rooms/[id]/chat:84,:123`). 상태 코드는 16종이 쓰이고 있고 검증 실패에 400(118회)과 422(6회)가 원칙 없이 섞인다.

---

### 6-3. 어드민 가드 2벌 — 한쪽은 403, 한쪽은 **500**

| 항목 | 내용 |
| --- | --- |
| 파일 | `lib/admin/require-admin-api.ts:14` (`NextResponse` 반환, 50 호출부/33 라우트) vs `lib/supabase/admin.ts:37` (**throw**, 10 호출부) |
| 규모 | 같은 8줄이 두 벌. `profiles.select("role")` 쿼리도 각각 |
| 난이도 | **하** (throw 쪽 8개 라우트를 `requireAdminApi` 로 교체) |
| 폭발 반경 | **8개 라우트 파일** + `lib/supabase/admin.ts`. 단 `app/admin/layout.tsx:13` 과 `app/admin/event/actions.ts:14,:40` 은 RSC/서버액션이라 throw 가 적절 — **그 3곳은 남겨야 한다** |

```
requireAdmin (throw → 500)  : app/api/admin/news-review/route.ts:49
                              app/api/admin/agg-training/route.ts:26
                              app/api/admin/agg-review/route.ts:43
                              app/api/admin/polls/route.ts:21
                              app/api/admin/polls/[id]/route.ts:16,:52
requireAdminApi (→ 403)     : 나머지 33개 라우트
```

즉 **비관리자가 `/api/admin/polls` 를 치면 500 이 뜬다.** 다른 어드민 라우트는 403 이다. 세 번째 변종 `lib/middleware/admin-guard.ts:16` 은 `userId != null` 만 보고 **role 을 아예 안 본다** (미들웨어 계층이라 의도된 것일 수 있으나 명시 필요).

**추가 관측**: throw 를 쓰는 라우트 집합 = 6-2 에서 `lib/api-error` 를 안 쓰는 집합과 **정확히 일치한다.** agg/news/polls 클러스터가 자기들만의 규약을 가진 섬이다. 한 번에 정리하면 두 문제가 같이 풀린다.

---

### 6-4. 401 보일러플레이트 19벌 + 에러 문자열 2종

| 항목 | 내용 |
| --- | --- |
| 규모 | `apiUnauthorized()` 65 호출부. 그런데 손으로 쓴 복사본 **19개** |
| 난이도 | **하** |
| 폭발 반경 | 19개 라우트 파일, 서로 독립 |

- 한국어 `{error:"로그인이 필요합니다."}, {status:401}` **11벌**: `upload/video:21` · `upload/image:183` · `gold/reward:33` · `flair-prefs:42` · `event/worldcup/register:31` · `betman/prediction:45,:583` · `posts:267` · `profile/me:60,:111,:307`
- 영어 `{error:"unauthorized"}` **8벌** (전부 메타버스): `metaverse/{activity-balance/me:15, reports:36, chat-rooms:25, chat-rooms/[id]:20, chat-rooms/[id]/touch:22, avatar/me:13, avatar/equip:13, avatar/purchase:13}`

**왜 고칠 가치가 있는가**: `res.error` 를 파싱하는 클라이언트가 라우트에 따라 `"로그인이 필요합니다."` 또는 `"unauthorized"` 를 받는다. 토스트에 `"unauthorized"` 가 그대로 뜨는 경로가 8개 있다는 뜻이다.

---

### 6-5. 데이터 페칭 전략 4갈래 — 형제 화면끼리 갈림

| 항목 | 내용 |
| --- | --- |
| 난이도 | **상** (제품/성능 판단) |
| 폭발 반경 | 큼 |

| 피드 화면 | 서버 셸 | 클라이언트 페이징 |
| --- | --- | --- |
| 홈 `app/page.tsx` | `createAnonClient` | SWR Infinite (`hooks/use-feed.ts:179`) |
| 탐색 `app/explore/page.tsx` | `createAnonClient` | SWR (`explore-content.tsx:18`) |
| 이적 `app/transfer/page.tsx` | `createServiceRoleClient` | SWR (`transfer-client.tsx:6`) |
| **떡밥 `app/snack/page.tsx`** | `createServiceRoleClient` | **useEffect + fetch** (`snack-client.tsx:63`) |
| **카드뉴스** | lib 헬퍼 | **useEffect + fetch** (`card-news-feed.tsx:696`) |
| **커뮤니티 `app/community/[slug]`** | `createServerAnonClient` (**세 번째 import 경로**) | **useEffect + fetch** (`community-content.tsx:100,:102`) |

베팅 훅 5개도 3갈래다: `use-betting-matches.ts:31`·`use-betting-mypage.ts:54` = SWR / `use-betting-rankings.ts:88`·`use-betting-community-stats.ts:43` = useEffect+fetch / `use-betting-slip.ts` = `useSWRConfig` mutate 만 쓰고 읽기는 raw fetch.

**import 경로도 3벌**: `@/lib/supabase/server` (191파일) vs `@/lib/supabase` → `createServerAnonClient` (5파일, `lib/supabase/index.ts` 가 같은 함수를 다른 이름으로 재수출) vs 직접 `createClient`(1건).

**공유 fetcher 우회 5건**: `lib/swr.ts:1` `fetcher` 를 40파일이 쓰는데, `components/profile/settings/fan-identity-section.tsx:38` 과 `components/stadium/contributors-leaderboard.tsx:30` 은 **서로 동일한** 인라인 fetcher 를 각자 정의했고 **둘 다 `.ok` 체크가 없다** (공유 fetcher 는 non-ok 에 throw). `components/post-card/post-card-content.tsx:538` 과 `components/editor/embed-card.tsx:201` 은 **같은 `/api/oembed` 호출**에 대해 독립 작성된 fetcher 2벌 + 서로 다른 `dedupingInterval`.

---

### 6-6. 클라이언트 에러 리포팅 — 헬퍼가 게시글 도메인에서만 쓰임

| 항목 | 내용 |
| --- | --- |
| 규모 | `reportClientError` (`lib/client-error.ts:13`) = **14 호출부 / 7파일**, 전부 post+comment 도메인 |
| 난이도 | **하** |
| 폭발 반경 | 13개 파일, 서로 독립 |

생짜 `console.error` **19사이트 / 13파일** — Sentry 도 토스트도 없다:
`hooks/use-betting-slip.ts`(×3) · `hooks/use-betting-rankings.ts`(×3) · `components/profile/my-profile-settings.tsx`(×3) · `hooks/use-stadium-chat.ts` · `components/metaverse/{side-scroller-demo,report-user-dialog,lounge-room,highbury-stage}.tsx` · `app/community/[slug]/page.tsx`

에러 바운더리 4개(`app/error.tsx`, `app/global-error.tsx`, `app/stadium/error.tsx`, `app/shop/error.tsx`)도 전부 `console.error` 직행이다.

**왜 고칠 가치가 있는가**: 메타버스 + 베팅 + 스타디움 클라이언트 표면 전체가 **에러를 아무 데도 보고하지 않는다.** 메모리의 "Sentry 클라이언트 꺼져있음"과 겹쳐서, 이 영역은 관측이 완전히 0이다.

---

### 6-7. 잔가지 일관성 이슈

| 이슈 | 규모 | 비고 |
| --- | --- | --- |
| `window.confirm` | **14사이트 / 12파일** | `components/ui/alert-dialog.tsx` 가 이미 있는데 안 씀. `hooks/use-comment-actions.ts`, `hooks/use-post-card-actions.ts`, 어드민 6파일 등 |
| `useAlertModal` | 소비자 **1개** (`hooks/use-betting-slip.ts:10`) | 토스트와 병존하는 커스텀 모달 시스템. 통합 or 제거 |
| 인라인 `style={{}}` | **1,534회 / 363 tsx** | Tailwind 4 리포인데 CSS-in-JS 스타일. 최다: `design-preview/preview-client.tsx`(72), `draft/multi-draft-result.tsx`(62), `draft/draft-board.tsx`(62). **폭발 반경이 너무 커서 스프린트 재료로는 부적합** — 신규 코드 규칙으로만 다룰 것 |
| 토스트 시스템 | **1개** (Radix, 46파일/126 호출부) | ✅ 이 축은 수렴돼 있음 |

---

## 7. 즉시 착수 가능 목록 (난이도 하 + 폭발 반경 작음)

첫 스프린트 재료. **위에서 아래로 그대로 진행 가능하며, 서로 충돌하지 않는다.**

| # | 작업 | 위치 | 규모 | 폭발 반경 | 검증 방법 |
| --- | --- | --- | --- | --- | --- |
| 1 | `data/agent-test/node_modules/` git 추적 해제 + `.gitignore:99` 아래 한 줄 추가 | `.gitignore` | 추적 파일 −2,410 / −21MB | **소스 0파일** | `git ls-files data/agent-test \| wc -l` → 12 |
| 2 | `lib/supabase/types.ts` 삭제 + `knip.json:ignore` 에서 해당 줄 제거 | `lib/supabase/types.ts` | −2,647줄 | **0파일** (importer 0 확인됨) | `pnpm exec tsc --noEmit` |
| 3 | raw 500 응답 → `apiError(msg, 500, error)` 치환 | `app/api/**` **63사이트 / 25파일** | Sentry 사각 63곳 제거 | 파일별 독립, 한 파일씩 커밋 가능 | `grep -rn "NextResponse.json({ error.*status: 500" app/api \| wc -l` → 0 |
| 4 | 손으로 쓴 401 → `apiUnauthorized()` 치환 | **19사이트 / 19파일** (한국어 11 + 메타버스 영어 8) | 에러 문자열 1종으로 통일 | 라우트별 독립 | `grep -rn '"unauthorized"' app/api` → 0 |
| 5 | 어드민 API 5파일의 throw 형 `requireAdmin` → `requireAdminApi` 교체 | `admin/{news-review,agg-training,agg-review,polls,polls/[id]}` | 비관리자 응답 500→403 | **5파일**. `app/admin/layout.tsx`·`event/actions.ts` 는 **건드리지 말 것**(RSC/서버액션은 throw 가 맞음) | 비로그인으로 `/api/admin/polls` GET → 403 |
| 6 | 인라인 SWR fetcher 2개를 `@/lib/swr` 의 `fetcher` 로 교체 | `profile/settings/fan-identity-section.tsx:38`, `stadium/contributors-leaderboard.tsx:30` | non-ok 무시 버그 2곳 제거 | **2파일** | 두 화면 로드 확인 |
| 7 | `formatRelativeTime` 포크 2개 → `lib/utils/date.ts:4` 로 교체 | `app/design-preview/page.tsx:21`, `components/news-talk/ticker-detail-panel.tsx:27` | `"400일 전"` 렌더 버그 제거 | **2파일** | 7일 초과 항목이 `"2월 23일"` 로 뜨는지 |
| 8 | `lib/utils/format.ts` 처리 — 삭제하거나 `formatBalls`(`stats-tab.tsx:22`)를 여기로 통합 | `lib/utils/format.ts` + 테스트 | 죽은 코드 15줄 or 중복 1종 제거 | **2~3파일** | `pnpm vitest run __tests__/lib/utils/format.test.ts` |
| 9 | `components/home/content-section.tsx` 삭제 | 184줄 | importer 0 (`home/*` 8개 중 유일) | **1파일** | ⚠️ 제품 소유자에게 "봉인된 기능인지" 1회 확인 후 |
| 10 | 페이지네이션 `limit` clamp 없는 5개 라우트에 clamp 추가 | `users/experts:21`, `bookmarks:28`, `rankings:23`, 어드민 `content/*` | DoS 여지 제거 | **5파일**, 기존 clamp 패턴 복사 | `?limit=999999` → 상한값 반환 |
| 11 | `app/design-demo/` 에 `robots: { index: false }` 추가 (`design-preview` 와 동일) | `app/design-demo/layout.tsx` | 데모 페이지 색인 차단 | **1파일** | — |
| 12 | `app/api/betman/community-stats/route.ts:16-19` 의 직접 `createClient` → `createServiceRoleClient()` | 1블록 | env 검증 가드 복구 | **1파일** | 라우트 200 응답 |

### 착수 순서 권고

**1일차**: #1, #2, #11 (순수 삭제/설정, 리스크 0)
**2일차**: #3, #4 (기계적 치환 82사이트 — 파일별로 커밋 쪼개기)
**3일차**: #5, #6, #7, #12 (소규모 동작 변경 — 각각 수동 확인 1회씩)
**보류**: #8, #9, #10 은 제품 판단 1회씩 필요

### 이 목록에 **넣지 않은** 것과 그 이유

| 항목 | 제외 사유 |
| --- | --- |
| knip "unused exports" 15건 `export` 제거 | 런타임 영향 0, 버그 방지 0. **투자 대비 회수 없음** |
| `gold-balance.tsx`, `worldcup-recap-board.tsx` 삭제 | 주석으로 봉인된 미출시 기능. 지우면 복원 불가 |
| `<Database>` 제네릭 부착 (5-1) | 폭발 반경 = 전 리포. 스프린트 2 이상에서 단계적으로 |
| KST 통합 (4-2) | 17구현, 회차 경계 테스트가 선행돼야 함 |
| `admin/stats` ↔ `community-stats` 통합 (4-1) | 4곳이 이미 갈라져 있어 "어느 쪽이 정답인가" 제품 판단 필요 |
| 인라인 `style={{}}` 1,534회 | 폭발 반경 과대. 신규 코드 규칙으로만 |
| 거대 파일 분할 (3-1 ~ 3-3) | 난이도 중~상 |

### 조사 중 확인된 함정 (다음 사람을 위해)

- **API 라우트 orphan 자동 검출은 실패한다.** `next.config.mjs:167` 이 `/api/sports/*` → `/api/betman/*`, `/api/live-scores/*` → `/api/wisetoto/*` 로 리라이트하고, 크론 라우트는 `vercel.json` 에만 등록돼 있다. URL 문자열 grep 으로 "아무도 안 부르는 라우트"를 찾으면 betman 전체 + 크론 전체가 오탐으로 잡힌다.
- **knip 결과를 그대로 믿지 말 것.** unused files 4건 중 3건이 "주석 봉인" 오탐이었고(1-4), 반대로 `lib/utils/format.ts` 는 테스트에 가려 검출되지 않았다(1-2). `knip.json:ignore` 의 9개 항목은 knip 을 영구히 침묵시키므로 별도 수동 점검이 필요하다(1-1, 1-6).
- **`data/agent-test/**` 는 타입체크에는 안 잡히지만 grep 에는 잡힌다.** 이 리포에서 전역 검색할 때는 `--glob '!data/agent-test'` 를 붙이는 편이 낫다 (#1 을 처리하면 해소).

# Phase 1 감사 노트 — 커뮤니티 코어 (2026-08-08)

범위: 게시글/댓글/투표/게시판/플레어/온도/조회수/알림/폴. 모든 근거는 `상대경로:라인`.

---

## 1. 핵심 플로우

### (a) 홈 피드 렌더

| 단계 | 파일:라인 | 테이블/비고 |
|---|---|---|
| RSC ISR 300s + 8개 병렬 프리페치 (피드·카테고리·최근댓글·공지·이벤트·카드뉴스·히어로·경기) | `app/page.tsx:11,32-149` | posts, categories, events, user_equipped_titles, profiles |
| 새 글/수정/삭제 시 on-demand revalidate | `app/api/posts/route.ts:376`, `app/api/posts/[id]/route.ts:148,192` | `revalidatePath("/")` |
| 클라 하이드레이션 → HomeClient → useFeed (SWR infinite) | `components/home/home-client.tsx`, `hooks/use-feed.ts:179-189` | `/api/posts` 재호출 |
| /api/posts GET — anon client, CDN `s-maxage=60, swr=180` | `app/api/posts/route.ts:61-247` | posts, categories(is_active), post_flairs, profiles, user_equipped_titles, flair_titles |
| 말머리 개인화: prefs를 URL 파라미터로 전달(CDN 캐시 조합 유지), UUID regex로 injection 방어 | `app/api/posts/route.ts:71-77,160-164`, `hooks/use-feed.ts:134-145` | user_flair_prefs (`/api/flair-prefs` 경유) |

- SSR 피드는 sort 반영해 생성(`app/page.tsx:51-54`)하지만, SWR `fallbackData`는 **hot 정렬일 때만** 사용(`hooks/use-feed.ts:149-155`). 기본 정렬은 new(`app/page.tsx:196-198`) → new에서는 SSR 데이터가 SWR 캐시로 안 들어가고 `use-feed.ts:197`의 임시 렌더 폴백으로만 쓰인 뒤 항상 재fetch. use-feed 주석("initialFeed는 항상 온도순")과 현 기본값이 드리프트.

### (b) 글 작성 (에디터 → sanitize → 저장)

| 단계 | 파일:라인 | 테이블 |
|---|---|---|
| /write 페이지(클라) + TipTap 에디터 | `app/write/page.tsx`(558줄), `components/editor/tiptap-editor.tsx` | — |
| 제출: 커버 이미지 업로드/외부 URL 재호스팅 → POST /api/posts | `hooks/use-write-submit.ts:44-105` | — |
| zod 검증 (제목 200자, 본문 100KB, source_url http(s)만) | `app/api/posts/route.ts:18-49` | — |
| TipTap JSON 노드/속성 whitelist sanitize (저장형 XSS 방어) | `lib/tiptap/sanitize.ts:243-247`, embed html은 `lib/sanitize-embed.ts:22-52` 재검증 | — |
| 이미지 URL 도메인 검증 → service role insert | `app/api/posts/route.ts:319-352` | posts |
| DB 트리거: 온도 초기부스트·category_id 동기화·flair 점수 +10·유저 카운트 | prod_schema `9000,8976,8968,9032` | posts, user_flair_scores |
| 후처리: 포인트 적립(비동기)·revalidatePath·퍼널 원장 | `app/api/posts/route.ts:360-383` | user_points, user_acquisition |

- 수정(PATCH)도 sanitize 동일 적용(`app/api/posts/[id]/route.ts:112-120`). 본문 첫 이미지 → 썸네일 추출(`:124-128`).

### (c) 댓글/투표 → 플레어 점수 트리거

댓글: `app/api/comments/route.ts:61-252` — 쿨다운 RPC(`can_post_comment`, :106) → insert(:124-134) → fire-and-forget으로 포인트+팀카르마(:156-184), 알림(:186-227), 쿨다운 갱신(:233), 사가 스탠스(:241).

투표: `app/api/posts/[id]/vote/route.ts:15-144` — 토글 3분기(취소/변경/신규), `app/api/comments/[id]/vote/route.ts:12-121` 동일 패턴.

| DB 트리거 (prod_schema) | 이벤트 | 효과 |
|---|---|---|
| `posts_flair_score` :8968 → `trg_posts_flair_score` :3719-3751 | posts I/U/D | 글 ±10, soft delete·복원·flair 변경 모두 처리 |
| `comments_flair_score` :8936 → :3681-3713 | comments I/U/D | 댓글 ±1 (글의 flair_id 기준) |
| `votes_flair_score` :9104 → :3796-3829 | post_votes I/U/D | up 받은 **글쓴이** ±1, 자추 제외(:3806) |
| `update_post_comment_count` :9072 → :4092-4104 | comments INSERT / DELETE / UPDATE OF deleted_at | comment_count ±1 |
| `trg_update_last_comment_at(+soft_delete)` :9024,9028 | comments | posts.last_comment_at = MAX(미삭제) |
| `trg_post_vote_count` :9004 + `trg_sync_post_vote_count` :9016 | post_votes | ⚠️ 아래 냄새 #1 — 같은 이벤트에 상충하는 2중 트리거 |
| 온도 계열 :8992,9036,9040,9044 | comments/post_votes | `enqueue_temperature_update` → pg_cron 매분 처리 |

### (d) 조회수 집계

| 단계 | 파일:라인 |
|---|---|
| 상세 마운트 시 비콘 1회 | `components/post-detail/post-detail-content.tsx:86` → `hooks/use-post-view-tracker.ts:22-27` |
| POST /api/posts/[id]/view — IP SHA-256 해시, 로그인 시 user_id 병기 | `app/api/posts/[id]/view/route.ts:14-59` |
| RPC `increment_post_view_count(uuid,text,text)` — 1시간 dedupe, anon 직접 grant(의도됨) | `supabase/migrations/20260802_post_views_user_id.sql:28-64` (post_views, posts.view_count) |
| 별도 "읽음" 계측: 가시 상태 15초 체류 → GA `post_read` (조회≠읽기 분리) | `hooks/use-post-view-tracker.ts:29-74` |

### (e) 알림 생성·소비

| 단계 | 파일:라인 | 비고 |
|---|---|---|
| 생성: 댓글→글쓴이(`comment`), 대댓글→원댓글 작성자(`reply`). 자기 자신 제외. fire-and-forget | `app/api/comments/route.ts:186-227` | notifications insert |
| 일반 글 팔로우 알림은 의도적 비활성 (기자 도입 후 복원) | `app/api/posts/route.ts:370-372` 주석 | — |
| 소비: 헤더 드롭다운 — 뱃지는 `count_only=true` SWR, 목록은 열 때 fetch, 읽음은 PATCH | `components/header/notification-dropdown.tsx:38,60,86,104` | — |
| API: GET(목록+actor 프로필+글 제목 수동 조인), PATCH(단건/전체 읽음) | `app/api/notifications/route.ts:16-162` | service role |

### (보너스) 폴

- `GET /api/polls/active` — service role, 활성 폴≤3 + 전체 투표 로드 후 **메모리 집계**, `no-store` (`app/api/polls/active/route.ts:19-82`). VS 쟁점 폴(post_id 연결)은 제외(:27).
- `POST /api/polls/[id]/vote` — option key 검증 → upsert(유저당 1표, 재투표=갱신) (`app/api/polls/[id]/vote/route.ts:38-57`).
- 위젯: `components/sidebar/poll-widget.tsx:33` (수동 fetch). VS 쟁점 폴은 `components/post-detail/vs-issue-widget.tsx` + `lib/news/vs-issue`.

---

## 2. 핵심 파일

| 파일 | 줄수 | 책임 | 비고 |
|---|---|---|---|
| `components/post-card/post-card-content.tsx` | 1,050 | 피드 카드 본문 렌더 | 🔴 갓파일 후보 (500+ 유일한 컴포넌트급 초과) |
| `components/editor/embed-card.tsx` | 607 | 임베드(YT/IG/X) 카드 | 🟡 |
| `app/write/page.tsx` | 558 | 글쓰기 페이지 | 🟡 (훅 5개로 로직 분리는 되어 있음: use-write-*) |
| `components/home/matchday-band.tsx` | 532 | 오늘의 경기 밴드 | 🟡 |
| `app/community/[slug]/page.tsx` | 472 | 게시판 RSC | |
| `components/post-detail/post-detail-content.tsx` | 412 | 상세 클라 컨테이너 | |
| `app/api/posts/route.ts` | 389 | 피드 GET + 글 POST | |
| `components/editor/tiptap-editor.tsx` | 373 | 에디터 셋업 | |
| `components/home/home-client.tsx` | 338 | 홈 클라 셸 | |
| `app/post/[id]/page.tsx` | 322 | 상세 RSC + 메타 | |
| `hooks/use-feed.ts` / `hooks/use-comments.ts` | 247 / 220 | 피드/댓글 상태 | |
| `lib/tiptap/sanitize.ts` | 247 | TipTap whitelist sanitizer | 양호 — pure, whitelist 방식 |
| `lib/comments/visible-comments.ts` | 97 | 비밀댓글 필터 단일 출처 | 양호 — SSR/API 공유 |

## 3. 테이블 읽기/쓰기 맵

| 테이블 | 읽는 곳 (대표) | 쓰는 곳 (대표) |
|---|---|---|
| posts | `app/page.tsx:44-55`, `app/api/posts/route.ts:123-190`, `app/post/[id]/page.tsx:23-45`, `app/community/[slug]/page.tsx:38-73` | insert `app/api/posts/route.ts:337-352`, update/soft-delete `app/api/posts/[id]/route.ts:135-140,181-184`, 카운트류는 전부 DB 트리거 |
| comments | `lib/comments/visible-comments.ts:42-51` (SSR·API 공유) | insert `app/api/comments/route.ts:124-134`, edit/soft-delete `app/api/comments/[id]/route.ts:65-70,117-120` |
| post_votes | `app/api/posts/[id]/vote/route.ts:49-54(중복확인),164-169(GET, anon)` | 같은 파일 :69-103 (insert/update/delete) |
| comment_votes | `app/api/comments/[id]/vote/route.ts:39-44` | 같은 파일 :53-73 |
| categories | `app/page.tsx:39-43,83-90`, `app/api/posts/route.ts:115-119`, `app/explore/page.tsx:21-35`, `app/api/categories` | 어드민 라우트 (본 도메인 밖) |
| post_flairs | `/api/posts` 임베드 `app/api/posts/route.ts:140`, `app/community/[slug]/page.tsx:55` — **`!flair_id` 힌트 필수** (`lib/feed/cardnews.ts:89` 주석, post_flair_map 추가 후 관계 모호) | 시드/어드민 |
| post_flair_map | (앱 read 없음 — 담벼락 대표 1개는 posts.flair_id) | `lib/news/publish.ts:216-219` (뉴스 다중 말머리) |
| user_flair_scores | `/api/profile/me/titles`, `/api/profile/[userId]`, `/api/stadiums/[teamId]/leaderboard` | DB 트리거 3종(§1c) + 기부 RPC `donate_flair_score_to_team` (`app/api/flair/donate`) |
| flair_titles | `app/api/posts/route.ts:226-229` (display title 이름) | 시드 |
| notifications | `app/api/notifications/route.ts:56-78` | insert `app/api/comments/route.ts:216-223`, 읽음 `app/api/notifications/route.ts:146-152` |
| post_views | (어드민/분석) | RPC `increment_post_view_count` (`20260802_post_views_user_id.sql:28`) |
| polls / poll_votes | `app/api/polls/active/route.ts:23-46` | 투표 upsert `app/api/polls/[id]/vote/route.ts:48-56`, 폴 생성은 `/api/admin/polls` |

## 4. 데이터 페칭 방식 매트릭스

| 화면 | 초기 로드 | 이후 갱신 | 방식 |
|---|---|---|---|
| 홈 피드 | RSC 직접쿼리 + ISR 300s (`app/page.tsx:11`) | SWR infinite (`hooks/use-feed.ts:179`) | 하이브리드 (fallbackData는 hot 한정 — §1a 드리프트) |
| 게시판 | RSC 직접쿼리 + ISR 30s (`app/community/[slug]/page.tsx:24`) | 페이지네이션=URL(서버) | RSC 순수 |
| 글 상세 | RSC 직접쿼리 (anon + 비밀댓글은 service role) `app/post/[id]/page.tsx:201-228` | 없음 (댓글만 클라) | RSC 순수 |
| 댓글 | SSR 초기 데이터 주입 (`app/post/[id]/page.tsx:123-128`) | **수동 fetch** — 작성/수정마다 전체 reload (`hooks/use-comments.ts:78-97,143`) | SWR 아님 ← 붕괴 사례 1 |
| 둘러보기(explore) | RSC ISR 60s (`app/explore/page.tsx:6`) → props | 클라에서 또 `useSWR("/api/categories")` (`app/explore/explore-content.tsx:104,110`) | RSC+SWR 이중 소스 ← 붕괴 사례 2 |
| 알림 | 없음 | 뱃지=SWR, 목록=열 때 수동 fetch (`notification-dropdown.tsx:38,60`) | 혼합 |
| 폴 위젯 | 없음 | 수동 fetch (`components/sidebar/poll-widget.tsx:33`) | 수동 |
| 활동 사이드바 | 홈은 SSR 주입, 상세 페이지는 클라 수동 fetch (`components/sidebar/activity-sidebar.tsx:90`) | — | 페이지별 상이 |

요약: **RSC 프리페치 + 클라 SWR** 이 명목상 표준이지만, 댓글·폴·알림 목록·활동 사이드바는 SWR 없이 수동 fetch+useState. 낙관적 업데이트 없이 전체 reload(댓글) → 큰 스레드에서 낭비.

## 5. 특이사항 / 냄새

| # | 심각도 | 내용 | 근거 |
|---|---|---|---|
| 1 | 🔴 | **post_votes에 vote_count 트리거 2중 등록, 계산식 상충.** `recalc_post_vote_count`=up−down, `sync_post_vote_count`=up만 카운트. 같은 이벤트(I/U/D)에 둘 다 발화 → Postgres는 트리거명 알파벳순 실행이라 `trg_sync…`가 나중에 덮어씀 → **down 투표가 vote_count에 반영 안 됨**. 이 때문에 `computeTemperature`의 비추 패널티 P(votes<0)와 DB 동식이 사실상 죽은 코드 | prod_schema :9004 vs :9016, 함수 :2575-2592 vs :3560-3581; `lib/temperature.ts:98-101` |
| 2 | 🟠 | **존재하지 않는 RPC 호출**: 댓글 삭제 라우트가 `decrement_comment_count`를 호출하는데 마이그레이션엔 그 이름의 함수가 없음(있는 건 트리거 함수 `decrement_comment_count_on_delete`). supabase-js는 throw하지 않으므로 catch/console.error도 안 찍히는 완전 무음 no-op. 실제 감소는 `update_post_comment_count` 트리거(UPDATE OF deleted_at, :9072)가 담당 중 — 만약 라이브 DB에 동명 RPC가 실존한다면 **이중 감소** | `app/api/comments/[id]/route.ts:127-131`; prod_schema :957, :4092-4104 |
| 3 | 🟠 | **PATCH /api/posts/[id] 보호 격차**: rate limit 없음, 정지유저 체크 없음(POST엔 둘 다 있음 `route.ts:262,275`), title 길이 무제한(`z.string()`만), community_slug 존재/활성 검증 없음 → 수정으로 임의 slug 이동 가능 | `app/api/posts/[id]/route.ts:10-16,81-156` |
| 4 | 🟡 | **피드 API와 홈 SSR의 쿼리 중복**: 활성 게시판 필터→posts→profiles→titles 파이프라인이 `app/page.tsx:39-75`와 `app/api/posts/route.ts:110-244`에 두 벌. select 컬럼도 다름(SSR엔 flair 임베드·view_count 없음). 프로필 수동 조인 패턴은 총 5곳+ 반복(홈·피드API·게시판·visible-comments·알림) — profiles FK 임베드 부재([admin-profiles-embed-no-fk] 전례)로 인한 관습이나 헬퍼 추출 여지 | 각 파일 해당 라인 |
| 5 | 🟡 | **use-feed 제목 기반 dedupe가 정상 글도 숨김**: 정규화된 제목이 같으면 뒤 글 무조건 drop (크롤링 중복 대응이지만 유저 글에도 적용됨) | `hooks/use-feed.ts:212-221` |
| 6 | 🟡 | **홈 SSR 피드 catch가 전부 삼킴**: DB 장애 시 빈 피드 `{posts:[]}` 반환, 로깅 0 — 관측 불가 (44% 에러율 사태 때 컬럼 오타가 조용히 빈 홈을 만든 전력과 같은 패턴) | `app/page.tsx:76-78`, 기타 `.catch(() => [])` :90,103,117,124 |
| 7 | 🟢 | soft delete 자체는 일관(글·댓글 모두 deleted_at + 읽기측 `.is("deleted_at", null)` 필터, 트리거도 soft delete 분기 처리). 단 댓글 트리거에 hard DELETE 분기도 살아있어(관리자 직접 삭제 대비) 두 경로 유지 비용 존재 | `app/api/posts/[id]/route.ts:181-184`, `app/api/comments/[id]/route.ts:117-120`, prod_schema :3692,:4099 |
| 8 | 🟢 | 투표 확인 `.single()`이 no-row(PGRST116)를 정상 흐름으로 사용 — 동작은 맞으나 `maybeSingle()`이 의도 명확. 확인 실패 시에도 계속 진행(:59-62)해 중복 insert → unique 제약 여부 미확인 ❓ | `app/api/posts/[id]/vote/route.ts:49-62` |
| 9 | 🟢 | 폴 집계가 투표 전행 로드 후 JS 카운트 — 현 규모(수백 표)엔 무해하나 확장 시 count 쿼리/뷰 필요 | `app/api/polls/active/route.ts:40-57` |
| 10 | 🟢 | 비밀댓글 로직은 모범적: service role 읽기+코드 필터+RLS 이중 방어, SSR/API 단일 출처 | `lib/comments/visible-comments.ts:28-77` |
| 11 | 🟢 | 온도는 DB(`calculate_post_temperature`, pg_cron 큐)가 정본, `lib/temperature.ts:68`은 명시적 fallback — 이중 구현이나 주석으로 동기화 의무 문서화됨. 표시 온도는 부스트 차감(`getDisplayTemperature`) | `lib/temperature.ts:1-13,111-121`, prod_schema :399 |

## 라이브 DB 검증 (메인 세션, 2026-08-08 — 읽기 전용 SQL)

| # | 검증 | 결과 |
|---|---|---|
| 냄새 #1 | post_votes 트리거 실존 + 실데이터 대조 | ✅ **확정**. `trg_post_vote_count`(recalc)·`trg_sync_post_vote_count`(sync) 둘 다 라이브에 존재, `sync_post_vote_count` 본문이 up만 카운트. 실측: 비추 1개 받은 글 3건이 전부 `vote_count=0`(정답 −1) — down 미반영 프로덕션 확인 |
| 냄새 #2 | `decrement_comment_count` 라이브 실존 | ✅ **RPC 없음 확정** → 이중 감소 아님. 라우트 호출은 매번 에러 나는 죽은 호출(무음). 실제 카운트는 `update_post_comment_count_trigger`(INSERT/DELETE/UPDATE OF deleted_at)가 정상 관리 — 심각도 데이터 오염→죽은 코드 정리로 강등 |

## ❓ 미확인

- post_votes/comment_votes에 `(post_id,user_id)` unique 제약 존재 여부 (#8)
- post_votes에 대한 anon RLS select 정책 (vote GET이 anon client 사용, `app/api/posts/[id]/vote/route.ts:162-169`)

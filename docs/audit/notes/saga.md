# 아키텍처 감사 노트 — 사가 엔진 (Phase 1)

작성: 2026-08-08 · 범위: lib/saga/**, app/saga/**, saga cron 4종, /api/admin2/saga, 연동 훅
전제: Phase A TransferSaga, 정산 없음(PRD D15 — 코드로 재검증함, §6-7 참조)

## 1. 플로우 체인 (소스 유입 → 화면)

| # | 단계 | 파일:라인 | 읽는 테이블 | 쓰는 테이블 |
|---|------|-----------|-------------|-------------|
| 1 | 수집 cron (매시 12,42분 `vercel.json:68-69`) — 티커 2차 소비(24h, transfer/rumor) + 해외 RSS 3피드(BBC/L'Équipe/Sky, `lib/saga/sources/rss.ts:22-34`) + 정규식 프리필터 | `app/api/cron/saga-ingest/route.ts:31-39,78-96,109-114` | news_ticker_items | saga_reservoir (upsert, source_url unique 멱등) |
| 2 | 추출 cron (매시 3,18,33,48분 `vercel.json:72-73`) — status='ingested' 40행 → gpt-4o-mini 20건 배치 추출 → alias 사전 정규화 → 티어 룰 판정 → 'queued'(+auto_hold 사유) | `app/api/cron/saga-extract/route.ts:52-57,74-75,110-123,179-189` | saga_reservoir, news_alias_dictionary | saga_reservoir (status/extracted/saga_hint/cluster_key/error) |
| 3a | **자동 발행** — auto_hold 사유 0개일 때만 (사전 등재 + confidence≥0.7 + 한글 헤드라인 + 여자축구 아님 + 클럽 모순 없음) | `saga-extract/route.ts:169-210` | — | (→ 4) |
| 3b | **검수 발행** — /admin/news-review 안의 SagaReviewQueue → POST /api/admin2/saga (requireStaffApi) | `components/admin/saga-review-queue.tsx:85,255` · `app/admin/news-review/page.tsx:227` · `app/api/admin2/saga/route.ts:67-119` | saga_reservoir(queued), sagas(hint 매칭) | (→ 4) |
| 3c | CLI 배치 발행 (스케줄 없음, CRON_SECRET) | `app/api/cron/saga-queue-publish/route.ts:19-53` | saga_reservoir | (→ 4) |
| 3d | unknown_player 잠금 자가 재평가 — 사전 등재되면 다음 회차에 LLM 재호출 없이 부활 (run당 15행) | `saga-extract/route.ts:238-293` | saga_reservoir, news_alias_dictionary | (→ 4) |
| 4 | `publishReservoirItem` — edits 반영 → `upsertSagaEntry` → reservoir status='published' | `lib/saga/publish.ts:404-461` | — | saga_reservoir(:445-458) |
| 5 | `upsertSagaEntry` — getOrCreateSaga → 같은 URL/cluster_key 있으면 에코 접힘, 없으면 appendEntry | `lib/saga/publish.ts:31-120` | saga_entries(:60-63) | saga_entries, sagas |
| 6 | `getOrCreateSaga` — 앵커 post(숨김 'saga' 보드, user_saga_bot) + sagas 행 생성. 동일인 가드·빈 키 거부 | `lib/saga/create.ts:42-148` | sagas, categories | posts(:98-117), sagas(:132-146) |
| 7 | `appendEntry` — 엔트리 upsert(saga_id+cluster_key) → stage 게이트 → entry_count/last_event_at/is_confirmed 갱신 | `lib/saga/create.ts:151-204` | saga_entries(count :184-187) | saga_entries, sagas(:189-200) |
| 8 | 마감 cron (매일 00:05 UTC) — 9/1 09:00 KST 이후 active transfer 일괄 종결: stage=done → outcome 'done', 나머지 'stayed' | `app/api/cron/saga-deadline/route.ts:23-51` · `lib/saga/config.ts:10` | sagas | sagas |
| 9 | 화면 렌더 | §4 | sagas, saga_entries, saga_article_links, saga_votes, posts | — |

- `saga-test-publish`는 이름과 달리 **뉴스**(news_reservoir drafted) 수동 발행 도구 — 사가 훅은 정식 발행 경로 경유로 발화 (`app/api/cron/saga-test-publish/route.ts:31-46`).

## 2. 기사 발행 → 사가 연동 3경로 (게이트 차이)

진입점: `lib/news/publish.ts:287-307` — 검수자 지정(opts.saga) 있으면 **동기** Chosen, 없으면 `after()` 비동기 자동.

| 경로 | 파일:라인 | 트리거 | 게이트 | 실패 처리 |
|------|-----------|--------|--------|-----------|
| `linkArticleToSaga` (자동) | `lib/saga/publish.ts:289-375` | 기사 발행 후 after() | LLM 추출(is_transfer+player) + **사전 미등재면 기존 사가 합류만 허용, 신규 생성 금지** (:314-330, 2026-08-08 추가 — 무게이트 시절 영문 제목 사가 10건 유출 사고) | 전체 try/catch **fail-open** — console.error만 (:371-374) |
| `linkArticleToSagaChosen` (검수자 지정) | `publish.ts:203-287` | /admin/news-review 발행 파라미터 (`app/api/admin/news-review/route.ts:39-48,160-173`) | LLM 없음(오연결 원천 차단). new 모드는 로마자 키 필수(:267-269) | **throw** → 발행 라우트가 발행 유지 + saga_error 응답 (`lib/news/publish.ts:295-297`, `news-review/route.ts:190-191`) |
| `linkArticleToSeasonWiki` (비이적) | `publish.ts:135-154` | 자동 경로에서 is_transfer=false일 때 (:296-298) | 시즌 사가 subject.aliases 의 제목 includes 텍스트 매칭, 첫 팀 1개만 | upsert error **무확인** (:147-150) |

- **게이트 불일치**: saga-extract 자동발행은 5중 게이트(confidence·한글·여자축구·클럽모순 포함)인데, 기사 훅 `linkArticleToSaga`는 사전 등재 게이트만 — confidence/여자축구/클럽모순(consistency L3) 검사 없음 (`publish.ts:294-330` vs `saga-extract/route.ts:169-177`). 기사 자체가 뉴스 게이트를 통과했다는 전제이나, NEWS_AUTO_PUBLISH 이후 "발행=사람 검수" 전제가 깨진 것이 8/8 게이트 추가의 배경(주석 :309-313) — 나머지 게이트는 여전히 비대칭.
- 연동 성공 시 `saga_article_links` upsert(post_id PK): `publish.ts:363-368`(자동), `:247-252,280-285`(지정), `:147-150`(시즌).

## 3. 핵심 개념 구현

| 개념 | 구현 | 파일:라인 |
|------|------|-----------|
| identity_key | `transfer:{player}:{direction}:{window}` — **목적지 클럽 미포함**(문서 분열 방지, D2). match=fixture_id, season=team+season | `lib/saga/identity.ts:26-45` (설계 주석 :4-5) |
| 동일인 가드 | 성 일치 + 이름 토큰 부분집합 (`isSamePlayerKey`) — 생성 시 같은 윈도우 active 사가에 동일인 있으면 합류, **방향 달라도 같은 선수면 같은 문서**(래시퍼드 사고). 동성이인 섞이면 병합 포기 | `identity.ts:60-67` · `create.ts:57-86` |
| 별칭 정규화 | news_alias_dictionary surface 정확 일치 + 성(姓) 유일 시 폴백(충돌은 null 마킹으로 병합 금지) | `lib/saga/canonical.ts:46-82` |
| cluster_key | `{player}:{stage_signal??"news"}:{KST일자}` — saga_entries UNIQUE(saga_id,cluster_key)로 멱등 | `publish.ts:56` (동일 포맷 4곳, §6-1) |
| 에코 접힘 (D9) | 같은 URL(canonical, 점검 F7 `cluster.ts:51-63`) 또는 같은 cluster_key 엔트리 존재 시 → echoes 배열 append만. 동일 origin 재유입은 완전 무시 | `publish.ts:58-100` |
| stage 게이트 | done 신호는 tier=official일 때만 유효(`gatedStageSignal`) — 루머의 done 주장은 null 강등(비니시우스 사고). 전이 자체는 유효 세트 내 자유(후퇴 허용) | `lib/saga/stages.ts:50-68` · 적용 `create.ts:182-183` |
| D7 노출(is_confirmed) | 열림=official+done만, 닫힘=비-done 신호 즉시(`confirmationPatch`) — noindex 해제·루머 배너의 유일 스위치 | `stages.ts:79-88` · `app/saga/[slug]/page.tsx:119,164-172` |
| 클럽 환각 방어 | L1: 영문 원제목에 없는 클럽 드랍+confidence 0.4 캡 (`extract.ts:153-171`) / L3: 최근 7일 지배 클럽과 무겹침 오피셜 → auto_hold + 디스코드 경보 (`consistency.ts:24-53` · `saga-extract/route.ts:134-167`) | 좌기 |
| LLM 배치 안전 | 항목이 자기 번호(i)로 자리 찾기(위치 밀림 사고 방지 `extract.ts:91-98`), 스키마 밖 값 sanitize(:174-194), 배치 실패 null 격리 | 좌기 |

## 4. 화면

| 화면 | 데이터 소스 | 파일:라인 |
|------|-------------|-----------|
| /saga (인덱스) | sagas 50건 last_event_at desc, season은 상단 스트립 분리 | `app/saga/page.tsx:39-49` |
| /saga/[slug] (transfer) | sagas + saga_entries(최신순) + saga_article_links→posts 본문(TipTap→HTML) + `aggregateMainVotes`. revalidate 30s | `app/saga/[slug]/page.tsx:64-104,27` |
| ?from= 기사 펼침 | 링크된 기사를 헤더 직하에 펼침, 투표 카드는 기사 뒤로 | `page.tsx:155-293` |
| 시즌 위키 분기 | saga_type='season'이면 통째 분기 → 순위(standings_cache)+일정(betman_games dedup)+연대기(자기 엔트리·이적 엔트리 ilike·기사 링크)+스쿼드(fpl-players.json) | `page.tsx:144-146` · `lib/saga/season.ts:87-111,128-167,195-276` · `season-wiki.tsx:54-74` |
| 댓글 | **앵커 포스트 경유** — CommentSection(anchor_post_id)로 기존 댓글·알림·팬점수 트리거 전부 재사용 (P0 오딧 근거 주석 `create.ts:10-12`) | `page.tsx:486-488` |
| 앵커 직접 접근 | /post/[id]가 community_slug='saga'면 /saga/[slug]로 redirect | `app/post/[id]/page.tsx:211-220` |
| 투표 API | GET 집계+내 스탠스 / POST append-only(같은 선택 no-op, closed 거부) | `app/api/saga/[slug]/vote/route.ts:26-84` |
| 유통 | 떡밥 카드 sagaSlug 부착(+가중치 +5) `lib/feed/cardnews.ts:26-27,304-322,356-375` / 히어로 후보에 "이적사가 연결" 힌트 `app/api/cron/hero-editor/route.ts:50-68` / 예측 완료 모달용 활성 3건 `app/api/saga/active/route.ts:10-22` | 좌기 |

## 5. 테이블 사용 매트릭스

| 테이블 | 쓰는 곳 | 읽는 곳 |
|--------|---------|---------|
| sagas | `create.ts:132-146`(insert) `:189-200`(stage/count/confirmed) · `saga-deadline:33-50`(종결) | `create.ts:45-49,61-66` · `publish.ts:139-143,214-219,317-322` · `app/saga/page.tsx:39-45` · `[slug]/page.tsx:66` · vote `:22` · active `:12-17` · admin2 GET `:53-58` · cardnews/hero(links 경유 임베드) |
| saga_entries | `create.ts:160-177`(upsert) · `publish.ts:94-97`(에코 update) | `[slug]/page.tsx:69-73` · `publish.ts:60-63` · `season.ts:203-217,282-288` · `create.ts:184-187`(count) |
| saga_reservoir | ingest `:109-114` · extract `:83-88,92-100,179-189,216-221,284-291` · `publish.ts:445-458`(published) · admin2 POST `:92-100`(rejected) | extract `:52-57,139-145,239-245` · admin2 GET `:38-45` · queue-publish `:32-37` |
| saga_article_links | `publish.ts:147-150,247-252,280-285,363-368` | `[slug]/page.tsx:76-79` · `season.ts:257-261` · `cardnews.ts:304-312,356-362` · `hero-editor:50-51` · `app/api/admin/published-fixes` |
| saga_votes | vote POST `:70-76` (append-only) | `votes.ts:24-30,68-83` (유저별 최신 행 = 현재 스탠스) |
| saga_comment_stances | `votes.ts:60-64` (댓글 훅 `app/api/comments/route.ts:241`, fire-and-forget) | **읽는 코드 0건** (§6-5) |
| saga_settlements | **코드 0건** (마이그 `20260805_saga_reservoir.sql:41-54` 스키마만) | **코드 0건** |

## 6. 특이사항 / 냄새

1. **cluster_key 포맷 문자열 4중 중복** — `` `${player}:${signal ?? "news"}:${day}` `` 가 `cluster.ts:150` / `publish.ts:56` / `publish.ts:454` / `saga-extract/route.ts:130` 에 각각 하드코딩. 포맷 바꾸면 4곳 동기 수정 필요 (헬퍼 부재).
2. **D9 origin 선출 규칙이 경로 간 불일치** — 순수 함수 `clusterBatch`는 "origin 선출: official > tier1 > rumor" (`cluster.ts:7,144-153`)인데 실파이프라인 `upsertSagaEntry`는 **먼저 온 보도가 origin 고정**(주석 "origin 은 먼저 발행된 보도 유지" `publish.ts:29-30`). 에코 접힘 분기(:78-100)는 echoes 배열만 추가하고 appendEntry를 안 타므로, **나중에 온 오피셜이 같은 cluster/URL로 접히면 tier 승격·stage 전진(done)·is_confirmed 개방이 전부 스킵**된다. cluster.ts 헤더 주석 "드라이런과 실파이프라인이 같은 코드를 쓴다"(:10)는 현재 사실 아님 — `clusterBatch` 소비자는 `scripts/saga-backfill-dryrun.ts:106` + 테스트뿐.
3. **saga_settlements = 죽은 스키마 (죽은 코드는 없음)** — 정산 관련 .ts 코드 0줄 (Grep 전수). D15(정산 취소)와 정합. `saga-deadline`은 로그 종결만 수행 — PRD 재개 대비로 테이블·notifications CHECK만 잔존.
4. **outcome 'collapsed' 세터 부재** — `stages.ts:20`에 정의·라벨(:29)까지 있으나 쓰는 코드 없음. deadline cron은 done/stayed 이분법(`saga-deadline:33-50`) — 결렬 판정 경로가 없어 마감 전 무산된 이적도 'stayed'로 닫힘.
5. **saga_comment_stances 쓰기 전용** — D10 "소환" 원장인데 W4 폐지로 소비자 0. 댓글마다 행이 계속 쌓임 (`comments/route.ts:241` fire-and-forget, 에러는 catch 로그만).
6. **saga_reservoir status CHECK의 유령 상태** — 'extracted','clustered','approved' (`20260805_saga_reservoir.sql:28`)를 쓰는 코드 없음. 실사용은 ingested/queued/published/rejected/discarded 5종.
7. **에러 삼킴 계열**: `linkArticleToSaga` 전체 catch fail-open(console만, `publish.ts:371-374` — 의도된 발행 보호지만 실패 원장 없음) / `linkArticleToSeasonWiki` upsert error 무확인(:147-150) / 디스코드 경보 `.catch(() => {})` (`saga-extract:165`).
8. **네이밍 혼선** — 살아있는 검수 API가 `/api/admin2/saga`인데 UI는 `/admin/news-review` 소속 (admin2 폐기 결정과 경로명 불일치). `saga-test-publish`는 사가가 아닌 뉴스 발행 도구 (§1 비고).
9. **appendEntry의 entry_count 계산이 count 쿼리→update 2단** (`create.ts:184-200`) — 동시 발행 시 근소한 undercount 가능 (cron 단일 실행 전제라 실해는 낮음).
10. **미추적 dev 라우트** `app/dev/saga-preview/[slug]/page.tsx` — git untracked 상태로 saga 데이터 접근. 배포 대상인지 불명 ❓.
11. `tier.ts`는 `lib/transfer/feed.ts` 재수출 — 중복 아님, 의도된 소유권 이관 대기 (`tier.ts:2-8`).
12. vote GET에서 사가 없음이 400(apiBadRequest, `vote/route.ts:31`) — 404가 자연스러움 (경미).

## 7. PRD 결정 로그 대조 (코드 재검증)

| 결정 | 코드 실태 |
|------|-----------|
| D2 identity에 목적지 없음 | 일치 (`identity.ts:26-28`) |
| D7 noindex 게이트 | 일치 — is_confirmed만이 스위치 (`stages.ts:79-88`, `page.tsx:119`) |
| D9 에코 접힘 | 접힘 자체는 일치, origin 선출 규칙은 불일치 (§6-2) |
| D15 정산 취소 | 일치 — 정산 코드 0줄, deadline은 로그 종결만 (§6-3) |

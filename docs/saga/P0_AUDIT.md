# 사가 엔진 P0 접합면 오딧

- 수행: 2026-08-03 (PRD 수령 당일, 3갈래 병렬 탐색)
- 목적: PRD §9 P0 체크리스트의 `[P0확인]` 전부를 실명(테이블·컬럼·파일:라인)으로 채우고
  재사용/신규 판정을 확정한다. **이 문서가 §5 초안 스키마보다 우선한다.**

---

## 1. 판정 요약표

| PRD 접합면 | 실체 | 판정 |
|---|---|---|
| 예측 엔진(임의 바이너리 마켓) | `betman_predictions.game_id` **NOT NULL FK** → betman_games + `prediction` CHECK `home\|draw\|away\|over\|under` (prod_schema:4702-4736, :9189) | **재사용 불가 → saga_votes 신규** (PRD §11 Q1 해소) |
| polls/poll_votes | `poll_votes UNIQUE(poll_id,user_id)` + vote API 가 upsert (app/api/polls/[id]/vote/route.ts:48-56) → **이력 미보존** | 재사용 불가 (여론 시계열 요건 미충족). 패턴만 참고 |
| comments | `post_id uuid NOT NULL` FK CASCADE (prod_schema:4895-4908, :9224) + 트리거 3종(댓글수·프로필 카운트·flair 점수)이 post 전제 | **앵커 posts 행 경유 재사용** — 만들면 댓글수·팬점수·알림 공짜 |
| 포인트 | `award_points(user_id text, board_slug, amount, type, description, related_id)` RPC (prod_schema:158-226) — `POINT_VALUES.prediction_hit=15` 가 lib/points.ts:18-24 에 정의만 되고 **미사용** | **그대로 재사용** — 사가가 첫 소비자. ⚠️보드당 일일 100점 상한 |
| 볼(토큰) | 적립 RPC 부재 (`refund_tokens` 가 유일한 증가 경로, type 'refund' 하드코딩) | **보상 사용 금지** |
| 정산 패턴 | lib/betman/settle.ts — CAS(`.eq status pending`)+3회 재시도+`settlement_audit_log`(event_type CHECK 없음)+batch 알림 | 패턴 복제. audit_log 는 **그대로 삽입 가능**(`saga_settle`) |
| notifications | type CHECK 제약 (prod_schema:5870) — 5종 고정 | **마이그레이션 필요**(+`saga_settled`). actor_id NOT NULL → 수신자 본인 id 패턴(settle.ts:341) |
| 호칭 | `flair_titles.flair_id NOT NULL` / 부여 경로는 `apply_flair_score` 트리거뿐 — **코드 부여 인터페이스 부재** | 신규 헬퍼: 전용 post_flairs 행 + 도달불가 threshold + `user_unlocked_titles` 직접 INSERT |
| HITL 큐 | news_reservoir 검수 화면이 `source->>type='hermes'` 하드필터 (app/admin/news-review/page.tsx:77-83) | **자체 테이블 신설** — agg_reservoir 선례("news_reservoir 패턴 복제", 20260722c 주석) |
| 크롤 재료 | 스캐너(scripts/vps-news-scanner) 70% 이식 가능: fetchArticleBody/fetchTweetData/judgeAndWrite 프롬프트 구조/few-shot 교정 루프/draft API 계약 | 신규 = 일반 RSS 어댑터 + **클러스터링(코드베이스 완전 부재 — 최대 개발량)** |
| 엔티티 사전 | `news_alias_dictionary`(surfaces[] 정확일치 룩업 계약, data/agents/schemas/alias-dictionary.ts:28-38) + learn-corrections 자동 학습 루프 | 인프라 완비, 커버리지만 부족 → `public/data/fpl-players.json`(EPL 전 선수+한글명) 시드 변환 1회 |
| /transfer | 175줄 티커 뷰 (lib/transfer/feed.ts) | 흡수·대체. `classifyTier`/`TIER1_RE`/`HEDGE_RE`/`OUTLET_NAMES`/`bracketSource` → `lib/saga/tier.ts` 이식 |
| 라우팅 | 최상위 `[slug]` 동적 세그먼트 없음 — `/saga` 충돌 0 | sitemap(app/sitemap.ts)·GNB 수동 등록. API 캐시는 라우트 직접 Cache-Control 관례 |
| 응원팀 | `profiles.favorite_team` 은 **자유 텍스트 — 신뢰 금지**. 진짜 판정 = `user_flair_scores` top-1 → `post_flairs.team_id` | flair 체계 사용 |
| Playwright | 3 config 공존. 사가 스모크 템플릿 = `tests/e2e/journeys/guest/static-gnb.spec.ts` (collectErrors→순회→finishJourney) | journeys 에 작성 |
| cron | `verifyCronSecret`(timingSafeEqual) + `withCronLog`("cron_run_log") + vercel.json | 그대로 재사용. season 계열이 미적용인 withCronLog 를 사가는 붙일 것 |

## 2. PRD 정정 (오딧 근거)

1. **user_id 는 `text`(Clerk id)** — §5 스케치의 `saga_poll_votes.user_id uuid` 는 오류. 전 테이블 text.
2. §5 `saga_comment_meta` 의 "polymorphic 연결" — comments.post_id NOT NULL 이라 불가.
   **사가마다 앵커 posts 행**(숨김 보드 + 봇 페르소나 작성자)을 만들고 comments 는 무변경.
3. §5 `saga_polls`/`saga_poll_votes` 2테이블 → **`saga_votes` append-only 단일 테이블**
   (scope main|entry 통합). 현재 스탠스 = `DISTINCT ON (user_id) ORDER BY created_at DESC`
   계산식, 여론 시계열 = 같은 원장의 일 버킷 집계 — lib/event/ "원장에서 매번 계산" 철학.
4. RLS/GRANT: 신규 SECURITY DEFINER RPC **0개**(전부 service role TS 계산식) — Supabase 가
   public 스키마 새 함수에 anon·authenticated 를 **직접 부여**하는 함정(20260803b 실사고) 원천 회피.
   부득이 만들 땐 `revoke ... from public, anon, authenticated` 3종 명시.

## 3. 오너 확정 (2026-08-03)

- **크롤 소스(§11 Q2)**: Phase A = `news_ticker_items` 2차 소비 + 해외 RSS(르퀴프·BBC 등)만.
  국내 매체는 안정화 후. → **VPS 수정 0** (레딧 쿼터·수동배포 드리프트 회피)
- **대량 정산 시각(§11 Q4)**: **9/1 09:00 KST** (영국 마감 이후 여유, 발표는 아침 시간대)
- 미결: Q3 API-Football 예산(Phase B 전), Q5 EPL 외 확장

## 4. 확정 스키마 방향 (마이그레이션 2본)

**`20260804_saga_core.sql`** (W1)
- `sagas`: identity_key text UNIQUE(멱등 — `transfer:{player_key}:{direction}:{window_key}`),
  subject jsonb, window_key, stage/outcome **DB CHECK 없음**(타입별 세트가 달라
  `lib/saga/stages.ts` 코드 검증 단일화 — match/season 무마이그레이션 확장의 대가),
  status active|closed CHECK, `anchor_post_id uuid NOT NULL REFERENCES posts`,
  entry_count, last_event_at(피드 정렬키), settled_at(정산 CAS 가드)
- `saga_entries`: `UNIQUE(saga_id, cluster_key)` 발행 멱등, headline/summary(자체 작성 —
  **본문 컬럼 자체가 없음 = D5 구조적 보장**), tier CHECK official|tier1|rumor,
  origin jsonb 1건 + echoes jsonb(받아쓰기 접기), occurred_at
- `saga_votes`: **append-only** — scope main|entry, entry_id(entry 스코프 시), user_id text,
  choice(값 검증은 코드), created_at. 인덱스 (saga_id,scope,created_at) / (saga_id,user_id,scope,created_at desc)
- `saga_comment_stances`: comment_id PK FK comments CASCADE, saga_id, stance(작성 시점 —
  소환 원장, D10), 댓글 API 에서 anchor_post_id 역조회 히트 시 fire-and-forget insert

**`20260805_saga_reservoir.sql`** (W2/W4)
- `saga_reservoir`: HITL 큐 — source('ticker'|'rss:lequipe'|...), source_url UNIQUE(수집 멱등),
  raw(판단 재료 전용 — **UI/entries 로 흐르는 경로 금지**), extracted jsonb,
  matched_saga_id(null=신규 사가 제안), cluster_key/cluster_role(origin|echo),
  status CHECK ingested→extracted→clustered→queued→approved→published|rejected|discarded, audit jsonb
- `saga_settlements`: `UNIQUE(saga_id, user_id)` 정산 멱등, stance, hit, points,
  awarded_at(**null = 일일 100점 상한 이월 대기** — 다음날 스윕이 재시도)
- notifications CHECK 교체: +`saga_settled` (선례: migrations-backup/016, 039)

RLS: sagas·saga_entries 공개 읽기(`for select using (true)`), 나머지 정책 0(service role 전용).

## 5. 핵심 재사용 파일 (이식 지도)

| 사가 모듈 | 이식원 |
|---|---|
| `lib/saga/tier.ts` | `lib/transfer/feed.ts` — classifyTier/TIER1_RE/OUTLET_NAMES/CLUB_HOSTS/HEDGE_RE/bracketSource |
| `lib/saga/extract.ts` | `scripts/vps-news-scanner/news-scanner.mjs` — judgeAndWrite 프롬프트 구조·few-shot 교정 주입(`/api/news/correction-examples`) |
| 정산 잡 | `lib/betman/settle.ts` — CAS 선점·3회 재시도·settlement_audit_log·batch notifications |
| 채점 | `lib/event/scoring.ts` — 순수함수/최소표본/정렬 관례 (⚠️`1/odds` 산식은 부적용 — 찬반비율 기반 신규) |
| 멱등 결과 테이블 | `supabase/migrations/20260803_season_weekly_draw.sql` — unique 키 + 사전조회 skip |
| reservoir 골격 | `supabase/migrations/20260722c_agg_reservoir.sql` — status 전이·봇 페르소나·RLS |
| 검수 UI | `app/admin/news-review/fast-review.tsx` 구조 + `requireStaff` + admin2 탭 |
| 댓글 | `components/post-detail/comment-section.tsx` — postId 하나로 그대로 |
| 투표 위젯 | `components/post-detail/vs-issue-widget.tsx` 구조 참고 |
| cron | `lib/cron-auth.ts` verifyCronSecret / `lib/cron/log-run.ts` withCronLog |
| e2e | `tests/e2e/journeys/guest/static-gnb.spec.ts` |

## 6. 함정 목록 (구현 중 반드시 회피)

1. **admin 폴 생성 버그**: `app/api/admin/polls/route.ts:39` 가 새 폴 생성 시 **DB 전체 활성 폴을
   끈다** — 사가는 polls 미사용으로 비전염이지만, 사가 코드에 유사한 전역 변이 금지.
2. **post_flairs 임베드**: posts→post_flairs 관계가 2개라 `post_flairs!flair_id` 힌트 필수 (f15c802a).
3. **앵커 포스트 피드 오염**: 숨김 보드로 만들되 홈 피드·hot_feed(MV, prod_schema:5439)·
   /api/posts 의 노출 경로에서 `community_slug='saga'` 제외를 W1 에서 실측 확인.
4. **Supabase 새 함수 anon 자동부여** (20260803b 실사고): SECURITY DEFINER 를 만들면
   revoke 3종 명시. 이번 설계는 RPC 0개로 회피.
5. **일일 100점 상한**: award_points 는 초과분을 조용히 잘라 `success:true, amount<요청` —
   반환 amount 확인 + awarded_at null 이월 스윕 필수. board_slug 는 전용 `'saga'`.
6. **VPS 스캐너는 수동 배포** — 사가 파이프라인은 VPS 를 건드리지 않는 설계(티커 2차 소비 + Vercel RSS)로 이 함정 자체를 우회.
7. **notifications.type CHECK** — 마이그레이션 없이 새 타입 INSERT 는 실패한다.

## 7. 실행 슬라이스 (승인된 플랜 요약)

| 주 | 내용 | 게이트 |
|---|---|---|
| W1 | A1 코어: saga_core 마이그, lib/saga 기반, /saga 인덱스+상세, CommentSection+스탠스 스냅샷, 메인 투표 | e2e saga.spec + identity vitest + 마이그 리허설 |
| W2 | A2 전반: saga_reservoir, extract/cluster/tier, RSS 어댑터, ingest/extract cron, fpl→alias 시드, **300건 드라이런** | 클러스터 vitest(로마노 15건→1) + 리포트 검수. **통과 전 자동 발행 금지** |
| W3 | A2 후반: admin2/saga 검수, 발행 트랜잭션, cron 등록, 신빙성 투표+echoes | 실데이터 사가 3건 발행 = **MVP** |
| W4 | A5: notifications 마이그, saga-deadline(9/1 09:00 KST)·saga-settle, 호칭 헬퍼, 여론 그래프, 소환 v0 | 정산 2회 멱등 검증 |

W4 이후 컷: 댓글 스탠스 뱃지 렌더(A3 일부), A4 이적센터 홈(기존 /transfer 가 당분간 대행), /transfer→/saga redirect.

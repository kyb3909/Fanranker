# Phase 1 감사 — 커뮤 애그리게이터 / 뉴스 티커 / 이적판

작성: 2026-08-08 · 담당 도메인: agg_reservoir·agg_training_entries·news_ticker_items·ticker_comments·/transfer·hero-editor·data/crawlers·seeded_reddit_posts·embed_cache

---

## 1. 커뮤 애그리게이터 플로우 (수집 → 발행)

상태 전이: `(없음) → ingested → fetched → drafted → approved → published | rejected` (`supabase/migrations/20260722c_agg_reservoir.sql:18`)

| 단계 | 실행 주체 | 코드 | 상태 전이 | 테이블 |
|---|---|---|---|---|
| 1. 목록 수집 | VPS 로컬 CLI (LLM 없음) | `data/agents/scripts/agg-scout-run.js:1-12` | → ingested | agg_reservoir INSERT |
| 2. 상세+미디어 rehost | VPS 로컬 CLI | `data/agents/scripts/agg-fetch-run.js:1-13` | ingested → fetched | agg_reservoir UPDATE |
| 3. LLM 재작성 | VPS 로컬 CLI (`core/agg-gen.js` 공유) | `data/agents/scripts/agg-write-run.js:1-12` | fetched → drafted | agg_reservoir UPDATE |
| 4a. 수동 검수 | `/admin/agg-review` + POST API | `app/api/admin/agg-review/route.ts:11-19` | drafted → published \| rejected | + 편집 시 agg_training_entries 학습쌍 적재 |
| 4b. 자동 승인 cron | Vercel `25,55 * * * *` (`vercel.json`) | `app/api/cron/agg-auto-approve/route.ts:43-112` | drafted → approved(+scheduled_at) | 게이트: 미디어 필수(:89)·24h 이내(:63)·cap(:55,:90) |
| 5. 분산 발행 cron | Vercel `*/10 * * * *` (`vercel.json`) | `app/api/cron/agg-publish-queue/route.ts:21-49` | approved(시각 도래) → published, 실패 시 rejected(:42-45) | posts INSERT |
| (구식) CLI 발행 | VPS 로컬 CLI | `data/agents/scripts/agg-publish-run.js:1-10` | approved → published | 큐 cron과 중복 경로 (현재는 큐가 정본) |

- 발행 공용 로직: `lib/agg/publish.ts:110-154` `publishQueueItem` — free-board(`aggregator.json:292` board.communitySlug)에 페르소나 계정으로 TipTap insert + 디스코드 snack 채널 전파(:145).
- 큐 슬롯: 마지막 예약+20~60분 랜덤 (`lib/agg/publish.ts:96-107`), cap: 일 40 / 페르소나당 10 (`data/agents/config/aggregator.json:285-290`).
- 킬스위치: env `AGG_AUTO_APPROVE=off` (`app/api/cron/agg-auto-approve/route.ts:47`).

**소스 설정 위치와 "정말 0개인가"**: `data/agents/config/aggregator.json:4-143` — theqoo·instiz·instiz_enter·fmkorea·dcinside·reddit **6개 전부 `enabled: false`**. 파일 상단 note(:3)에 "2026-08-03 운영자 결정: 전 소스 비활성 — 수집은 멈추고 파이프라인·검수 큐는 유지" 명시. 코드로 휴면 확정.

**학습 하니스 (F15)**: `agg_training_entries` (`supabase/migrations/20260724_agg_training.sql:7-27`) — 로컬 `agg-train.js gen`이 insert → `/admin/agg-training`(`app/admin/agg-training/page.tsx`)에서 통과/교정/반려 → `agg-train.js learn`이 `config/agg-corrections.json`으로 회수. 라이브 posts와 완전 분리(`data/agents/scripts/agg-train.js:1-6`).

---

## 2. 뉴스 티커 (news_ticker_items)

**유입 (쓰기)** — 전부 저장소 외부 VPS 실행:

| 쓰는 곳 | 코드 | 방식 |
|---|---|---|
| VPS 크롤러 runner (유일한 공급로) | `data/crawlers/runner.js:196-197, 270-271` | upsert `onConflict: source_id,external_id` (reddit/naver 공용) |
| 어드민 importance 수정 | `app/api/admin/content/ticker/route.ts:8-11` (PATCH) | importance 조정만 |

- 소스 목록: `data/crawlers/config/sources.json` — reddit 44 + naver 11 = 55개, **repo 파일상 전부 `enabled: true`** (interval_hours 24, max_daily_runs 1). 운영 메모("2026-06-26부터 football만")와 상충 — VPS `/opt/crawlers` 사본이 정본일 가능성 ❓.
- summarizer가 headline_kr/summary_kr/category/importance 생성, 48h cross-source dedupe용 재조회(`data/crawlers/runner.js:107-116`).

**소비 (읽기) 전수**:

| 소비처 | 코드 | 용도 |
|---|---|---|
| 게시판 티커 UI | `app/api/community/[slug]/ticker/route.ts:25-34` → `components/news-talk/news-ticker.tsx:114-126`, 마운트 `app/community/[slug]/page.tsx:8,355` | 24h·importance순 20건, s-maxage=120 |
| /transfer 상황판 | `lib/transfer/feed.ts:199-214` | football + transfer/rumor, 14일 300건 |
| 사가 2차 소비 | `app/api/cron/saga-ingest/route.ts:30-38` | 24h transfer/rumor → `saga_reservoir` upsert(:111-112) |
| 토픽 공유 | `app/api/topic-share/route.ts:28-34` | headline 500건 |
| 크롤 지연 감시 | `app/api/cron/ops-monitor/route.ts:55-62` | 최신 updated_at > 2h 경보 |
| 어드민 티커 콘솔 | `app/api/admin/content/ticker/route.ts`, `.../ticker/dashboard/route.ts`, `app/admin/content/ticker/page.tsx` | 목록/대시보드 |

**ticker_comments**: API `app/api/ticker/[id]/comments/route.ts` (GET 100건 / POST, 정지 유저 차단) ↔ UI `components/news-talk/ticker-detail-panel.tsx:44-96` (`ticker-<id>`에서 숫자 id 추출). e2e `tests/e2e/journeys/member/ticker-comment.spec.ts` 존재.

---

## 3. /transfer 이적시장 상황판

- 페이지: `app/transfer/page.tsx:13-17` — force-dynamic SSR, service role로 `fetchTransferFeed` 직접 호출 (별도 API 없음). 비로그인 공개.
- 데이터 소스: news_ticker_items만 — "별도 수집 없음" (`lib/transfer/feed.ts:5-9`).
- 분류 로직 (`lib/transfer/feed.ts`):

| 규칙 | 위치 | 내용 |
|---|---|---|
| 구단 공식 도메인 → official | :111-112, :169-170 | CLUB_HOSTS 18개 도메인 |
| OFFICIAL_RE | :32-33 | 공식 발표 마커만 (here we go는 제외 — 2026-08-04 운영자 확정) |
| NEGATION_RE | :39 | 무의미·간주 등 → 오피셜 금지 |
| HEDGE_RE | :45-46 | 진행형 신호 → naver transfer 폴백 승격 차단(:175-179) |
| TIER1_RE → tier1(유력) | :52-53 | 로마노·온스테인·here we go·done deal 등 |
| 나머지 → rumor(찌라시) | :182 | UI 라벨 `app/transfer/transfer-client.tsx:13-22` |

- 추가 가드: 여자축구 제외(:217-222), saga_reservoir `club_conflict` 있는 오피셜 → 루머 강등(:224-241, 디오망데 실사고), 오피셜 헤드라인 근거 없는 금액 제거(:246-251).
- 출처 해석 체인: 브래킷 기자명 → naver author 언론사 → 링크 도메인, 야후·레딧 등 유통 채널은 표시 금지(:62-63, :256-263).

---

## 4. data/crawlers/ — 살아있는 부분 vs 죽은 부분

| 구분 | 대상 | 근거 |
|---|---|---|
| **현역 (끄면 안 됨)** | `runner.js` + `core/{reddit-fetcher,naver-news-fetcher,summarizer,db}.js` | news_ticker_items의 유일한 공급로 (§2). 티커·/transfer·사가 인제스트가 전부 여기 의존 |
| **현역 (간접)** | `core/db.js`, `core/openai-client.js` | `data/agents/scripts/agg-*.js`가 `../../crawlers/core/db.js` import (`agg-fetch-run.js:18`, `agg-write-run.js:14-15`) — crawlers 제거 시 agents도 깨짐 |
| **중단** | `app/api/cron/reddit-seed-posts/route.ts` (담벼락 시드 글) | `vercel.json` crons에 미등록 — 스케줄 실행 없음. 수동 호출만 가능 |
| **수동 전용** | `scripts/reddit-seed-bot.ts` (`pnpm reddit-seed`) | 오픈 전 시딩용 CLI (`scripts/reddit-seed-bot.ts:1-13`) |
| ❓ | `data/crawlers/analyze-sources.mjs`, `deploy.sh` | 미열람 — 보조 유틸로 추정 |

"deprecated 예정" 메모(CLAUDE.md)와 달리 **크롤러는 여전히 핵심 경로** — 신규 newsroom(data/agents news 계열)은 담벼락 기사용이고, 티커 적재는 대체된 바 없음.

---

## 5. 사용 테이블 읽기/쓰기 맵

| 테이블 | 쓰기 | 읽기 |
|---|---|---|
| agg_reservoir | VPS agg-scout/fetch/write(-run.js), cron agg-auto-approve(:94-106)·agg-publish-queue(:42-45, publish.ts:133-141), admin agg-review | 좌동 + `app/api/admin2/dashboard/route.ts:126-128`, `app/api/admin/operations/dashboard/route.ts:120`, `app/api/cron/ops-monitor/route.ts:163-168` |
| agg_training_entries | `agg-train.js gen`, admin agg-review(편집·반려 학습쌍), `app/api/admin/agg-training/route.ts` | `/admin/agg-training` 페이지, `agg-train.js learn` |
| news_ticker_items | VPS `runner.js:196,270` upsert, admin ticker PATCH | §2 소비 6곳 |
| ticker_comments | `app/api/ticker/[id]/comments/route.ts` POST | 동일 라우트 GET |
| seeded_reddit_posts | `app/api/cron/reddit-seed-posts/route.ts:241,296` (중단), `scripts/reddit-seed-bot.ts` | 동일 라우트 dedupe 조회 |
| embed_cache | `app/api/oembed/route.ts:61-70` (7일 TTL, 만료 시 재시도·실패 시 stale 서빙) | 동일 라우트. migration `20260727_embed_cache.sql` (RLS enable + policy 없음 = service role 전용) |
| agent_picks | `app/api/cron/hero-editor/route.ts:114-118` upsert(kind=hero) | `lib/feed/cardnews.ts:256` (히어로 카드) |

- hero-editor cron: 30분 주기(`vercel.json` 22,52분), gpt-4o가 24h 봇 기사(user_bot_soccer_kr, 이미지 필수) 25건 중 3건 픽 + 이유 필수 기록 (`route.ts:31-41, 82-91`). fail-closed — 픽 실패 시 기존 유지(:109-111). 서열: 운영자 핀 > agent_picks > 점수 규칙 폴백(:17).
- 임베드 보안: `lib/sanitize-embed.ts` — iframe은 화이트리스트 재조립(:29-51), X/IG blockquote는 sanitize-html(:58-71). oEmbed 라우트에 SSRF 방지 호스트 화이트리스트(`app/api/oembed/route.ts:34-47`).

---

## 6. 특이사항 / 냄새

| # | 항목 | 근거 | 영향 |
|---|---|---|---|
| 1 | **소스 0개인데 agg cron 2종 상시 가동** — auto-approve 48회/일 + publish-queue 144회/일이 빈 테이블 대상 no-op | `aggregator.json:5-143` 전 소스 false + `vercel.json` 등록 유지 | DB 쿼리·cron 로그 비용만. 재개 대비 의도적 유지(설정 note 명시)라 삭제 대상은 아님 |
| 2 | **ops-monitor "커뮤 크롤 정지 의심" 상시 오탐 조건** — 마지막 agg_reservoir 수집이 6h 초과면 경보인데, 소스 전체 비활성(2026-08-03~)이라 조건이 영구 참. 휴면 상태 인지 로직 없음 | `app/api/cron/ops-monitor/route.ts:160-180` | 30분마다 디스코드 알림 소음 → 진짜 경보 둔감화. 휴면 플래그 체크 추가 권장 |
| 3 | **sources.json(repo) ↔ 운영 실태 불일치** — repo는 55개 전부 enabled:true, 운영 메모는 "football만" | `data/crawlers/config/sources.json` vs 운영 메모 | VPS 사본이 정본이면 repo 설정은 죽은 문서. 어느 쪽이 진실인지 코드만으로 판정 불가 ❓ |
| 4 | **reddit-seed-posts 라우트 = 사실상 죽은 코드** — cron 미등록, seeded_reddit_posts 테이블도 이 경로 전용 | `vercel.json`(부재), `app/api/cron/reddit-seed-posts/route.ts` | 정리 후보 (단 admin cron-monitor가 이름 참조: `app/admin/system/cron-monitor.tsx`) |
| 5 | **티커 폴백 목업 = 가짜 뉴스 노출** — API 빈 응답/실패 시 하드코딩 목업("손흥민 10호골" 등)을 실데이터처럼 표시, 날짜 없음 | `components/news-talk/news-ticker.tsx:31-84, 114-126` | 크롤러 장애 시 낡은 가짜 헤드라인이 사용자에게 보임 |
| 6 | 발행 경로 이원화 — VPS `agg-publish-run.js`와 Vercel 큐 cron이 같은 approved를 소비 가능 (동시 실행 시 이중 발행 여지, 현재는 휴면이라 무해) | `agg-publish-run.js:1-10` vs `agg-publish-queue/route.ts` | 재개 시 CLI 경로 폐기 또는 잠금 필요 |
| 7 | agg_reservoir/agg_training_entries RLS는 enable+policy 없음 = service role 전용 — 양호 | `20260722c_agg_reservoir.sql:26`, `20260724_agg_training.sql` 말미 | 문제 없음 (기록용) |

## ❓ 미확인

- VPS `/opt/crawlers`·`/opt/news-scanner` 실제 cron/config 상태 (repo 밖 — sources.json 55개 중 실가동 소스 수, agg-cycle cron 잔존 여부)
- `data/crawlers/analyze-sources.mjs`, `deploy.sh` 내용 (미열람)
- `seeded_reddit_posts`·`agg_reservoir` 실제 행 수/최근 적재 시각 (DB 미조회 — 읽기 전용 감사 범위 내에서 코드만 확인)

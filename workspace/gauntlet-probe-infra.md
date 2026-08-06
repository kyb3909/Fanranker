# 횡단 인프라 조사 — 스케줄러·큐·관측·시크릿·테스트 실태

- 조사일: 2026-08-06 / 조사 범위: `D:\Projects\새 폴더\adding(test)\community` (읽기 전용) + Supabase 프로덕션 SELECT 실측
- 원칙: 주석이 아닌 실제 코드 흐름 기준. 증거 없는 항목은 "추정:" 표기. 시크릿은 키 이름만.

---

## ① 스케줄러 전수

### 실행 층위는 5개다 (리포에 보이는 건 1개뿐)

| 층위 | 무엇이 도는가 | 리포 내 검증 | 근거 |
|---|---|---|---|
| 1. Vercel Cron | 아래 23개 (`vercel.json:2-95`) | 가능 | vercel.json + 각 라우트 |
| 2. Vultr VPS cron | `/opt/crawlers/runner.js`(10분, 티커), `/opt/news-scanner`(기사 초안, 15분), `/opt/betman/*`(2시간) | **불가 — git 밖 파일** | `CLAUDE.md:123-124`, `workspace/codex-newsroom-briefing.md:21,25,36`, `app/api/cron/ops-monitor/route.ts:76` ("VPS /opt/news-scanner 15분 주기") |
| 3. **pg_cron (DB 내부)** | **6개 잡 활성** — 리포 어디에도 정의가 없음 | 불가(DB 실측만) | `cron.job` SELECT 실측 (아래) |
| 4. **Supabase Edge Function** | `betman-sync-watchdog` — pg_cron jobid 2가 `net.http_post`로 매시 :15 호출 | **불가 — `supabase/functions/` 디렉토리 자체가 리포에 없음** (Glob 0건) | `cron.job` jobid 2 command 실측 |
| 5. 로컬 PC (Hermes) | 교정 학습 배치(21시) → **2026-08-04 Vercel cron `news-learn-edits`로 이관 완료**, 현재는 안전망 | 불가 | `workspace/codex-newsroom-briefing.md:22` |

**pg_cron 실측** (`SELECT … FROM cron.job`, 24h 실행은 `cron.job_run_details` — 6개 전부 succeeded, 총 1,802회, 실패 0):

| jobid | jobname | schedule | command | 24h 실행 |
|---|---|---|---|---|
| 1 | betman-sync-health-check | */30 | `betman_check_sync_health()` | 48 |
| 2 | betman-edge-watchdog-trigger | 15 * * * * | `net.http_post(...functions/v1/betman-sync-watchdog...)` | 24 |
| 3 | process-temperature-queue | 매분 | `process_temperature_queue(50)` | 1,440 |
| 4 | reset-old-temperatures | 0 4 * * * | `reset_expired_temperatures(7)` | 1 |
| 5 | recalc-user-temperatures | 0 5 * * * | `recalc_all_user_temperatures()` | 1 |
| 6 | update-post-temperatures | */5 | `update_active_post_temperatures()` | 288 |

### Vercel cron 23개 전수 (`vercel.json:2-95`)

CRON_SECRET 검증은 전 라우트 공통으로 `verifyCronSecret()`(`lib/cron-auth.ts:11` — timing-safe, 미설정 시 500 거부). withCronLog는 `lib/cron/log-run.ts:15` 래퍼(성공/에러/소요시간을 `cron_run_log`에 기록, 인증 통과 호출만).

| path | 주기 | 역할 (한 줄) | CRON_SECRET | withCronLog |
|---|---|---|---|---|
| /api/cron/daily-token-reset | 0 14 * * * | 일일 볼 리셋 | route.ts:17 | ✅ :80 |
| /api/cron/discord-daily-digest | 5 14 * * * | 디스코드 뉴스 다이제스트 | :40 | ✅ :136 |
| /api/cron/betman-sync | */30 | betman 경기 상태 전이(Vultr 2h sync 보조) | :35 | ✅ :165 |
| /api/cron/settle-pending | */15 | 고아 pending 정산 안전망 | :21 | ✅ :37 |
| /api/cron/ops-monitor | */30 | DB 헬스 6종 점검→디스코드 | :24 | **❌** |
| /api/wisetoto/sync | 매분 | 라이브 스코어 동기화 | :32 | ✅ :152 |
| /api/cron/weekly-analytics | 0 0 * * 1 | 주간 분석 리포트 | :12 | ✅ :82 |
| /api/cron/metaverse-cleanup-rooms | */30 | 메타버스 방 정리 | :22 | ✅ :57 |
| /api/cron/draft-rooms-cleanup | */5 | 드래프트 이탈 좌석 AI 전환·방 폐기 | :17 | **❌** |
| /api/cron/sync-videos | 0 * | 크리에이터 유튜브 RSS→creator_videos | :71 | **❌** |
| /api/cron/news-expire-drafts | 0 * | 기한 지난 drafted 자동 반려 | :20 | ✅ :70 |
| /api/cron/agg-publish-queue | */10 | 떡밥 발행 분산 큐 워커(F17) | :14 | **❌** |
| /api/cron/news-auto-publish | 7,37 | 뉴스 자동발행(게이트+회당 상한) | :77 | ✅ :490 |
| /api/cron/agg-auto-approve | 25,55 | 떡밥 drafted→approved 자동승인 | :43 | **❌** |
| /api/cron/season-weekly-snapshot | 0 15 * * 0 | 시즌 주간 순위 스냅샷 | :27 | **❌** |
| /api/cron/season-weekly-draw-snapshot | 5 15 * * 0 | 주간 경품 추첨+발표 글 | :42 | **❌** |
| /api/cron/saga-ingest | 12,42 | 티커 2차 소비+해외 RSS→saga_reservoir | :23 | ✅ :126 |
| /api/cron/saga-extract | 3,18,33,48 | ingested→LLM 추출→queued(+조건부 자동발행) | :42 | ✅ :201 |
| /api/cron/saga-deadline | 5 0 * * * | 데드라인 사가 일괄 close | :20 | ✅ :60 |
| /api/cron/hero-editor | 22,52 | 편집장 에이전트 — 메인 히어로 3장 | :23 | ✅ :127 |
| /api/cron/news-interest-filter | 14 * | 관심도 심사 자동 반려 | :91 | ✅ :340 |
| /api/cron/news-learn-edits | 30 13 * * * | 발행 후 수정분→표기 학습 | :64 | ✅ :148 |
| /api/cron/news-assignment-desk | 19 * | shadow 배정 판정(발행 미개입) | :114 | ✅ :366 |

집계: 23개 전부 CRON_SECRET 검증 ✅ / **withCronLog 미적용 7개** (ops-monitor, draft-rooms-cleanup, sync-videos, agg-publish-queue, agg-auto-approve, season-weekly-snapshot, season-weekly-draw-snapshot) — 이 7개는 죽어도 `cron_run_log`에 흔적이 없고 어드민 cron 모니터(`app/admin/system/cron-monitor.tsx`)에 안 보인다. **감시자(ops-monitor) 자신이 무로그**인 점이 특히 아픈 구멍.

### vercel.json에 없는 cron 라우트 7개 (고아/수동/수신)

| 라우트 | 실태 | 근거 |
|---|---|---|
| /api/cron/update-temperatures | **고아.** 주석은 "vercel.json 5분마다"(route.ts:11-14)라 주장하나 미등록. 실제 온도 갱신은 **pg_cron jobid 6**이 같은 RPC를 5분마다 수행 — 주석과 현실이 정반대 | route.ts:14 vs vercel.json 전문 vs cron.job 실측 |
| /api/cron/reddit-seed-posts | 미등록(중단). **CLAUDE.md:93은 "6시간마다"라 기술 — 문서가 낡음.** withCronLog(:336)는 남아 있음 | vercel.json 전문 |
| /api/cron/season-chicken-draw | 주석 "매일 23:10 KST"(route.ts:11) vs 미등록. withCronLog 없어 실행 여부 로그로도 추적 불가 | route.ts:11 |
| /api/cron/saga-test-publish | 수동 배치 발행 도구 — 주석 스스로 "vercel.json 미등록" 명시 | route.ts:11 |
| /api/cron/saga-queue-publish | 수동 CLI 발행 도구 — 동일 명시 | route.ts:14 |
| /api/cron/naming-audit | 표기 소급 교정 수동 도구 — 동일 명시 | route.ts:14 |
| /api/cron/standings/ingest | cron 아님 — **VPS 스크래퍼가 POST하는 수신 엔드포인트** | route.ts:19-21 |

### CRON_SECRET로 보호되는 머신 API (cron 아님 — VPS↔Vercel 통신로)

- betman 계열 11개: `app/api/betman/{results,settle,scores,games(POST),manual-sync,sync-state,round,pending-results,expire-pending,unknown-games,stats/recalculate}` (각 파일 `verifyCronSecret` — grep 실측)
- 뉴스 계열 3개: `app/api/news/agent-draft/route.ts:72`(VPS 스캐너 초안 push), `news/heat/route.ts:33`, `news/correction-examples/route.ts:34`
- `app/api/cron/standings/ingest/route.ts:24`

---

## ② 큐·비동기·재시도·멱등

### 진짜 큐는 없다

- 외부 큐/작업 큐 라이브러리 0개 — `package.json`에 bull/sqs/qstash/inngest/pg-boss 등 검색 0건.
- 실행 모델 = **Vercel Cron 폴링 + DB status 필드 상태 기계**가 전부. 유일하게 "큐답게" 시간 분산까지 하는 곳은 `agg_reservoir`의 `approved + scheduled_at`(`app/api/cron/agg-publish-queue/route.ts:20-26` — 도래분 3건씩 순차 게시).

### 대체물 전수 — DB status 상태 기계 (분포는 2026-08-06 프로덕션 실측)

| 테이블 | 상태 전이 세트 | 실측 분포 | 근거 |
|---|---|---|---|
| news_reservoir | fetched→normalized→drafted→{published, rejected, credibility_rejected, desk_held, desk_rejected, duplicate} | rejected 1,160 / credibility_rejected 298 / published 290 / drafted 85 / desk_held 26 / desk_rejected 25 / normalized 4 / duplicate 1 | DB 실측 + `lib/news/publish.ts:211`, `news-expire-drafts:30` |
| agg_reservoir | `ingested→fetched→drafted→approved→published \| rejected` (DDL 주석 그대로) | published 119 / drafted 53 / rejected 17 / fetched 17 | `supabase/migrations/20260722c_agg_reservoir.sql:15` |
| saga_reservoir | CHECK(`ingested,extracted,clustered,queued,approved,published,rejected,discarded`) | queued 75 / published 70 / discarded 38 / rejected 9 | `20260805_saga_reservoir.sql:27-28` |
| news_candidates (shadow 원장) | 20종 state CHECK (discovered…published, held, retry_wait, dead_letter, needs_human 등) | 1,887행 | `20260808_news_candidate_ledger.sql:14-21` |
| news_assignments (shadow) | status: ok / retry_wait / **dead_letter** — 코드베이스에서 DLQ 개념이 있는 유일한 곳 | 587행 | `20260809_news_assignment_desk.sql:33` |
| pending_refunds / pending_seller_rewards | 자동 재시도 소진분 → **사람이 소비하는 수동 큐** (/admin/operations) | — | `prod_schema.sql:5891,5910`, `ops-monitor:154-168` |
| temperature queue | pg_cron `process_temperature_queue(50)` 매분 — DB 내부 큐 | — | cron.job jobid 3 실측 |

### `after()` (응답 후 실행) 전수 — 6곳

| 위치 | 용도 |
|---|---|
| `lib/news/publish.ts:279` | 발행 기사→사가 연표 링크 |
| `lib/news/publish.ts:294` | VS 폴 생성 |
| `lib/news/publish.ts:303` | 데스킹 편집→표기 학습 (주석: "실패해도 무해") |
| `app/api/admin/news-review/route.ts:122` | 반려 시 편집분 학습 |
| `app/api/admin/published-fixes/route.ts:170` | 발행 후 수정→학습 |
| `app/api/admin/published-fixes/route.ts:198` | 사가 헤드라인 수정→학습 |

서버 측 fire-and-forget(`void`): `app/api/metaverse/chat-rooms/route.ts:96`, `chat-rooms/[id]/route.ts:43`, `admin/metaverse/chat-rooms/[id]/route.ts:50` (Realtime broadcast). 디스코드 알림은 await하되 실패를 삼키는 준-fire-and-forget (`lib/discord-notify.ts:34-59`).

### 재시도 메커니즘 전수

**재시도 있는 곳:**

| 위치 | 정책 | 실패 종착 |
|---|---|---|
| `lib/betman/settle.ts:38` (retryRefund) | 3회, 500ms×n 백오프 | pending_refunds 기록 (:62-69) |
| `lib/betman/refund-tokens.ts:20` | 3회, 동일 백오프 | pending_refunds (:35-37) |
| `lib/predictions/retry-seller-reward.ts:36` | 3회 | pending_seller_rewards (:48-58) |
| `lib/betman/http-client.ts:26-48` (fetchWithRetry) | 지수 백오프+지터, **4xx는 즉시 포기**(:39) | throw |
| `lib/news/assignment-desk.ts:75,83,514-531` | 일반 실패 3회 / 계약 위반 2회 → retry_wait/dead_letter 분류 | dead_letter (부분 유니크로 재호출 봉인) |
| `app/api/cron/saga-extract/route.ts:23` | "배치 실패는 상태를 건드리지 않는다 — **다음 회차가 재시도**" (암묵 재시도) | discarded는 사유와 함께 종착 |
| news-auto-publish 게이트 | 불통과 시 drafted 유지 → 30분마다 재평가, 기한 도래 시 news-expire-drafts가 rejected — 사실상 "만료까지 무한 재시도" | rejected |
| `lib/draft/rooms.ts:114-116` | invite_code 충돌 5회 | 에러 |
| `lib/embed/instagram-loader.ts:21` | 클라 폴링 100회(10초) | 포기 |

**1회 실패 = 끝 (재시도 없음):**

| 위치 | 실태 |
|---|---|
| `app/api/cron/agg-publish-queue/route.ts:43` | 게시 실패 → 즉시 `status: "rejected"` (reject_reason `queue: …`) — **복구 경로 없음** |
| `lib/cron/log-run.ts:49-51` | cron_run_log insert 실패 무시 (best-effort) |
| `lib/discord-notify.ts:58` | 웹훅 실패 삼킴 — 알림의 알림 없음 |
| `lib/news/publish.ts:223` | 포스트 생성 후 reservoir 갱신 실패 시 의도적으로 실패 응답 안 함(재시도가 중복 글을 만들므로) — 대신 성공 취급 |
| `20260808_news_candidate_ledger.sql:5` | "ledger 기록 실패를 발행 실패로 취급하지 않는다" |
| Vercel cron 호출 자체 | 라우트가 실패해도 다음 스케줄까지 대기 (추정: Vercel 플랫폼은 실패 재시도를 하지 않음 — 리포 내 증거 없음) |

### 멱등 장치 전수 (migrations Grep)

| 장치 | 근거 |
|---|---|
| saga_reservoir.source_url UNIQUE (ingest 재실행 안전, upsert ignoreDuplicates) | `20260805_saga_reservoir.sql:15`, `saga-ingest/route.ts:14` |
| sagas.identity_key UNIQUE | `20260804_saga_core.sql:19` |
| saga_entries (saga_id, cluster_key) UNIQUE — "중복=에코 접힘" | `20260804_saga_core.sql:68`, `saga-extract:30` |
| saga_settlements PK(saga_id, user_id) — 정산 멱등 원장 | `20260805:50` |
| news_assignments (candidate_id, content_hash, prompt_version) **부분 유니크 ×2** (ok / dead_letter) — "애플리케이션 판단에만 맡기면 재배포·중복 cron에서 샌다" | `20260809:80-85` |
| news_candidate_events (candidate_id, run_id, to_state, reason_code) 부분 유니크 | `20260808:69-71` |
| agg_reservoir.source_url UNIQUE | `20260722c:9` |
| token/gold_transactions (user_id, idempotency_key) 부분 유니크 | `prod_schema.sql:8776,8260` |
| prediction_slips.idempotency_key 부분 유니크 | `prod_schema.sql:8604` |
| betman_predictions (user_id, game_id) WHERE status IN (pending, settled) | `prod_schema.sql:8788` |
| season 추첨: (event_id, draw_date) / (event_id, week_start) unique — "재실행해도 이중 추첨 없음" | `season-chicken-draw:18`, `season-weekly-draw-snapshot:31` (주석 — DDL은 20260801b/20260803 마이그레이션) |
| **news_reservoir.dedupe_key는 UNIQUE가 아니라 일반 인덱스** — DB 강제 없음. 멱등은 agent-draft가 `id = slugId(dedupe_key)`로 PK에 접어서 확보 | `prod_schema.sql:8400` (CREATE INDEX, not UNIQUE), `app/api/news/agent-draft/route.ts:21,101` |

---

## ③ 관측·로그·수정 이력 지도

### cron_run_log (유일한 실행 계측 원장)

- 스키마: job_name / status(success·error) / http_status / error_message / duration_ms / started_at — **원본 DDL은 `supabase/migrations-backup/20260520_cron_run_log.sql`에만 있고 현행 migrations/에는 스쿼시본(`00000000000001_prod_schema.sql`)에 포함.**
- 총 125,269행. **최근 24h 실측 (16 job, 에러 0건):**

| job | 24h 실행 | 평균 ms | | job | 24h 실행 | 평균 ms |
|---|---|---|---|---|---|---|
| wisetoto-sync | 1,440 | 3,930 | | news-assignment-desk | 24 | 7,757 |
| settle-pending | 96 | 317 | | news-interest-filter | 24 | 3,173 |
| saga-extract | 96 | 1,284 | | news-expire-drafts | 24 | 739 |
| hero-editor | 49 | 4,979 | | daily-token-reset | 1 | 10,385 |
| betman-sync | 48 | 2,562 | | discord-daily-digest | 1 | 937 |
| news-auto-publish | 48 | 13,544 | | news-learn-edits | 1 | 36,437 |
| saga-ingest | 48 | 1,459 | | saga-deadline | 1 | 0 |
| metaverse-cleanup-rooms | 48 | 342 | | **naming-librarian** | 1 | 30,491 |

- `naming-librarian`(08-05 15:40 1회)은 **리포에 라우트가 없는 폐기 cron의 흔적** — `app/api/admin/player-dictionary/route.ts:20` 주석이 폐기를 확인. weekly-analytics는 주 1회라 24h 창 밖(정상).
- 소비처: `app/admin/system/cron-monitor.tsx` + `app/admin/system/page.tsx`.

### 알림 지도 — 무엇이 울리고 무엇이 침묵하는가

**울리는 것** (`lib/discord-notify.ts` → `DISCORD_OPS_WEBHOOK_URL`, 호출처 grep 실측 4곳):
1. `ops-monitor`(30분) — betman sync 지연(>3h)·티커 지연(>2h)·**news_reservoir 신선도(>3h)·agg_reservoir 신선도(>6h)** — VPS 프로세스가 아니라 산출물로 감지(route.ts:76-79 "cron이 돈다 ≠ 파이프라인이 산다")·미정산 고아·환불 큐·고아 슬립·locked_odds 누락. 지속 이상은 30분마다 재알림.
2. `instrumentation.ts:61-73` onRequestError — 서버 미처리 에러 전부 → Sentry + `alertServerError`(`lib/ops-error-alert.ts` — 경로+지문 기준 10분 쿨다운, 프로덕션 한정, 진단 사전 13종 첨부).
3. `app/api/reports/route.ts` 신고 접수, `app/api/news/agent-draft/route.ts` 초안 도착.

**침묵하는 것:**
- withCronLog 없는 cron 7종의 실패 (①의 표) — 로그도 알림도 없음.
- `after()` 6곳의 실패 (사가 링크·VS 폴·학습) — 전부 무해 처리.
- 디스코드 웹훅 자체의 실패 (discord-notify.ts:58 — 삼킴).
- agg-publish-queue의 개별 발행 실패 — rejected로 조용히 종착 (reject_reason 컬럼에만).
- saga-extract의 discard — `error` 컬럼에 사유만.
- alertServerError는 `NODE_ENV !== "production"`이면 완전 무음 (ops-error-alert.ts:180).

### 후보 원장 (관측 인프라로서, 실측)

- news_candidates **1,887행** / news_candidate_events **1,762행** / news_assignments **587행** (shadow — `NEWS_ASSIGNMENT_DESK=shadow`일 때만 적재, 발행 미개입 — `news-assignment-desk/route.ts:24-37,117-123`).
- 정체 후보 재기록 억제: `news-auto-publish/route.ts:164-181` — "24h 이벤트 744건 중 601건이 정체 후보 52개의 needs_human 재기록" 사고 후 같은 판정 재기록 금지.
- 이벤트 멱등: run_id 단위 유니크 (`20260808:69-71`), run_id 생성은 `lib/news/candidate-ledger.ts:47`.

### 데이터 수정 이력 — "누가 언제 뭘 바꿨나"에 답할 수 있는 범위

| 경로 | 무엇을 기록 | 근거 |
|---|---|---|
| `publish.pre_edit` + `publish.auto` | 봇 기사: 검수자 수정 전 원본 + 자동/수동 발행 구분 | `lib/news/publish.ts:206-216,63` |
| published-fixes API | 발행 후 수정(기사 본문·사가 헤드라인) → after()로 학습까지 | `app/api/admin/published-fixes/route.ts:168-200` |
| news-learn-edits cron | 발행원본↔현재 diff → 표기 사전 자동 등재 | `app/api/cron/news-learn-edits/route.ts` |
| settlement_audit_log | 정산·환불·취소 이벤트 + actor(`cron:settle` 등) + before/after | `20260528_create_settlement_audit_log.sql:22-39`, `lib/betman/settle.ts:435` |
| **admin_audit_logs** | 관리자 행위(action/target/details/IP) — 호출처 16개 라우트 (content/*, role, adjust-economy, refunds, betman resync, notice, admin2 bulk) | `lib/admin/audit.ts:12-29` + grep 실측 |
| news_candidate_events | 상태 전이의 actor/reason_code/run_id (append-only) | `20260808:38-62` |
| agg_reservoir.audit (jsonb append) | 단계별 처리 이력, `stage=auto-approve`로 자동/수동 구분 | `20260722c:18`, `agg-auto-approve:26` |
| sagas.updated_at / saga_reservoir.updated_at | **시각만 — 내용 diff 없음** | `20260804:…`, `saga-deadline:35` |

**답할 수 없는 질문:** 일반 유저 posts/comments의 편집 이력(버전 테이블 없음 — updated_at뿐), 사가 연표 entry의 published-fixes 밖 수정, 표기 사전 수동 삭제/변경 이력, 폴·이벤트 설정 변경 이력, env 킬스위치(NEWS_AUTO_PUBLISH 등) 토글 이력(Vercel 대시보드 — 리포 밖), pg_cron 잡의 등록/변경 이력(마이그레이션에 없음).

---

## ④ 시크릿·환경변수·배포

### `lib/env.ts` zod 스키마 (키 이름만)

- 서버(:7-34): SUPABASE_SERVICE_ROLE_KEY, CLERK_SECRET_KEY, CRON_SECRET (이상 필수) / FACEBOOK_ACCESS_TOKEN, NEWS_AUTO_PUBLISH, AGG_AUTO_APPROVE, DISCORD_OPS_WEBHOOK_URL, DISCORD_NEWS_WEBHOOK_{ARSENAL,LIVERPOOL,CHELSEA,FOOTBALL}, DISCORD_DIGEST_WEBHOOK_URL, DISCORD_DIGEST_MENTION, DISCORD_BOT_TOKEN, DISCORD_APP_PUBLIC_KEY, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_STREAM_API_TOKEN, SENTRY_{ORG,PROJECT,AUTH_TOKEN} (optional)
- 클라(:40-52): NEXT_PUBLIC_{SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, CLERK_PUBLISHABLE_KEY, SITE_URL, SENTRY_DSN, ADSENSE_ID, GA_ID}

### `.env.example` 대조 — 두 방향 모두 구멍

- **.env.example에 없는 스키마 키 13개**: NEWS_AUTO_PUBLISH, AGG_AUTO_APPROVE, DISCORD_* 8종, CLOUDFLARE_* 2종 — 새 환경 세팅 시 문서만으로는 존재를 모름.
- **zod 스키마 밖에서 `process.env` 직접 참조하는 키 (검증 無)** — grep 실측:
  - **OPENAI_API_KEY — 12개 파일** (quality-gate, vs-issue, learn-corrections, naming/verify, admin/insight, saga/extract, og, hero-editor, news-interest-filter, news-assignment-desk, naming-audit, reddit-seed-posts). **뉴스룸 LLM 파이프라인 전체가 미검증 키에 의존** — 누락 시 빌드 통과, 런타임에 hero-editor는 조용히 skip(route.ts:28), assignment-desk는 500(route.ts:126-128)으로 각자 다르게 죽음.
  - NAVER_CLIENT_ID / NAVER_CLIENT_SECRET (`lib/naming/verify.ts:75-76`), GA4_SERVICE_ACCOUNT_EMAIL / GA4_SERVICE_ACCOUNT_PRIVATE_KEY / GA4_PROPERTY_ID (`lib/ga4/client.ts:8-26`), SAGA_CARD_ROUTING (`lib/feed/cardnews.ts:355`), ADMIN_INSIGHT_MODEL (`lib/admin/insight.ts:20`), DISCORD_EVENT_WEBHOOK_URL (`season-chicken-draw:168`), NEWS_ASSIGNMENT_DESK (`news-assignment-desk:117`), NEXT_PUBLIC_APP_URL(.env.example:33에만 — 스키마에 없음).

### service role 키

- `createServiceRoleClient` — **393회 / 171개 파일** (app+lib, grep count 실측). 정의는 `lib/supabase/server.ts:67,79`에서 `SUPABASE_SERVICE_ROLE_KEY` 참조.
- 노출 방지: NEXT_PUBLIC 접두사 없음(클라 번들에서 undefined) + 신규 파이프라인 테이블은 일관되게 "RLS on + 정책 0개 = service role 전용" (`20260805:64-66`, `20260809:99-100`, `20260722c:26`, `20260808:73-74`).

### 배포 구조 (문서 근거)

| 대상 | 방식 | 근거 |
|---|---|---|
| Vercel 앱 | push → 자동 배포, PR마다 preview + GH Actions lint/test. **push는 사용자 수동**(Claude는 커밋까지) | `CLAUDE.md:160,14` |
| Vultr VPS | git 밖 파일 — 리포 수정으로 안 바뀜, 별도 반영 필요. 원칙 "VPS 무수정" | `codex-newsroom-briefing.md:21,108`, `CLAUDE.md:189` |
| DB 마이그레이션 | 파일 추가 후 **수동 적용** (Supabase MCP 또는 Management API) | `CLAUDE.md:118` |
| pg_cron / Edge Function | **배포 경로가 리포에 아예 없음** — 마이그레이션에도 cron.schedule 없음, `supabase/functions/` 부재 | Glob·Grep 0건 + DB 실측 |

**로컬-원격 마이그레이션 이력 갈라짐 (실측):** 로컬 `supabase/migrations/`는 스쿼시 baseline(`00000000000001_prod_schema.sql`)+59파일이고 그 이전 이력은 `migrations-backup/`으로 이동(cron_run_log DDL이 그 예). 원격 `supabase_migrations.schema_migrations`의 version은 **적용 시각 타임스탬프**라 파일명 날짜와 다르다 — 예: `20260809_news_assignment_desk`가 version `20260805045437`로 적용됨(파일명이 조사일 08-06보다 미래인 08-08·08-09 라벨). 파일명은 정렬용 라벨일 뿐, 실제 적용 순서의 정본은 원격 원장이다.

---

## ⑤ 테스트 커버 맵

### Unit (`__tests__/` — Vitest): 101파일 / 1,144케이스

케이스 수는 행 선두 `it(|test(` grep 카운트(=추정치, `it.each` 미포함).

| 영역 | 파일 | 케이스 | 대표 |
|---|---|---|---|
| 뉴스룸(발행·게이트·원장·표기·모더레이션) | 17 | 165 | assignment-desk 36, news-auto-publish 17, ad-filter 19 |
| 사가 | 5 | 45 | identity 25, confirmation 8, saga-deadline 3 |
| 베트맨·정산·예측 | 13 | 151 | daily-round 23, prediction-route 22, settle 15+9 |
| 경제(볼·골드·결제·포인트) | 5 | 44 | points 13, portone 11 |
| 이벤트·월드컵·배틀 | 6 | 65 | weekly-draw 17, worldcup-vote 13 |
| 커뮤 코어(글·댓글·알림·피드·온도) | 11 | 138 | temperature 23, posts 20 |
| 에디터·임베드·이미지 | 10 | 147 | tiptap sanitize 25, tiptap-embeds 24 |
| 인프라·미들웨어·보안·어드민 | 20 | 187 | security 22, pipeline-status 19, ops-error-alert 16, cron-auth 12 |
| 게임(드래프트·메타버스·스타디움·베팅 UI) | 9 | 155 | **draft/engine 78**, use-betting-slip 18 |
| 유틸·상수·standings·transfer | 5 | 47 | standings/column-map 15 |

### 테스트 0인 영역 (강조)

- **wisetoto** — 매분 도는 최다 실행 cron(24h 1,440회)인데 unit 0.
- **lib/agg/publish** — 떡밥 발행 로직 본체 (api 게이트 테스트 agg-auto-approve 5개만 존재).
- **사가 파이프라인의 LLM·발행 절반** — extract/create/publish/season/votes lib 0 (identity·cluster·confirmation·url-fold만 있음).
- **뉴스 에이전트 cron 군** — hero-editor, news-interest-filter, news-learn-edits, learn-corrections, vs-issue, naming/verify(네이버 검증) 0.
- **cron 라우트 자체** — betman-sync, settle-pending, saga-ingest/extract, agg 2종, season 3종 라우트 레벨 0 (lib만 일부 커버).
- **admin 라우트 대부분** — news-review, published-fixes, polls, content/* 0 (role-change·adjust-economy·admin2-funnel만 있음).
- **standings ingest API·스크레이퍼, stadium/gold 경제 경로, draft rooms API(multi-engine), metaverse realtime 채널** 0.
- **`scripts/` 전부, `data/agents/`·`data/crawlers/` 서브패키지 전부** — 테스트 파일 0 (Glob 실측).

### e2e 3계열

| config | testDir | 파일 | 대상 영역 | 비고 |
|---|---|---|---|---|
| `playwright.config.ts:8` | `e2e/` | 14 spec | 홈·글쓰기·포스트·예측·검색·내비·반응형·에러·스타디움·메타버스·API 스모크·임베드·온도·인터랙티브 | 5개 브라우저 프로젝트, BASE_URL로 외부 대상 가능 |
| `playwright.e2e.config.ts:27` | `tests/e2e/journeys/` | 40 spec | guest 11 / member 26 / admin 2 / smoke 1 — 가입·글·댓글·베팅·상점·메타버스 여정 | 포트 3100 + 로컬 Supabase 격리(:5-9), globalSetup/Teardown |
| `playwright.audit.config.ts:12` | `tests/audit/` | 2 spec | 프로덕션 BFS 크롤 + Core Web Vitals | webServer 금지(:33), 관찰 전용 |

**파이프라인 e2e 공백:** 뉴스룸·사가·떡밥 파이프라인(수집→게이트→발행)은 세 계열 어디에도 없다 — journeys의 `guest/saga.spec.ts`는 열람 UI 여정만.

---

## 요약 — 구조적 관찰 5가지

1. **스케줄러가 5층인데 리포가 정본인 층은 1개뿐** — pg_cron 6잡과 Edge Function(betman-sync-watchdog)은 소스·마이그레이션·문서 어디에도 없고 DB 조회로만 발견된다. update-temperatures 고아 라우트는 그 갈라짐의 화석.
2. **큐는 없고 전부 "cron 폴링 + status 컬럼"** — 그 대신 멱등을 유니크 인덱스로 거는 규율은 최신 테이블일수록 강함(news_assignments 부분 유니크 2종이 정점). 단 news_reservoir.dedupe_key는 DB 강제가 아니라 코드 관례.
3. **관측은 "돈과 산출물" 중심으로 편향** — 돈 경로(ops-monitor 6체크·settlement_audit_log)와 뉴스 신선도는 촘촘하지만, cron 7종(감시자 포함)은 무로그·무알림이고 after() 부수효과 실패는 전부 침묵.
4. **env 검증의 최대 사각 = OPENAI_API_KEY(12파일)** — LLM 파이프라인 전체가 zod 밖 키에 의존하고, 누락 시 라우트마다 skip/500으로 제각각 죽는다.
5. **테스트는 도메인 로직에 몰려 있고(1,144케이스) 실행 계층이 비어 있다** — cron 라우트·wisetoto·agg/사가 발행 본체·scripts·data 서브패키지가 0. e2e 3계열도 UI 여정용이라 파이프라인 회귀는 오직 프로덕션 실측(cron_run_log·ops-monitor)에 기대고 있다.

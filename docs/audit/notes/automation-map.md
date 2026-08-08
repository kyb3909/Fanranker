# 자동화/cron 전수 지도 (Phase 3)

> 작성: 2026-08-08. 근거: 각 라우트 실독 + `vercel.json` + `docs/PG_CRON_JOBS.md` + 라이브 `cron_run_log` 24h/7d 실측(메인 세션 제공).
> "실행 근거" 열의 숫자 = 최근 24시간 success 횟수 (실패 0건). 미확인은 ❓.

## 1. 메인 표 — Vercel Cron 27개

| 이름 | 스케줄(UTC) | 하는 일(1줄) | 읽는 테이블 | 쓰는 테이블 | 실패 시 동작/알림 | 실제로 도는 근거 |
|---|---|---|---|---|---|---|
| wisetoto-sync (`app/api/wisetoto/sync/route.ts`) | `* * * * *` | wisetoto.com 라이브 스코어 수집 + 25초 쿨다운 (브라우저 폴링 겸용) | betman_sync_state, betman_games | betman_games(스코어), betman_sync_state | 500 응답 → cron_run_log error (`route.ts:152` withCronLog) | 24h 1438회 |
| daily-token-reset | `0 14 * * *` | 유저별 `reset_user_daily_tokens` RPC 50명 배치 (23:00 KST 경계) | user_tokens | user_tokens(RPC) | 개별 실패는 errorCount 집계, 전체 실패 apiError 500 (`route.ts:26,52-58`) | 24h 1회 |
| discord-daily-digest | `5 14 * * *` | 볼 리셋+새 슬레이트+인기뉴스 디스코드 다이제스트 1건 | events, betman_games, posts | (없음 — 디스코드 발송만) | 웹훅 env 미설정 시 skip (`route.ts:43-45`), 에러 apiError | 24h 1회 |
| betman-sync | `*/30 * * * *` | betman 동기화 워치독 — staleness 감시 + 라운드 생명주기 + VPS resync 플래그 (직접 크롤 안 함, `route.ts:13-24`) | betman_sync_state, betman_games, betman_rounds | betman_games, betman_rounds, betman_sync_state | apiError 500 → cron_run_log (`route.ts:161,165`) | 24h 49회 |
| settle-pending | `*/15 * * * *` | 고아 pending 픽 안전망 정산 스윕 (`lib/betman/settle-sweep.ts:43-52`) | betman_predictions, betman_games | betman_predictions, prediction_slips(+정산 부속, `lib/betman/settle.ts`) | 개별 실패 errors 배열, 전체 apiError 500 (`route.ts:33`) | 24h 97회 |
| ops-monitor | `*/30 * * * *` | DB 헬스 신호 8종 점검 → 이상 시 디스코드 알림 (§4 참조) | betman_sync_state, news_ticker_items, news_reservoir, news_candidates, agg_reservoir, betman_predictions, pending_refunds, prediction_slips, cron_run_log | (없음 — 디스코드만) | 체크별 try/catch 개별 무해화 (`route.ts:51-53` 등) | 24h 48회 |
| weekly-analytics | `0 0 * * 1` | GA4 주간 리포트 생성·저장 | weekly_analytics_reports(중복 체크) | weekly_analytics_reports | 기존 리포트 있으면 skip (`route.ts:29-43`), 에러 apiError | 7d 1회 (8/3) |
| metaverse-cleanup-rooms | `*/30 * * * *` | 2h 비활성 방 close + room:closed broadcast | metaverse_chat_rooms | metaverse_chat_rooms | 500 응답 (`route.ts:35-37`), broadcast는 best-effort (`:41`) | 24h 48회 |
| draft-rooms-cleanup | `*/5 * * * *` | 30초 disconnect 좌석 AI 전환 + 30분 방치 방 abandoned (`lib/draft/multi-engine.ts`) | draft_rooms, draft_room_seats, draft_room_picks | draft_rooms, draft_room_seats, draft_room_picks, draft_room_messages | try/catch 500 (`route.ts:27-35`) | 24h 288회 |
| sync-videos | `0 * * * *` | 크리에이터 유튜브 RSS → creator_videos upsert | (RSS 외부) | creator_videos | 크리에이터별 error 문자열 수집 (`route.ts:36`) | 24h 23회 |
| news-expire-drafts | `0 * * * *` | drafted 24h 초과 자동 반려 (브레이킹은 48h 유예, `route.ts:15-22`) | news_reservoir | news_reservoir, news_candidate_events | 500 응답 (`route.ts:40-42`) | 24h 25회 |
| agg-publish-queue | `*/10 * * * *` | approved+시각 도래 커뮤글 최대 3건 게시 (F17 분산) | agg_reservoir | posts, agg_reservoir | 실패 항목 rejected 강등으로 큐 막힘 방지 (`route.ts:41-46`) | 24h 143회 |
| news-auto-publish | `7,37 * * * *` | 뉴스 초안 자동발행 — 검사관·표기사전·중복·오피셜 대조 게이트 후 회당 2건 (`route.ts:59-62`) | news_reservoir, news_alias_dictionary, team_dictionary, posts, news_candidates | posts, post_flair_map, news_reservoir, news_candidate_events, news_alias_dictionary(검증 루프 등재) | env `NEWS_AUTO_PUBLISH!=on`이면 skip (`:98`); 발행 실패는 drafted 잔류→재시도 (`:604-616`); 브레이킹 막힘은 디스코드 즉시 알림 (`:244-253`) | 24h 48회 |
| agg-auto-approve | `25,55 * * * *` | drafted 커뮤글 자동승인 → 발행 큐(approved+scheduled_at) | agg_reservoir | agg_reservoir | env `AGG_AUTO_APPROVE=off`면 skip (`route.ts:47-49`) | 24h 47회 |
| season-weekly-snapshot | `0 15 * * 0` | 팬덤 대항전 주간 순위 스냅샷 (월 00:00 KST 발표) | events, event_groups, prediction_slips 계열(`lib/event/season-stats.ts`) | event_leaderboard_snapshots | 이벤트 미오픈/개막 전 no-op (`route.ts:38-43`) | ❓ 실측 안 함 |
| season-weekly-draw-snapshot | `5 15 * * 0` | 주간 경품 추첨 백단 확정 + 발표 글 게시 | events, event_registrations 계열(`lib/event/weekly-draw.ts`) | season_weekly_draws, posts | (event_id, week_start) unique + drawn_at 확인 — 재실행 안전 (`route.ts:32`) | ❓ 실측 안 함 |
| saga-ingest | `12,42 * * * *` | 티커 2차 소비 + 해외 RSS → saga_reservoir 적재만 (발행 없음) | news_ticker_items | saga_reservoir (upsert `onConflict: source_url, ignoreDuplicates` `route.ts:112`) | 티커 조회 실패 500 (`route.ts:41-43`) | 24h 48회 |
| saga-extract | `3,18,33,48 * * * *` | ingested → LLM 추출 → queued → 조건 충족 시 자동 발행 + unknown_player 자가 재평가 | saga_reservoir, news_alias_dictionary | saga_reservoir, sagas, saga_entries, saga_article_links(`lib/saga/publish.ts`) | 배치 실패 상태 유지→다음 회차 재시도 (`route.ts:25,82`); 클럽 모순 시 디스코드 warn (`:160-166`) | 24h 96회 |
| saga-deadline | `5 0 * * *` | 마감(9/1 09:00 KST) 후 active 사가 일괄 종결 (정산 없음, 로그만) | sagas | sagas | 마감 전/전부 닫힘 no-op — 멱등 (`route.ts:17,23-25`) | 24h 1회 |
| hero-editor | `22,52 * * * *` | LLM 편집장 — 메인 히어로 3장 선정 + 이유 기록 | posts, saga_article_links | agent_picks (upsert `route.ts:114`) | API 키 없음/픽 없음 skip — 기존 픽 유지, 규칙 폴백 존재 (`route.ts:17,110-111`) | 24h 48회 |
| news-interest-filter | `14 * * * *` | LLM 관심도 심사 — 무관심 기사만 반려 (애매하면 유지, `route.ts:20-24`) | news_reservoir | news_reservoir, news_candidate_events | LLM 미가동 시 판정 null → 유지 (`route.ts:49-50`) | 24h 24회 |
| news-learn-edits | `30 13 * * *` | 발행 후 운영자 수정 diff → 표기 사전 자동 등재 (22:30 KST) | posts, news_reservoir | news_alias_dictionary(`lib/news/learn-corrections.ts:108-164`), news_reservoir(audit) | 로컬 Hermes 의존 제거한 기본 경로 (`route.ts:15-21`) | 7d 2회, **8/7 회차 무기록 결번** |
| news-assignment-desk | `19 * * * *` | 어사인먼트 데스크 **shadow 전용** — 판정을 news_assignments에만 append (`route.ts:24-38`) | news_reservoir, news_candidates(읽기만) | news_assignments | env `NEWS_ASSIGNMENT_DESK=shadow` 아니면 LLM 0회 즉시 종료 (`:31-34`) | 24h 24회 |
| standings-refresh | `0 23 * * *` | 네이버 api-gw 순위표 수집 → standings_cache (08:00 KST). VPS 스크레이퍼 5개월 정지 사고의 이식 (`route.ts:15-18`) | (네이버 외부) | standings_cache (upsert `route.ts:53`) | 리그별 fail 집계 (`route.ts:40-51`) | 24h 1회 |
| match-mapping-shadow | `41 * * * *` | betman↔Soccerway 매핑 shadow 판정 — match_mapping_attempts에만 기록, betman_games 불가침 (`route.ts:14-16`) | betman_games, team_dictionary | match_mapping_attempts | env `MATCH_MAPPING_SHADOW=shadow` 아니면 skip (`route.ts:24-26`) | 24h 24회 |
| news-comment-reports | `26 * * * *` | 봇 기사 댓글 오류 제보 감지 → 적재 + 디스코드 (자동 수정 없음, `route.ts:16-18`) | comments, posts | news_error_reports (upsert `onConflict: comment_id` `route.ts:151-152`) | 조회 실패 500 (`route.ts:44`) | 24h 24회 |
| invariant-audit | `44 * * * *` | 2층 감사관 — 불변식 4종(사가 한글 제목·크론 심박·발행쌍 중복·표기 흔들림) 검사 (`route.ts:25-30`) | sagas, cron_run_log, posts, news_alias_dictionary, invariant_findings | invariant_findings | fingerprint 원장, open 전이 시 1회만 디스코드 (`route.ts:33-34`); 부분 실패 시 resolve 금지 (`:198-200`) | ❓ **24h 실측 목록에 없음** — 8/8 신설, 미배포(미push) 가능성 |

## 2. Vercel 외 자동화

### pg_cron 6개 — **전부 리포에 정의 없음 (드리프트)**. `supabase/migrations/`에 `cron.schedule` 0건, 정본은 DB + `docs/PG_CRON_JOBS.md:35-39`

| jobname | schedule | command | 비고 |
|---|---|---|---|
| betman-sync-health-check | `*/30 * * * *` | `betman_check_sync_health()` | 리포에 정의 없음(드리프트) |
| betman-edge-watchdog-trigger | `15 * * * *` | `net.http_post` → Edge Fn `betman-sync-watchdog` | 리포에 정의 없음(드리프트) + URL·서비스 키가 command에 내장 (`PG_CRON_JOBS.md:40`) |
| process-temperature-queue | `* * * * *` | `process_temperature_queue(50)` | 리포에 정의 없음(드리프트) |
| reset-old-temperatures | `0 4 * * *` | `reset_expired_temperatures(7)` | 리포에 정의 없음(드리프트) |
| recalc-user-temperatures | `0 5 * * *` | `recalc_all_user_temperatures()` | 리포에 정의 없음(드리프트) |
| update-post-temperatures | `*/5 * * * *` | `update_active_post_temperatures()` | 리포에 정의 없음(드리프트). 동일 RPC의 Vercel 라우트가 고아로 잔존 (§3) |

### Supabase Edge Function 1개

| 이름 | 트리거 | 비고 |
|---|---|---|
| betman-sync-watchdog | pg_cron jobid 2, 매시 :15 | **소스가 리포 어디에도 없음** (`docs/PG_CRON_JOBS.md:4`, `supabase/functions/` 부재) — 재구축 불가 리스크 ❓내용 미확인 |

### VPS 상주 (Vultr 서울, `/opt/*` — 전부 저장소 외부, 리포엔 사본만)

| 프로세스 | 주기 | 하는 일 | DB 접점 | 감시 |
|---|---|---|---|---|
| `/opt/betman/sync.sh` | 2시간 | betman 경기/배당 크롤 → API POST | betman_games·rounds·sync_state (API 경유) | ops-monitor가 sync_state 신선도 3h 감시 (`ops-monitor/route.ts:32-50`) |
| `/opt/betman/fetch-results.sh` | 15분(백필 포함) | 결과 수집 → `/api/betman/results`·`scores` POST | betman_games, betman_predictions(정산 트리거) | 동일 + settle-pending 안전망 |
| `/opt/crawlers/runner.js` | 10분 | Reddit+Naver 티커 upsert | news_ticker_items | ops-monitor 티커 신선도 2h (`:55-73`) |
| `/opt/news-scanner` | 15분 | 기사 초안 생성 → `/api/news/agent-draft` POST, 화력 `/api/news/heat` POST | news_reservoir | ops-monitor reservoir 신선도 3h (`:78-101`) |
| wisetoto-sync-scores.sh | ❓ | 리포에 사본만(`data/wisetoto-sync-scores.sh`) — 현재 주력은 Vercel wisetoto-sync | betman_games | ❓ 가동 여부 미확인 |

### GitHub Actions 1개

| 워크플로 | 트리거 | 하는 일 | 실패 시 |
|---|---|---|---|
| `.github/workflows/ci.yml` | push/PR → main | pnpm lint → tsc → test:coverage(래칫) → build | GitHub 상태 체크 실패 (배포 잡 없음 — 배포는 Vercel 별도) |

## 3. 좀비 / 죽은 잡 판정

**좀비** (스케줄 정의는 있는데 실행 기록 없음/의심):

| 잡 | 판정 | 근거 |
|---|---|---|
| invariant-audit | 좀비 의심 ❓ | `vercel.json:107-110` 등록 + 마이그 `20260808_invariant_findings.sql` 존재. 그러나 24h 실측 success 목록에 부재 — 8/8 신설분이 아직 미배포(push 대기)일 가능성. 배포 후 재확인 필요 |
| season-weekly-snapshot / season-weekly-draw-snapshot | ❓ 판정 보류 | 등록됨(`vercel.json:59-66`), 주 1회(일 15:00 UTC)라 24h 창에 안 잡힘. 7d 실측도 안 함. 코드상 이벤트 미오픈이면 no-op skip이라 돌아도 흔적이 skip뿐 |
| news-learn-edits | 간헐 결번 | 7d 2회(마지막 8/6), **8/7 회차 무기록** — 호출 자체가 없던 결번. 정확히 이런 걸 잡으려고 invariant-audit cron_heartbeat가 신설됨(`invariant-audit/route.ts:27-28`)인데 그 감사관이 위처럼 미가동 의심 |

**죽은 잡 / 미등록 라우트 7개** (파일은 있고 vercel.json에 없음 — 파일 주석 기준 판정):

| 라우트 | 판정 | 근거 |
|---|---|---|
| `cron/season-chicken-draw` | **등록 누락 사고 의심** 🔴 | 파일 주석은 "매일 23:10 KST (14:10 UTC)" 정기 실행 명시(`route.ts:11`)인데 vercel.json에 없고 withCronLog도 없음. 이벤트 미오픈이면 skip이라(`:45-47`) 현재 무해하지만 **개막(8/22) 후엔 데일리 치킨 추첨이 아예 안 도는 상태**. (event_id, draw_date) unique 멱등 코드까지 완비(`:18,63-70`) — 돌릴 작정으로 만든 코드 |
| `cron/update-temperatures` | 죽은 잡 (고아) | 주석은 vercel cron 용도(`route.ts:12-15`)이나 동일 RPC `update_active_post_temperatures`를 pg_cron이 5분마다 수행(`PG_CRON_JOBS.md:39`) — 이관 후 라우트만 잔존 |
| `cron/reddit-seed-posts` | 의도된 중단 + 문서 드리프트 | 과거 등록됐다 제거(운영 결정). 단 `CLAUDE.md` Vercel Cron 목록("6시간마다")과 admin 모니터 기준 목록(`app/admin/system/cron-monitor.tsx:32`)에 잔존 → 모니터에 영구 "지연" 표시 |
| `cron/naming-audit` | 수동 도구 (정상) | 주석 "수동 — vercel.json 미등록"(`route.ts:14`), `?dry=1` 지원 |
| `cron/saga-queue-publish` | 수동 도구 (정상) | 주석 "수동 배치 발행 도구 — 스케줄 없음"(`route.ts:14`) |
| `cron/saga-test-publish` | 수동 도구 (정상) | 주석 "수동 배치 발행 도구 (vercel.json 미등록)"(`route.ts:11`) |
| `cron/standings/ingest` | 외부 수신구 — **호출자 사망** | VPS 스크래퍼 POST 수신용(`route.ts:17-21`)인데 그 VPS 스크래퍼가 2026-03-11 이후 정지(`standings-refresh/route.ts:16-17`) → 실질 무호출. standings-refresh가 역할 대체 |

## 4. 중복 실행 방지 / 멱등성 (대표 5개 실코드 확인)

| cron | 겹침 안전성 | 근거 |
|---|---|---|
| settle-pending | **안전** — 조건부 갱신(CAS) | 픽 정산이 전부 `update ... .eq("id",…).eq("status","pending")` — 이미 정산된 행은 no-op (`lib/betman/settle.ts:199-200, 222-223, 264, 333`). 이중 정산 불가 |
| betman-sync | **안전** — 상태 필터 갱신 | scheduled→in_progress는 `.eq("status","scheduled")`(`route.ts:76-79`), 라운드 close는 open만 대상(`:89,114`) — 재실행해도 같은 결과 |
| saga-extract | **대체로 안전** — DB unique 수렴 | 헤더 명시 "멱등성은 upsertSagaEntry의 cluster_key UNIQUE가 보장(중복=에코 접힘)"(`route.ts:32`), article_links는 `upsert onConflict: post_id`(`lib/saga/publish.ts:149,225`). 겹치면 LLM 이중 호출(비용)은 발생하나 산출물은 수렴 |
| news-auto-publish | ⚠️ **락 없음** | drafted 조회→posts insert→reservoir update 사이에 CAS 없음(reservoir 갱신이 `.eq("id",…)`뿐, `lib/news/publish.ts:228-241`). 중복 방어는 48h 발행 URL/제목 사후 대조(`route.ts:182-194`)라 **동시 실행엔 무력** — 실제 같은-run 2발 실사고 이력(`route.ts:179-181`). 30분 간격+회당 2건이라 겹침 확률은 낮음 |
| agg-publish-queue | ⚠️ **락 없음** | approved 조회→posts insert→`update status='published'`가 무조건 갱신(`lib/agg/publish.ts:121-141`) — 이전 회차 미종료 중 다음 회차가 같은 행을 다시 게시 가능. 10분 간격·limit 3·처리시간 짧음으로 실질 리스크 낮음 |

기타 관찰: sync-videos·standings-cache·saga-ingest·news-comment-reports는 upsert(onConflict)로 멱등, weekly-analytics·season-draw·chicken-draw는 기존행 사전 체크로 멱등. **분산 락을 쓰는 cron은 0개** — 전부 "조건부 갱신 또는 unique 제약" 패턴이거나 무방비.

## 5. 실패 알림 체인 — 누가 사람에게 닿는가

```
[1층] withCronLog → cron_run_log (성공/실패/소요시간)  … 27개 Vercel cron 중 27개 커버 (wisetoto 포함)
[2층-수동] /admin/system 크론 모니터 — cron_run_log 기반 지연 뱃지 (사람이 열어봐야 앎, app/admin/system/cron-monitor.tsx:14-23)
[2층-능동] ops-monitor (30분) → notifyDiscordOps → 디스코드   [운영자에게 push]
[2층-능동] invariant-audit (매시 :44) → cron_heartbeat 로 vercel.json 전 잡 결번 감시 + 디스코드 (route.ts:82-116)
[상호 감시] ops-monitor ↔ invariant-audit (ops-monitor/route.ts:275-298 · invariant-audit/route.ts:35)
```

- 디스코드 알림 자체의 SPOF: `DISCORD_OPS_WEBHOOK_URL` 미설정/실패 시 **조용히 no-op** (`lib/discord-notify.ts:31-32`) — 알림 채널 자체는 아무도 감시 안 함.
- 개별 cron의 자체 알림: news-auto-publish 브레이킹 막힘(`route.ts:244-253`), saga-extract 클럽 모순(`route.ts:160-166`), news-comment-reports 제보, ops-monitor 브레이킹 방치 6h(`route.ts:106-155`).

**커버리지 사각**:

| 대상 | 사각 내용 |
|---|---|
| pg_cron 6개 | cron_run_log 밖. 실패해도 어떤 알림에도 안 닿음 — `cron.job_run_details`를 직접 조회해야만 앎 (`PG_CRON_JOBS.md:17`) |
| Edge Fn betman-sync-watchdog | 동일 사각 + 소스 부재 |
| VPS 4종 | 프로세스 직접 감시 없음 — 산출물 신선도로 간접 감시(ops-monitor)만. "cron이 돈다 ≠ 파이프라인이 산다" 사고 전례가 주석에 명시(`ops-monitor/route.ts:79-82`) |
| invariant-audit 자신 | ops-monitor가 심박 감시하나(`:275-298`), **"기록이 아예 없음"은 경보 안 함**(`:278`, stale만) — 지금처럼 한 번도 안 돈 상태는 영원히 무경보 🔴 |
| 미등록 수동 도구 4종 | withCronLog 없음(naming-audit·saga-queue-publish·saga-test-publish·standings/ingest + season-chicken-draw·update-temperatures) — 실행돼도 cron_run_log 무기록 |
| GH Actions | GitHub 체크 실패만 — 디스코드/어드민 연동 없음 |

## 5b. 라이브 DB 검증 (메인 세션, 2026-08-08 — 읽기 전용 SQL)

| ❓ 항목 | 결과 |
|---|---|
| invariant-audit 가동 여부 | ✅ **가동 확인** — cron_run_log에 10:44·11:44 UTC 2회차 success(HTTP 200). 좀비 의혹 기각 (에이전트 실측 시점이 배포 직전이었음). 단 "기록 전무는 무경보" 맹점 자체는 유효한 일반 결함 |
| season-weekly-snapshot / draw-snapshot | 🔴 **좀비 강한 의심** — 10일 내 cron_run_log 기록 0건. vercel.json 등록 커밋은 7/31(53bf5589)로 8/2(일) 15:00 UTC 회차 이전 → 최소 1회차 무기록 결번 (push/배포 시점 ❓ 남음). 8/9(일) 15:00 UTC 회차로 최종 판정 가능 |

## 6. 요약 발견 (Phase 4+ 후보)

1. 🔴 **season-chicken-draw 등록 누락 사고 의심** — 주석·멱등 설계는 정기 실행용인데 미등록. 개막(8/22) 전 vercel.json 등록 필요.
2. 🔴 ~~invariant-audit 무실행 의심~~ → 라이브 검증으로 기각(§5b). 단 **"기록 전무는 무경보" 맹점**은 유효 — 신설 크론은 첫 실행 전까지 자기 부재를 아무도 못 알림. + 🔴 **주간 스냅샷 2종 좀비 의심** 신규(§5b).
3. ⚠️ pg_cron 6 + Edge Fn 1 = 리포 밖 정본(드리프트) + 알림 사각 — 재구축 시 자동 복원 불가.
4. ⚠️ 발행 계열 2종(news-auto-publish, agg-publish-queue)은 겹침 실행에 구조적 무방비 (현 주기상 위험 낮음).
5. 드리프트 소소: admin 크론 모니터·CLAUDE.md에 reddit-seed-posts 잔존, update-temperatures 고아 라우트.

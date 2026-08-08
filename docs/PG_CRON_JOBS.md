# pg_cron 잡 · Edge Function 정본 기록

> 2026-08-06 (gauntlet R18 / 단계 0-6). **문제**: DB 안에서 도는 pg_cron 6개 잡과
> Supabase Edge Function `betman-sync-watchdog` 은 소스·마이그레이션·문서 어디에도
> 정의가 없고 DB 조회로만 발견된다 (전 파이프라인 조사 — `workspace/gauntlet-probe-infra.md` ①).
> 프로젝트를 재구축하거나 잡이 사라졌을 때 참조할 수 있도록 여기 기록한다.
>
> **정본은 여전히 DB 다** — 이 문서는 기록이지 배포 수단이 아니다. 변경은 DB 에 직접
> (`cron.schedule`/`cron.unschedule`) 하고, 하면 반드시 이 문서를 갱신할 것.
>
> **2026-08-08 갱신 (전수 감사 P2-1)**: 잡 6종을 마이그레이션으로 채록
> (`supabase/migrations/20260808e_transcribe_pg_cron_jobs.sql` — cron.schedule 은
> 같은 이름 upsert 라 재적용 안전, jobid 1~6 유지 확인). Edge Function 소스도
> 라이브에서 회수해 `supabase/functions/betman-sync-watchdog/` 에 채록 — **이제
> 리포만으로 재구축 가능**. watchdog 트리거 command 에 시크릿 없음 실측 확인
> (아래 "서비스 키" 언급은 2026-08-06 당시 기록 — 현재는 Content-Type 헤더뿐).

## 실측 방법

```sql
-- 등록된 잡
SELECT jobid, jobname, schedule, command, active FROM cron.job ORDER BY jobid;
-- 최근 실행 이력
SELECT jobname, status, start_time FROM cron.job_run_details
JOIN cron.job USING (jobid) ORDER BY start_time DESC LIMIT 50;
```

## 잡 목록 (2026-08-06 실측 — 6개 전부 active, 24h 실패 0)

| jobid | jobname | schedule | command | 24h 실행 |
|---|---|---|---|---|
| 1 | betman-sync-health-check | `*/30 * * * *` | `SELECT betman_check_sync_health();` | 48 |
| 2 | betman-edge-watchdog-trigger | `15 * * * *` | `net.http_post` → Edge Function `betman-sync-watchdog` | 24 |
| 3 | process-temperature-queue | `* * * * *` | `SELECT process_temperature_queue(50);` | 1,440 |
| 4 | reset-old-temperatures | `0 4 * * *` | `SELECT reset_expired_temperatures(7);` | 1 |
| 5 | recalc-user-temperatures | `0 5 * * *` | `SELECT recalc_all_user_temperatures();` | 1 |
| 6 | update-post-temperatures | `*/5 * * * *` | `SELECT update_active_post_temperatures();` | 288 |

재생성 스켈레톤 (전면 재구축 시에만 — 평소엔 이미 등록돼 있음):

```sql
SELECT cron.schedule('betman-sync-health-check', '*/30 * * * *', $$SELECT betman_check_sync_health();$$);
SELECT cron.schedule('process-temperature-queue', '* * * * *',   $$SELECT process_temperature_queue(50);$$);
SELECT cron.schedule('reset-old-temperatures',    '0 4 * * *',   $$SELECT reset_expired_temperatures(7);$$);
SELECT cron.schedule('recalc-user-temperatures',  '0 5 * * *',   $$SELECT recalc_all_user_temperatures();$$);
SELECT cron.schedule('update-post-temperatures',  '*/5 * * * *', $$SELECT update_active_post_temperatures();$$);
-- jobid 2 (watchdog 트리거)는 net.http_post 로 Edge Function 을 호출 — URL·서비스 키가 들어가므로
-- 재생성 시 DB 에서 기존 command 를 그대로 복사할 것 (여기엔 시크릿을 적지 않는다).
```

## Edge Function: `betman-sync-watchdog`

- **호출**: pg_cron jobid 2 가 매시 :15 에 `net.http_post(https://<project>.functions.supabase.co/betman-sync-watchdog)`.
- **역할**: betman 동기화(Vultr VPS cron) 지연 감시 — VPS 가 죽어도 DB 쪽에서 탐지하는 이중 안전망.
- **소스**: 리포에 없음 (`supabase/functions/` 디렉토리 부재). 원본은 Supabase 대시보드
  Edge Functions 에서 열람 (`mcp__supabase__get_edge_function` 으로도 조회 가능).
- **주의**: 리포 재구축 시 이 함수는 자동 복원되지 않는다 — 대시보드에서 소스 백업 후 재배포 필요.

## 다른 스케줄러 층위와의 관계 (전체 지도)

| 층위 | 정본 위치 | 감시 |
|---|---|---|
| Vercel Cron 24개 | `vercel.json` (리포) | `withCronLog` → `cron_run_log` → 어드민 시스템 모니터 |
| Vultr VPS cron (betman/크롤러/뉴스 스캐너) | VPS `/opt/*` (리포 밖) | ops-monitor 가 DB 신선도로 간접 감시 |
| **pg_cron 6잡** | **DB (이 문서는 기록)** | `cron.job_run_details` |
| **Edge Function 1개** | **Supabase 대시보드** | pg_cron jobid 2 실행 이력 |
| 로컬 Hermes (안전망) | 로컬 PC | 없음 — 주 경로는 `news-learn-edits` cron 으로 이관됨 |

관련: 온도 갱신은 pg_cron jobid 6 이 수행한다 — `app/api/cron/update-temperatures` 라우트의
"vercel.json 5분마다" 주석은 낡았다 (미등록 고아 라우트, 같은 RPC 를 pg_cron 이 호출).

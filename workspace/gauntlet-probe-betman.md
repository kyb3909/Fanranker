# 베트맨(승부예측) 파이프라인 조사 보고서

- 조사일: 2026-08-06 (KST)
- 조사 방식: 리포 코드 정독 + 프로덕션 DB SELECT 실측 (읽기 전용)
- 범위: 일정 수집 → 경기 생성 → 상태 추적 → 결과 확정 → 정산
- 표기 원칙: 증거는 `파일:라인`. 코드로 확인 못 한 것은 "추정:" 표기. VPS bash 4종은 git 밖 — **리포에서 보이는 API 계약만** 기록.

---

## ① 실행 흐름도 (실제 호출 경로 기준)

```
[외부 소스]
  betman.co.kr  (한국 IP 전용 — Vercel 접근 불가: lib/betman/http-client.ts:4-6)
    ├ inqBuyAbleGameInfoList.do  … 구매가능 회차(gmTs) 목록
    ├ gameInfoInq.do             … 회차별 경기+배당 (compSchedules.keys/datas)
    └ inqWinrstDetlBody.do       … 회차별 결과 (GAME_RESULT/MCH_SCORE/HANDI_VAL)
  wisetoto.com get_proto_list.htm … 라이브 스코어 (gm_no/h_score/a_score)

[수집 주체 = Vultr 서울 VPS]  (리포 내 계약 사본: scripts/vps-betman-scraper.ts)
  main() 실행 순서 (vps-betman-scraper.ts:668-856):
   Phase 1  GET  /api/betman/sync-state        ← watchdog resync 플래그 확인
   Phase 2  betman 구매가능 gmTs 조회
   Phase 3  gmTs+1..+5 프로빙 (새 회차 자동 감지) + resync 범위 프로빙
   Phase 4  회차별:
             gameInfoInq → parseGames
             → POST /api/betman/round   {gmTs}            → betman_rounds 조회-or-생성, roundId 반환
             → POST /api/betman/games   {roundId, games}  → betman_games UPSERT (round_id,game_no)
             → POST /api/betman/unknown-games             → 미지원 betTypId raw 보관
   Phase 5  결과 수집:
             GET  /api/betman/pending-results?limit=30&days=45  ← 결과/스코어 누락 회차 목록(백필 대상)
             회차별 inqWinrstDetlBody → 매핑
             → POST /api/betman/results {gmTs, results[]}  → 결과 반영 + **자동 정산**(settlePredictions)
   Phase 6  POST /api/betman/sync-state  (latestGmTs, activeRounds, action, error)

[라이브 스코어 (표시 전용)]
   Vercel cron 매분 + 프론트 30초 폴링 → GET /api/wisetoto/sync
     → betman_games.home_score/away_score 갱신 + status→in_progress (결과/정산 불개입)
   (별도) VPS wisetoto 크롤러 → POST /api/betman/scores (동일하게 점수+in_progress만)

[상태 전환 (시간 기반, 여러 곳에서 중복 수행)]
   scheduled --(match_time 경과)--> in_progress
     · GET /api/betman/games 진입 시 (games/route.ts:60-66)
     · cron betman-sync 30분 (betman-sync/route.ts:75-83)
     · wisetoto sync (wisetoto/sync/route.ts:154-162)
     · settle 라우트 사전 만료 (settle/route.ts:83-90)
   in_progress --(결과 POST)--> completed / cancelled

[정산]
   자동:   POST /api/betman/results 내부 (results/route.ts:139-194)
   안전망: Vercel cron 15분 /api/cron/settle-pending → settleAllPendingCompleted (settle-sweep.ts:53)
   수동A:  POST /api/betman/settle (CRON_SECRET, round/daily 단위)
   수동B:  어드민 /admin/settlements → POST /api/predictions/settle (requireAdminApi)
   수동C:  scripts/backfill-unsettled-results.ts (재수집+스코어유추+전량정산)
   만료:   POST /api/betman/expire-pending → RPC expire_stale_pending_predictions (48h 지난 pending 픽 취소)

[정산 내부 (lib/betman/settle.ts:148 settlePredictions)]
   1. 픽 단위: pending → settled/cancelled  (CAS: .eq("status","pending"))
   2. 슬립 단위: 모든 픽 확정 시 → won/lost/cancelled (CAS 동일)
      · 전부 취소 → 슬립 취소 + refund_tokens 재시도 3회 → 실패 시 pending_refunds
      · 부분 취소 → 살아있는 픽 locked_odds 곱으로 total_odds 재계산
      · won 이어도 토큰 지급 없음 (점수만 모델 — settle.ts:365 after_state.payout 기록만)
   2.4 notifications(settlement_result) batch INSERT
   2.5 settlement_audit_log batch INSERT (실패해도 정산 유지, Sentry fatal)
   3. batchUpdateUserStats (betman_user_sport_stats 재계산)
   4. syncStadiumContributions (실패 무시)
```

Vercel cron 등록 실측: `vercel.json:12-26` — betman-sync `*/30`, settle-pending `*/15`, wisetoto/sync `* * * * *`.

---

## ② 파일:라인 책임 지도

### 수집·생성 (A)
| 책임 | 위치 |
|---|---|
| betman HTTP 공용 (헤더/재시도/타임아웃 15s·backoff 3회) | `lib/betman/http-client.ts:26-53` |
| 회차 경기 조회+파싱 (keys 기반, betTypId→game_type 매핑) | `lib/betman/game-fetcher.ts:101-130, 168-246` |
| VPS 스크레이퍼 계약 사본 (전체 파이프라인) | `scripts/vps-betman-scraper.ts` (positional 파서 186-281, 라운드 284-296, 게임전송 299-311, 결과 523-637) |
| 수동 수집 (Playwright, 로컬) | `scripts/betman-fetch-games.ts`, `scripts/betman-sync.ts`, `scripts/betman-seed-gmts.ts` |
| 회차 생성 API (gmTs→roundId) | `app/api/betman/round/route.ts:25-125` |
| 경기 upsert + daily round 배정 + live_rooms 자동 생성 | `app/api/betman/games/route.ts:378-567` (upsert 422-425, daily 배정 432-461, live_rooms 463-554) |
| 데일리 윈도우/마감 규칙 (08:00~익일08:00, 23:00 flip) | `lib/betman/daily-round.ts:19-141` |
| 크로스라운드 중복 마켓 응답단 제거 | `lib/betman/market-dedup.ts:30-57` (호출: games/route.ts:263) |
| 전반전 휴리스틱 마킹+숨김 | `app/api/betman/games/route.ts:243-299` |
| 미지원 유형 raw 보관 | `app/api/betman/unknown-games/route.ts:39-98` (upsert 키 78-81) |

### 상태·결과 (B 전반)
| 책임 | 위치 |
|---|---|
| 결과 코드 매핑 (GAME_RESULT 0/1/2/4) + 스코어 유추 | `lib/betman/result-mapper.ts:38-101` |
| 결과 반영 + 자동 정산 진입점 (VPS가 호출) | `app/api/betman/results/route.ts:27-231` (결과 update 119-124, 자동정산 139-194) |
| 결과 재수집 (서버측 lib — 현재 라우트 호출처 없음, 스크립트만 사용) | `lib/betman/result-fetcher.ts:72-204` |
| 라이브 스코어 (Vercel 직접) | `app/api/wisetoto/sync/route.ts:26-201` (쿨다운 66-69, 점수 update 114-127) |
| 라이브 스코어 (VPS 경유) | `app/api/betman/scores/route.ts:25-80+` |
| staleness watchdog + 라운드 수명주기 | `app/api/cron/betman-sync/route.ts:31-169` |
| 백필 대상 목록 API | `app/api/betman/pending-results/route.ts:28-129` |
| sync 상태 GET/POST | `app/api/betman/sync-state/route.ts:23-52, 70-90+`, `lib/betman/sync-state.ts:9-44` |

### 정산 (B 핵심)
| 책임 | 위치 |
|---|---|
| 공통 정산 엔진 | `lib/betman/settle.ts:148-459` |
| 환불 재시도(3회)+pending_refunds+audit | `lib/betman/settle.ts:29-76`, `lib/betman/refund-tokens.ts:13-46` |
| 안전망 스윕 (15분) | `lib/betman/settle-sweep.ts:53-110` ← `app/api/cron/settle-pending/route.ts:18-41` |
| CRON_SECRET 정산 라우트 | `app/api/betman/settle/route.ts:32-198` |
| 어드민 정산 라우트 (미정산 목록 GET + 정산 POST) | `app/api/predictions/settle/route.ts:13-190` |
| 어드민 수동 결과 입력/취소 | `app/api/admin/matches/result/route.ts:25-101` |
| 48h 만료 RPC | `supabase/migrations/00000000000001_prod_schema.sql:1518-1576` (`expire_stale_pending_predictions`) ← `app/api/betman/expire-pending/route.ts:12-33` |
| 유저 통계 재계산 | `lib/betman/stats.ts` (calculateStreaks 4-20, updateUserSportStats 23+) |
| 베팅 생성 (spend_tokens/락인 배당) | `app/api/betman/prediction/route.ts:42-574` (RPC 차감 362-371, 락 배당 436-438) |
| 수동 백필+전량 정산 스크립트 | `scripts/backfill-unsettled-results.ts` (재수집 194, 스코어유추 213-268, 전량정산 270-374) |

### 어드민 (D)
| 책임 | 위치 |
|---|---|
| 미정산 경기 테이블 (결과입력→정산 2단 흐름) | `app/admin/settlements/settlement-table.tsx:46-175` |
| 결과 입력 다이얼로그 (스코어→결과 자동 유추) | `app/admin/settlements/settlement-edit-dialog.tsx:48-105` |
| 경기 목록/일정표 | `app/api/admin/matches/list/route.ts:12-80+`, `app/api/admin/matches/schedule/route.ts:41-70+`, `app/admin/matches/*` |
| VPS 재동기화 신호 (어드민) | `app/api/admin/betman/resync/route.ts:17-47` |
| VPS 재동기화 신호 (CRON_SECRET) | `app/api/betman/manual-sync/route.ts:33-87` |

### `app/api/betman/*` 전수 (15개 라우트)
| 라우트 | 메서드 | 인증 | 역할 |
|---|---|---|---|
| `round` | POST | CRON_SECRET | gmTs→betman_rounds 생성/조회 (VPS 계약) |
| `games` | GET/POST | GET 공개 / POST CRON_SECRET | GET 베팅 목록(윈도우·숨김·dedup) / POST VPS 경기 upsert |
| `results` | POST | CRON_SECRET | 결과 반영+자동정산 (VPS 계약) |
| `scores` | POST | CRON_SECRET | VPS wisetoto 점수 반영 (표시용) |
| `settle` | POST | CRON_SECRET | round/daily 단위 정산 |
| `pending-results` | GET | CRON_SECRET | 백필 대상 gmTs 목록 (VPS 계약) |
| `expire-pending` | POST | CRON_SECRET | 48h 만료 RPC 실행 (Vultr cron 호출용) |
| `sync-state` | GET/POST | CRON_SECRET | VPS↔watchdog 상태 교환 (VPS 계약) |
| `manual-sync` | POST | CRON_SECRET | resync 플래그 세팅 |
| `unknown-games` | POST | CRON_SECRET | 미지원 유형 raw 보관 (VPS 계약) |
| `stats/recalculate` | POST | (미정독) | 통계 재계산 트리거 |
| `prediction` | GET/POST | Clerk 로그인 | 베팅 생성/내역 |
| `my-stats` | GET | Clerk | 내 통계 |
| `community-stats` | GET | 공개 | 커뮤니티 통계 |
| `rankings` | GET | 공개 | 랭킹 |

---

## ③ 중복방지·재시도·정정 메커니즘 표

| 메커니즘 | 방식 | 근거 |
|---|---|---|
| **경기 중복 생성 방지 (회차 내)** | DB UNIQUE `(round_id, game_no)` + upsert onConflict | `prod_schema.sql:6954` (`betman_games_round_id_game_no_key`), `app/api/betman/games/route.ts:422-425` |
| **경기 중복 (회차 간, 같은 물리 경기)** | **DB 방지 없음** — 응답 단계에서만 dedup(배당 포함 시그니처) | `lib/betman/market-dedup.ts:30-57`. DB 실측: 최근 30일 동일 (팀+시간+마켓키) 그룹 600개 중 **474개가 다중 라운드 중복** (의도된 betman 패턴, DB에는 그대로 쌓임) |
| **회차 중복 생성 방지** | 애플리케이션 레벨 조회-후-insert (gm_ts → year+round 2단 조회). **gm_ts에 DB 유니크 제약 없음** | `app/api/betman/round/route.ts:52-109`. 동시 호출 race 시 이론상 중복 가능. DB 실측: gm_ts 중복 0건 |
| **베팅 중복 제출 방지** | `idempotency_key` UNIQUE partial index + 사전 조회 | `prod_schema.sql:8604` (`idx_prediction_slips_idempotency`), `app/api/betman/prediction/route.ts:64-79` |
| **같은 경기 재베팅** | **의도적으로 허용** — (user_id, game_id) 유니크 인덱스 2026-06-29 제거 | `supabase/migrations/20260629_allow_duplicate_betman_predictions.sql:12` |
| **중복 정산 방지** | **status CAS 단일 메커니즘** (유니크 키 아님). 픽: `.eq("status","pending")`, 슬립: `.eq("status","pending")` — 두 번째 호출은 0 rows affected | `lib/betman/settle.ts:200,224` (픽), `:264,333,377` (슬립). `settle-slip.test.ts:199,219,282,299` 가 멱등성 잠금 |
| **중복 환불 방지** | 슬립 취소 CAS 성공 시에만 refund 실행 (취소 UPDATE가 refund 게이트) | `lib/betman/settle.ts:260-292` |
| **환불 재시도** | refund_tokens 3회 (0.5s·1s 백오프) → 실패 시 `pending_refunds` 기록 + Sentry fatal | `lib/betman/settle.ts:38-76`, `lib/betman/refund-tokens.ts:20-45`. DB 실측: pending_refunds 0행 |
| **크롤 재시도** | fetchWithRetry 3회 exponential backoff(최대 8s)+jitter, 4xx 즉시 중단 | `lib/betman/http-client.ts:26-53`, `scripts/vps-betman-scraper.ts:64-91` |
| **정산 누락 안전망** | 15분 cron 전체 pending 픽 스윕 (결과 경로와 무관) | `lib/betman/settle-sweep.ts:53-110`, `vercel.json:16-18`. audit 실측: 최근 3행 중 2행 actor=`cron:settle-sweep` |
| **결과 누락 백필** | pending-results API(45일 창) → VPS Phase 5가 재수집 대상에 합류 | `app/api/betman/pending-results/route.ts:44-53`, `scripts/vps-betman-scraper.ts:377-396,792-797` |
| **베팅 영구 pending 방지** | 48h 경과 pending 픽 자동 취소 + 전부취소 슬립 환불 (RPC) | `prod_schema.sql:1518-1576` |
| **결과 정정 (정산 후 오심 수정)** | **경로 없음.** `manual_reverse` 이벤트 타입은 스키마·TS 타입에만 존재, 기록하는 코드 0 (Phase 3 미구현) | `lib/betman/settle.ts:12`, `20260528_create_settlement_audit_log.sql:38`, grep 결과 호출처 없음. 어드민 UI 자체 문구 "되돌리는 UI 가 없다" `settlement-table.tsx:104,145` |
| **정산 감사 추적** | settlement_audit_log — 슬립 단위+refund만, batch INSERT, 실패해도 정산 유지 | `lib/betman/settle.ts:434-443`, 스키마 `20260528_create_settlement_audit_log.sql:22-64` |

---

## ④ ID·엔티티 정합 (실측 포함)

### ID 체계
- **외부 키**: betman `gmTs`(회차, 예 260093) + `matchSeq`(회차 내 경기번호) 조합이 유일한 외부 식별자. 경기 자체의 글로벌 ID는 **없음**.
- **내부 키**: `betman_rounds.id`(uuid) ← `gm_ts`(text, **유니크 제약 없음**), `betman_games.id`(uuid) + UNIQUE(round_id, game_no).
- **FK 체인** (`prod_schema.sql:9183-9199, 9468-9474`):
  - `betman_predictions.game_id → betman_games.id` (ON DELETE CASCADE)
  - `betman_predictions.slip_id → prediction_slips.id`, `.round_id → betman_rounds.id`, `.daily_round_id → betman_daily_rounds.id`
  - `prediction_slips.daily_round_id → betman_daily_rounds.id`, `.event_id → events.id`. **slips에는 game/round FK 없음** — 픽을 통해서만 경기와 연결.
- **competition/season 개념: 스키마에 없음.** `betman_games.league_code`는 표시명 텍스트(예 "EPL", "K리그1" — `lib/betman/game-fetcher.ts:209-211`이 leagueShortName을 저장). season 컬럼·테이블 부재. `betman_rounds.year`는 있으나 시즌이 아니라 발매 연도. 이벤트(월드컵)는 `events.league_codes text[]`로 league_code 문자열 매칭 (`games/route.ts:77-97`).

### 팀 표기
- `home_team_name`/`away_team_name`은 **자유 텍스트** (betman 응답 그대로). 정규화 테이블 연결 없음.
- 레거시 정규화 인프라는 스키마에 존재하나 **미배선**: `betman_games.mapped_match_id/mapped_home_team_id/mapped_away_team_id/mapped_league_id` → `matches`/`teams`/`leagues` FK (`prod_schema.sql:9164-9174`). 쓰는 앱 코드 0 (grep: database.types.ts와 스키마뿐). **DB 실측: mapped_* 채워진 행 0.** `get_league_id_by_alias`/`league_aliases`(10행)도 호출처 없음.
- `team_map_pins.team_id`(stadium)와 betman 팀명은 **연결되지 않음**. `lib/stadium/team-matcher.ts`는 프로필 `favorite_team` 텍스트→team_id 매칭 전용 (146-183) — betman 파이프라인 어디서도 호출 안 됨.

### DB 실측 (2026-08-06, SELECT만)
| 항목 | 값 |
|---|---|
| betman_rounds / betman_games / betman_predictions | 89 / 35,761 / 2,070행 |
| betman_daily_rounds / prediction_slips / settlement_audit_log | 205 / 1,419 / 1,374행 |
| betman_unknown_games / pending_refunds | 203 / **0**행 |
| 레거시: matches / teams / leagues / predictions | 10 / 100 / 15 / 0행 (파이프라인 미사용) |
| betman_games status 분포 | completed 34,449 · cancelled 1,069 · scheduled 218 · in_progress 25 · **postponed 0** |
| **최근 7일 정산 건수** | **0건** (마지막 픽 2026-07-26 07:51, 마지막 정산 2026-07-26 11:16 — 유저 베팅이 없어서 0. 경기 파이프라인은 살아있음: 7일 내 completed 갱신 1,410건) |
| audit 샘플 3행 | 전부 event_type=settle_slip, pending→lost, amount=null, actor=`cron:settle`(7/26)·`cron:settle-sweep`(7/19×2) — 점수만 모델과 일치 |
| 동기화 신선도 | last_checked 2026-08-06 12:10Z, action=vps_synced, latest_gm_ts=260093, last_error 없음 |
| 중복 의심 | gm_ts 중복 라운드 **0**. 동일 (팀+시간+마켓키) 다중 행: 30일 내 600그룹 (크로스라운드 474 + 동일라운드 126=전반전 추정) — round_id가 다르거나 game_no가 달라 유니크 제약 위반은 아님 |
| in_progress 48h 초과 방치 | 0건 |

---

## ⑤ 위험 후보 판정

| 위험 | 판정 | 근거 |
|---|---|---|
| **중복 경기 생성** | **부분 방어** | 회차 내: UNIQUE(round_id,game_no)로 방어(§③). 회차 간: DB 방어 없음 — 같은 물리 경기가 474그룹 중복 실측. 노출은 `dedupeMarketRows`(games/route.ts:263)로 가림, **베팅 라우트는 matchKey(팀+시간) 중복만 막고**(prediction/route.ts:141-148) 서로 다른 슬립으로 같은 경기의 다른 라운드 row에 각각 베팅하는 것은 막지 않음(2026-06-29부터 의도된 허용이기도 함). 정산은 row 단위라 이중 정산으로 이어지진 않음 |
| **홈/원정 스왑** | **방어 없음** | 수집 시 betman `homeName`/`awayName` 필드 신뢰(`game-fetcher.ts:213-214`, `vps-betman-scraper.ts:250-251` d[14]/d[15]). 교차 검증·스왑 감지 코드 없음. 결과도 같은 소스의 GAME_RESULT(0=home)라 소스 내 일관성은 있음 — 소스가 틀리면 그대로 틀림 |
| **시간대 처리** | **방어 있음 (경계 1건 주의)** | 저장은 UTC instant(`game-fetcher.ts:196-197` toISOString; `betman-fetch-games.ts:35-40`은 +09:00 표기 동일 instant). KST 윈도우 계산은 `daily-round.ts:19-61` 단일 모듈 + `daily-round.test.ts` 20여 케이스로 잠김. **예외**: `round/route.ts:94-97` 회차 deadline이 주석은 "23:59 KST"인데 서버 로컬(=Vercel UTC) `setHours(23,59)` → 실제 23:59 **UTC**(=익일 08:59 KST). deadline은 라운드 auto-close(betman-sync/route.ts:110-125)에만 쓰여 실피해는 낮음. 컬럼 타입도 text(`prod_schema.sql:4742`) |
| **연기 경기 오인** | **방어 없음 (설계상 부재)** | status enum에 `postponed` 존재(`prod_schema.sql:4655`)하나 **쓰는 코드 0, DB 0행**. 연기 경기는 scheduled→(킥오프 경과)→in_progress로 전환된 채 방치되고, 48h 후 `expire_stale_pending_predictions`(prod_schema.sql:1526-1537)가 픽을 **취소+환불**. 이후 betman이 연기 경기를 새 회차에 재발매하면 새 row로 들어옴. 즉 "연기=취소 환불" 로 수렴하는 암묵 경로만 있음. 추정: 연기 후 같은 회차에서 늦게 결과가 오면(48h 이내) 정상 정산되고, 48h 넘으면 픽이 먼저 취소된 뒤 결과가 와도 CAS 때문에 재정산 안 됨 — 게임은 completed인데 픽은 cancelled로 남는 조합 가능 |
| **중복 정산** | **방어 있음** | status CAS 전면 적용(§③). 슬립 환불도 취소 CAS 성공 게이트 뒤에서만 실행(settle.ts:260-292). 멱등성 테스트 4건(`settle-slip.test.ts:199,219,282,299`) + `settle.test.ts:296`. audit 로그로 사후 추적 가능. 잔여 리스크(추정): CAS가 픽/슬립 개별 UPDATE 단위라 트랜잭션이 아님 — 동시 실행 시 이중 정산은 안 되지만, 부분 취소 total_odds 재계산 UPDATE(settle.ts:317-321)는 CAS 없이 실행되어 이론상 경합 가능 |
| **정정 불일치 (오심 정산 후 결과 변경)** | **방어 없음 — 확정** | ① 어드민 결과 라우트는 status 가드 없이 result 덮어쓰기 허용(`admin/matches/result/route.ts:62-67` — `.eq("id")`만. 에러 문구 "이미 정산 완료되었거나"는 실제 필터와 불일치). ② VPS `results` POST도 status 무필터 update(`results/route.ts:119-124`) — 취소됐던 경기를 completed로 되살릴 수 있음. ③ 그러나 이미 settled/cancelled 픽은 CAS 때문에 재정산되지 않음 → **게임 result와 정산 결과가 영구 불일치**. 역연산(`manual_reverse`)은 미구현(§③). 어드민 확인창도 "되돌릴 수 없습니다"라고 명시(settlement-table.tsx:106-108) |
| **(추가) 라이브 스코어로 결과 오확정** | **주의 (수동 도구 한정)** | 운영 경로에서는 wisetoto 점수가 결과 확정에 쓰이지 않음(wisetoto/sync·scores 라우트는 result 미기록). 단 수동 스크립트 `backfill-unsettled-results.ts:213-268` `backfillByExistingScores`는 **DB에 남은 스코어(라이브 중간 스코어일 수 있음)** 로 result+completed를 확정 — in_progress 경기(킥오프만 지난)도 후보에 포함(220행 status in 필터). 경기 미종료 시점 실행하면 중간 스코어로 정산될 수 있음 |
| **(추가) 전반전 중복행** | **방어 있음 (응답 단계 한정, 근거 확인)** | 알려진 이슈 그대로: VPS가 전반 마켓을 동일 game_type으로 저장 → DB에는 2벌 존재. GET이 휴리스틱 2종(동일 마켓키 2번째 이후=전반, SUM 이후 row=전반)으로 `is_half_time` 마킹 후 숨김(`games/route.ts:243-299`), 베팅은 S접두사 가드(`prediction/route.ts:194-205`). **어드민 목록은 필터 없음 → 노출**(`admin/matches/list/route.ts:25-46` — is_half_time/dedup 부재). 단독 row는 풀/전반 식별 불가로 풀타임 취급(코드 주석 games/route.ts:256, 휴리스틱 한계) |

---

## ⑥ 테스트·수동 도구 인벤토리

### 단위 테스트 (`__tests__`)
| 파일 | 잠그는 것 |
|---|---|
| `__tests__/lib/betman/settle.test.ts` (16케이스) | 픽 정산: 적중/오답/취소/결과없음 스킵, locked_odds 우선, CAS 0-rows 멱등, SUM 실데이터 케이스 |
| `__tests__/lib/betman/settle-slip.test.ts` (10케이스) | 슬립 정산: 전부취소→환불 1회, 취소/won 멱등성, 동시실행 CAS, 부분취소 total_odds 재계산 |
| `__tests__/lib/betman/refund-tokens.test.ts` | 환불 재시도 3회 + 소진 시 pending_refunds 기록 |
| `__tests__/lib/betman/result-mapper.test.ts` | GAME_RESULT 코드 매핑 + 스코어 유추 (핸디/언오버/SUM/fallback) |
| `__tests__/lib/betman/game-fetcher.test.ts` | keys 기반 파싱 (실 fixture 619행, 승N패 스킵, 필수 key 누락 시 []) |
| `__tests__/lib/betman/daily-round.test.ts` | 08:00 경계·23:00 flip·윈도우 24h·마감=킥오프 |
| `__tests__/lib/betman/market-dedup.test.ts` | 크로스라운드 완전중복 제거 + 진짜 전반 row 보존 (ISSUE-002 원형) |
| `__tests__/lib/betman/stats.test.ts` | 연승/연패 계산 |
| `__tests__/api/betman-prediction-route.test.ts` | 볼 차감 계약(차감 전 검증·실패 환불·23505→409), 입력 검증 전수(전반전/미정팀/NaN 시간 등) |
| `__tests__/api/predictions-settle.test.ts` | 어드민 정산 body 검증 + settleable 필터(결과 없는 completed 제외) |
| `__tests__/api/betman-unknown-games.test.ts` | unknown-games 스키마 계약 |
| `__tests__/api/predictions-purchase.test.ts` | (인접) 골드 예측 열람 구매 계약 |

**테스트 없는 영역 (명시)**: `app/api/betman/results` 라우트 통합 흐름(결과 반영→자동정산 연결 — settlePredictions 단위만 커버), `app/api/betman/games` GET의 윈도우/이벤트 분리/전반 휴리스틱(휴리스틱은 market-dedup 간접 커버뿐), `settle-sweep.ts`, `result-fetcher.ts`, wisetoto 2경로, round 생성 race, 어드민 result 덮어쓰기 경로, cron 라우트 전부. E2E·통합 테스트에 betman 정산 시나리오 없음.

### 수동 도구
| 도구 | 용도 |
|---|---|
| `/admin/settlements` (settlement-table + edit-dialog) | 미정산 경기 조회 → 스코어/결과 수동 입력(자동 유추 포함) → 경기취소(환불) → 단건/라운드 정산 |
| `/admin/matches` (list/schedule/match-table) | 경기 목록·일일 일정표 조회 + 결과 입력 |
| `POST /api/admin/betman/resync` | 어드민 → VPS resync 플래그 (admin audit log 기록) |
| `POST /api/betman/manual-sync` | CRON_SECRET → 특정 gmTs resync 플래그 |
| `scripts/backfill-unsettled-results.ts` | betman 재수집 + DB 스코어 기반 결과 유추 + 전량 정산 (한국 IP 필요) |
| `scripts/betman-fetch-games.ts` / `betman-fetch-results.ts` / `betman-sync.ts` / `betman-seed-gmts.ts` | 로컬 수동 수집 (Playwright/직접 fetch) |
| `POST /api/betman/expire-pending` | 48h 만료 수동/외부 cron 트리거 |
| fetch-results Phase 6 (stuck row backfill, VPS bash) | **리포에 코드 없음** — 리포에서 보이는 대응물은 `pending-results` API(45일 창)와 여러 라우트의 scheduled→in_progress 청소뿐. 실측 stuck in_progress 0건으로 동작 정황은 있으나 구현체는 git 밖 (추정: VPS fetch-results.sh 내부) |

---

## 부록: 흐름상 특기 사항 (증거 기반)

1. **정산은 5개 진입점이 전부 같은 엔진(`settlePredictions`) 공유** — SQL RPC 정산은 의도적으로 폐기됨 (`supabase/migrations/20260530d_drop_unused_settle_rpc.sql:3`).
2. **won 슬립에도 토큰 지급 없음** — payout은 audit `after_state.payout` 숫자 기록뿐 (settle.ts:361-370, amount:null). 환불만 실토큰 이동. DB 실측 audit 3행 모두 amount=null로 일치.
3. **`lib/betman/game-fetcher.ts`(keys 기반)와 `scripts/vps-betman-scraper.ts`(positional d[N] 기반)는 파서 이중 구현** — 서버 lib은 keys 드리프트에 강하지만 VPS 사본은 positional(d[16]~d[20]) + `TYPE_MAP`(handi 코드)로 lib의 `BET_TYPE_MAP`(betTypId)과 매핑 축 자체가 다름. betman 스키마 변경 시 두 곳이 따로 깨질 수 있음 (실제 운영본은 git 밖 sync.sh — 추정: 이 사본과 유사).
4. 최근 7일 정산 0건은 장애가 아니라 **유저 베팅 부재** (마지막 픽 7/26). 경기·결과 파이프라인은 8/6 12:10Z까지 정상 동기화 실측.

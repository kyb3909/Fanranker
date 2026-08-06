# 위험 대장 (Risk Register) — 2026-08-06

- 심각도: **P0**(돈·영구 기록·법적) / **P1**(사용자 가시 오류·데이터 정합) / **P2**(운영 부채).
- 상태: 🔴 실존(방어 없음) / 🟡 부분 방어 / 🟢 방어 있음 / ✅ 금주 수리됨.
- 근거는 파일:라인 또는 실측. 재현 방법은 "운영 데이터 무변경" 원칙상 읽기 절차 또는 시나리오 서술.

## P0

| # | 위험 | 상태 | 근거·재현 | 영향 | 권장 |
|---|---|---|---|---|---|
| R1 | **정산 후 결과 정정 → 영구 불일치** | 🔴 | 어드민(`app/api/admin/matches/result/route.ts:62-67`)·VPS(`app/api/betman/results/route.ts:119-124`) 모두 status 무필터 결과 덮어쓰기. 정산된 픽은 CAS로 재정산 불가, `manual_reverse` 코드 0줄. 재현: 정산 완료 경기에 어드민 결과 재입력 → 게임 result만 바뀜 | 베트맨 정산·유저 신뢰·기록 | 결과 update에 `settled 후 변경 금지` 가드(즉시) + 역연산 설계는 별도 SPEC |
| R2 | **수동 백필이 라이브 중간 스코어로 결과 확정 가능** | 🔴 | `scripts/backfill-unsettled-results.ts:213-268` — in_progress 포함 DB 잔존 스코어로 result+completed 확정·전량 정산 | 오정산 | 스크립트에 "킥오프+2h 미만 제외" 가드 + 실행 전 드라이런 강제 |
| R3 | **루머를 공식 사실로 기록** | ✅ 수리 | 오피셜 단계 게이트(`gatedStageSignal`)·D7 전이(`confirmationPatch`)·'간주' NEGATION — `fea7976a`. 소급 재산정 11건 적용 | 사가 명예훼손 가드 | 회귀 테스트 유지(잠김) |
| R4 | **위키 수동 작성 내용 덮어쓰기** | 🟡 | ① naming-audit 전역 치환(`app/api/cron/naming-audit/route.ts:180-192` — 운영자 수정 헤드라인 재접촉 가능, 수동 트리거·음차 가드 한정) ② published-fixes in-place(이전 값 소멸 — 리비전 없음) | 실록 신뢰 | 수정 이력(리비전) 도입 전까지 naming-audit 실행 전 대상 목록 드라이런 |
| R5 | **8/31 마감 오기록** | ✅ 수리 | saga-deadline stage 분기(done→'done') `bb5fd4db` + D15로 정산 자체 취소 | 이적 사가 영구 기록 | — |

## P1

| # | 위험 | 상태 | 근거·재현 | 영향 | 권장 |
|---|---|---|---|---|---|
| R6 | **홈/원정 오류** | 🔴 (검증 부재) | 수집이 betman 필드 단순 신뢰(`lib/betman/game-fetcher.ts:213-214`). **실측: 빌라-뮌헨(8/7) betman 홈=빌라 vs Soccerway 홈=바이에른** | 핸디캡·정산·향후 라인업 귀속 | 외부 정본(API) 대조 술어 — 불일치 시 자동 스왑 금지, 검수 큐 |
| R7 | **같은 경기 중복 생성 (회차 간)** | 🟡 | DB 방어는 회차 내 UNIQUE(round_id,game_no)뿐. 30일 실측 크로스라운드 중복 474그룹 — 응답단 dedup으로만 가림. 베팅은 슬립 내 matchKey만 차단 | 통계·향후 경기문서 매핑 | canonical fixture 매핑(mapped_match_id) 도입 시 그룹핑 해소 |
| R8 | **연기 경기 처리 부재** | 🔴 | `postponed` enum만 존재(코드 0, DB 0행). 연기→in_progress 방치→48h 픽 자동취소 암묵 경로. 48h 내 재개 시 정상, 이후 결과 도착 시 픽 cancelled·게임 completed 조합 가능 | 예측 UX·기록 | 연기 정책 오너 결정(§missing-info) 후 상태 도입 |
| R9 | **순위 데이터 5개월 정지** | 🔴 (신규 발견) | standings 15리그 전부 fetched_at 2026-03-11, 스케줄러 리포 밖. 시즌위키 헤더 노출 중 | 실록·위젯 신뢰 | 개막(8/22) 전 재가동 — Vercel cron 이식 권장 |
| R10 | **잘못된 외부 경기 연결** | 🔴 (파이프라인 자체 부재) | mapped_* 0행 — 연결이 없으니 "오연결"은 미래 위험. 데모에서 이름·순서 함정 확인 | 명단·평점·실록 전체 | 골든셋 기반 매칭 게이트(§evaluation-plan) 없이 자동 연결 금지 |
| R11 | **동명이인 선수 오인** | 🟡 | 선수 마스터 부재 — 표기 사전(910행) 성 폴백은 사전 내 유일 성 한정(`lib/saga/canonical.ts:74-80`). 실사고: Romero 중복 행이 성 폴백 자가차단(점검 F6) | 사가·향후 평점 귀속 | canonical player ID(API) 도입 + 사전에 external_id 컬럼 |
| R12 | **뉴스 중복 게시** | ✅ 수리 | URL 4관문(유입·자동발행·초크포인트·사가 접기) `033265e7`+`568ab5cf`, 제목 유사도 병행 | 피드 품질 | 회귀 테스트 잠김 |
| R13 | **작업 재실행 시 중복 데이터** | 🟢 대체로 | 멱등 인벤토리: identity_key·(saga_id,cluster_key)·source_url UNIQUE·idempotency_key·CAS 정산·news_assignments 부분 유니크. **예외**: news_reservoir.dedupe_key는 일반 인덱스(코드 관례 의존), betman_rounds.gm_ts 유니크 없음(조회-후-insert race — 실측 중복 0) | — | 두 예외에 UNIQUE 추가 검토 |
| R14 | **출전 없는 선수 평점 / 선발·벤치 중복** | ⚪ 해당 파이프라인 미존재 | lineup/appearance/rating 0줄 | (미래) | 신설 시 술어로 선제 잠금(§evaluation-plan G-라인업) |
| R15 | **결과 데이터 없는 경기의 정산 시도** | 🟢 | settleable 필터(결과 없는 completed 제외 — `predictions-settle.test.ts` 잠김), 48h 만료 안전망 | — | — |

## P2

| # | 위험 | 상태 | 근거 | 권장 |
|---|---|---|---|---|
| R16 | 감시자 무로그 — withCronLog 미적용 7종(ops-monitor 포함) | 🔴 | probe-infra ① | 7종 래핑 (반나절) |
| R17 | OPENAI_API_KEY 등 zod 밖 env 12파일 | 🔴 | probe-infra ④ — 누락 시 라우트별 skip/500 제각각 | env.ts 편입 + .env.example 갱신 |
| R18 | pg_cron 6잡·Edge Function 소스 리포 밖 | 🔴 | DB 실측으로만 발견 | 마이그레이션/functions 디렉토리로 정본화 |
| R19 | agg-publish-queue 1회 실패=rejected 종착 | 🟡 | `agg-publish-queue/route.ts:43` | retry_wait 패턴 이식 (떡밥 재개 시) |
| R20 | 외부 장애 시 기존 데이터 손상 | 🟢 대체로 | 수집은 upsert·fail-open, 4xx 즉시 중단(`http-client.ts:39`). 잔여: R2 백필 스크립트 | R2 해소로 충족 |
| R21 | 마이그레이션 파일명↔적용 이력 갈라짐 | 🟡 | 파일명은 라벨, 정본은 원격 원장(probe-infra ④) | `supabase db push` 금지 유지, 관례 문서화 |
| R22 | 시간대 처리 — deadline 주석 "23:59 KST" 실제 UTC | 🟡 | `round/route.ts:94-97` (auto-close에만 사용, 실피해 낮음) | 주석·계산 일치화 |
| R23 | 전반전 중복행 어드민 노출 | 🟡 | `admin/matches/list/route.ts:25-46` 필터 부재 | 어드민에도 is_half_time 필터 |
| R24 | 파서 이중 구현(서버 keys vs VPS positional) | 🟡 | probe-betman 부록 3 — betman 스키마 변경 시 따로 깨짐 | VPS 사본 교체 시 keys 기반 통일 |
| R25 | 파이프라인 e2e 0 — 회귀는 프로덕션 실측 의존 | 🟡 | probe-infra ⑤ | 건틀릿 G2+골든셋이 대체 지점 |

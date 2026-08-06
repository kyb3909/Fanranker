# 현재 시스템 지도 (2026-08-06)

- 근거: 조사 3본(`workspace/gauntlet-probe-{betman,matchdata,infra}.md`, 파일:라인·SQL 실측) + 금주 뉴스·사가 점검(`workspace/saga-inspect-2026-08-06-final.md`) + 실경기 연결 데모(빌라-뮌헨).
- 원칙: 주석·문서가 아니라 실행 흐름 기준. 추정은 "추정:" 표기. 상세 증거는 프로브 문서 참조.

## 1. 실행 층위 — 스케줄러는 5층, 리포가 정본인 층은 1개

| 층 | 무엇 | 리포 검증 |
|---|---|---|
| Vercel Cron 23개 | 뉴스·사가·베트맨 상태·정산 안전망·라이브스코어 등 (`vercel.json`) — 전부 CRON_SECRET, **7개는 withCronLog 미적용**(감시자 ops-monitor 포함) | ✅ |
| Vultr VPS cron | 티커 크롤(10분)·뉴스 스캐너(15분)·betman 수집(2h) — **git 밖**, 리포에는 API 계약 사본만(`scripts/vps-betman-scraper.ts`) | ❌ |
| **pg_cron 6잡** | 온도 큐(매분 1,440회/일)·betman 헬스체크 등 — **리포에 정의 없음, DB 실측으로만 발견** | ❌ |
| **Edge Function** | `betman-sync-watchdog` — `supabase/functions/` 디렉토리 자체가 리포에 없음 | ❌ |
| 로컬 Hermes | 교정 학습(8/4 Vercel cron으로 이관, 현재 안전망) | ❌ |

큐는 없다 — 전부 "cron 폴링 + DB status 상태 기계". DLQ 개념이 있는 곳은 `news_assignments`(retry_wait/dead_letter) 하나뿐.

## 2. 파이프라인 3본 현재형

### A. 뉴스 → 이적 사가 (가동 중 — 금주 정밀 점검·수리 완료)

```
[VPS] Reddit/Naver 크롤 → 티커(news_ticker_items)          [VPS] 스캐너 → /api/news/agent-draft
                              │                                        │ (URL 유입 중복 차단 ✅)
                              ▼                                        ▼
                    saga-ingest(:12/:42) → saga_reservoir     news_reservoir(drafted)
                              │                                        │
                    saga-extract(15분, LLM 추출)              관심도 필터 → 자동발행 게이트
                    ├ 자동발행 4조건(사전·conf·한글·비여축)      (검사관 terra·사전·중복 URL+제목·이미지)
                    └ /admin2/saga 검수                                │ 발행 초크포인트(URL 최후방어 ✅)
                              ▼                                        ▼
                    sagas + saga_entries  ◄──── linkArticleToSaga ── posts 발행
                    (오피셜 단계 게이트 ✅, URL 접기 ✅, D7 전이 ✅)      │
                                                    비이적 → linkArticleToSeasonWiki(링크만)
```
- 관측: 후보 원장(news_candidates 1,887 + events) + funnel API + shadow 배정 데스크(587판정).
- 시즌 위키로는 **기사 링크만** 흐른다(9건) — 연표 엔트리 승격·편 분류는 미구현.

### B. 베트맨 예측 (가동 중 — 정산 코어 견고, 정정 경로 부재)

```
[VPS] betman.co.kr 수집 → POST /api/betman/{round,games} → betman_games (35,761행)
      회차 내 UNIQUE(round_id,game_no) / 회차 간 중복 474그룹(응답단만 dedup)
[VPS] 결과 수집 → POST /api/betman/results → 결과 반영 + 자동 정산(settlePredictions)
      + 15분 settle-pending 안전망 + 48h 만료 RPC + wisetoto 라이브스코어(표시 전용, 매분)
정산: status CAS 단일 메커니즘(멱등 테스트 잠김) · 환불 3회 재시도→pending_refunds
⚠️ 결과 정정: 정산 후에도 결과 덮어쓰기 가능(어드민·VPS 모두 status 무필터) ×
   재정산·역연산(manual_reverse) 코드 0줄 → 영구 불일치 가능
```
- ID: 외부 gmTs+matchSeq → 내부 uuid. **competition/season 개념 없음.** 팀명 자유 텍스트.
- `mapped_match_id/mapped_*_team_id/mapped_league_id` 컬럼 실재하나 **35,761행 전부 NULL** — 외부 매핑 파이프라인은 만들어진 적 없음.

### C. 경기 데이터·평점·실록 (대부분 백지 + 화석 2벌)

| 구성요소 | 상태 |
|---|---|
| lineup / appearance / match_event / rating | **전부 없음** — 테이블·코드 0줄 |
| 레거시 matches/teams/leagues | 2026-01 정지 더미(코드 참조 0) — 화석 1 |
| Soccerway 프리뷰(match_previews) | vertical slice 초입 정지 — 실적 1행(betman 매핑 NULL), cron 미등록, 노출 동선 0 — 화석 2 |
| 순위(standings_cache) | 네이버 api-gw 수집 — **15개 리그 전부 2026-03-11 정지**(스케줄러 리포 밖). 시즌위키 헤더가 5개월 묵은 순위 노출 중 |
| 라이브 스코어 | wisetoto → betman_games 점수만 (득점자·이벤트 없음) |
| API-Football | D11이 지정한 유일 공급원 — **코드 0줄, 예산 미결(Q3)** |
| 시즌 위키 | 저장 문서가 아니라 요청 시 조립 뷰(묵은 순위+betman 일정+정적 스쿼드 fpl json 820명+텍스트 매칭 연대기). 수정 이력(wiki_revision) 없음 |

## 3. 공통 엔티티 14종 존재 매트릭스 (요약 — 상세 §probe-matchdata ①)

| 온전 실재 (3) | 부분/분산 (7) | 없음 (4) |
|---|---|---|
| article, transfer_saga, settlement(베트맨측) | competition(4계열 분산) · season(사가 subject뿐) · match(betman만, 이원) · team(**8체계**) · player(**마스터 없음**, 3체계) · story_cluster(키 방식) · settlement(사가측 스키마만, D15 취소) | **lineup · appearance · match_event · rating** |

체계 간 조인은 전부 **한글 표기 문자열 매칭, FK 0** — 시즌위키 일정 `home_team_name.eq(alias)`, 순위 `팀명===team_kr`, 연대기 `headline ilike %alias%`.

## 4. 실경기 연결 데모 (2026-08-06 실측 — 빌라 vs 뮌헨 8/7 21:00 KST)

1. betman_games에 실재(`축클럽친`, 마켓 4행) — mapped_* 전부 NULL
2. Soccerway 날짜 페이지에서 발견 — 매치 URL + 팀 해시 ID(`W00wmLO0`/`nVp0wiqd`) 획득 가능
3. ⚠️ **홈/원정 불일치 실측**: betman 홈=빌라 vs Soccerway 홈=바이에른 — "홈원정 오류" 위험이 실경기에 실존
4. 킥오프·라인업은 정적 fetch 불가(JS 렌더) — headless 또는 API 필요

## 5. 외부 서비스 연결 전수

| 서비스 | 용도 | 상태 |
|---|---|---|
| betman.co.kr | 경기·배당·결과 (한국 IP — VPS 경유) | 가동 |
| wisetoto | 라이브 스코어 | 가동(매분) |
| Reddit/Naver/해외 RSS | 뉴스·티커·사가 수집 | 가동 |
| naver api-gw (sports) | 순위 15리그 | **3/11 정지** |
| OpenAI | 추출·검사관·배정 등 12파일 (**env zod 밖**) | 가동 |
| Soccerway | 프리뷰 추출(수동 1회) | 정지 |
| API-Football | (계획) 경기 데이터 정본 | 미착수 |
| Discord/Sentry/Clerk/PortOne/CF Stream | 알림·에러·인증·결제·영상 | 가동 |

## 6. 관측·수정 이력 (요약 — 상세 §probe-infra ③)

- 답할 수 있음: 봇 기사 수정(pre_edit), 정산(settlement_audit_log), 관리자 행위(admin_audit_logs 16라우트), 뉴스 후보 전이(원장), cron 16종 실행(cron_run_log 125k행).
- 답할 수 없음: 유저 글 편집 이력, 사가 엔트리 diff(위키 리비전 없음), 사전 수동 변경 이력, env 토글 이력, pg_cron 변경 이력.
- 침묵 지대: withCronLog 없는 cron 7종, after() 6곳 실패, agg 발행 실패(1회 실패=rejected 종착), 디스코드 웹훅 자체 실패.

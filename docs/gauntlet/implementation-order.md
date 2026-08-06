# 구현 순서 (2026-08-06)

- 전제: 8/22 EPL 개막 · 8/31 데드라인 데이(로그 종결만 — D15) · 9월 Phase B(MatchSaga).
- 원칙: 각 단계는 이전 단계 EVIDENCE 통과 후 진행. 자동 반영은 골든셋 게이트 전 금지.

## 단계 0 — 즉시 수리 ✅ **완료 (2026-08-06, `2a22e108..8af9ed07` 5커밋 push)** — EVIDENCE: `docs/evidence/EVIDENCE_stage0_2026-08-06.md`

| # | 작업 | 근거 | 변경 범위 | 롤백 |
|---|---|---|---|---|
| 0-1 ✅ | **정산 후 결과 덮어쓰기 가드** — settled 픽 존재 시 결과 변경·취소 전환·상태 후퇴 차단 (D-5 전 전면 금지, 순수 판정 `lib/betman/result-guard.ts` + 테스트 17) | R1 | `admin/matches/result`·`betman/results` 라우트 2곳 | 가드 제거 revert |
| 0-2 ✅ | **순위 재가동** — Vercel cron `standings-refresh` 매일 08:00 KST, 시즌 코드 실시간 isDefault 우선(핀 폴백) | R9 | vercel.json + 라우트 1 + lib 추출 | cron 제거 |
| 0-3 ✅ | 백필 스크립트 가드 — 킥오프+2.5h 미만 제외 + 드라이런 기본(`--apply` 필수) | R2 | scripts 1 | revert |
| 0-4 ✅ | withCronLog 7종 소급 (감시자 ops-monitor 포함) | R16 | cron 라우트 7 | revert |
| 0-5 ✅ | env zod 편입(OPENAI 등 12키) + .env.example 갱신 | R17 | lib/env.ts | revert |
| 0-6 ✅ | pg_cron 6잡·Edge Function 정본화 — `docs/PG_CRON_JOBS.md` (정본은 DB, 문서는 기록) | R18 | 문서 | 해당 없음(기록) |

## 단계 1 — 오너 결정 (잔여분 — missing-information.md)

~~Q3 API 예산~~ → **D16으로 해소 (2026-08-06): Soccerway 크롤 우선 + 무료 API 보정.** ~~무료 API 선택(I-3)~~ → **조사 완료 (2026-08-07): football-data.org free 우선 추천** — 현 시즌 EPL 스코어 무료 확정(12개 대회·10콜/분), D16 보정 역할에 충분. API-Football 은 오너 무료 키 등록 테스트(5분)로 현 시즌 접근 여부만 판별하면 끝 (상세 missing-information I-3). 잔여 결정: 실록 편 구성(D-3)·정정 정책(D-5)·연기 정책(D-6).

## 단계 2 — 신원(identity) 기반: 팀 사전 + 경기 매핑 (개막 전 목표, D16 반영)

| 작업 | 선행 | 변경 범위 | 롤백 |
|---|---|---|---|
| team_dictionary 신설(soccerway 해시 PK) + 후보 제안 화면(1클릭 등재 패턴 복제) | — (D16 확정됨) | 마이그 1 + admin 화면 1 + lib | 테이블 drop (참조 없을 때) |
| EPL+주요 리그 팀 시드(오너 확정 라벨) — 날짜 페이지 크롤로 해시 수확 | 사전 화면 | 데이터만 | 행 삭제 |
| **경기 매핑 파이프라인** — betman→Soccerway 날짜 페이지(정적) 매치 발견, 동일성 술어, mapped_match_id=mid 기록, 불일치 검수 큐 | 팀 사전 | cron 1 + lib + 시도 원장 테이블 1 | mapped_* NULL 복원(원장 보존) |
| **매칭 골든셋 게이트 통과** (G-매칭 50쌍) — 통과 전 자동 기록은 shadow만 | 골든셋 라벨(오너) | — | — |
| 홈/원정 대조 술어 (Soccerway 정본, 불일치→검수 큐, 자동 스왑 금지) | 매핑 | 술어 1 | — |

## 단계 3 — 경기 데이터 인제스트 (개막 직후 백필 포함, D16 반영)

| 작업 | 선행 | 변경 범위 | 롤백 |
|---|---|---|---|
| fixtures/lineups/appearances/match_events/player_ratings 마이그 5종 (FK로 R14 원천 봉쇄) | 단계 2 | 마이그 | drop (참조 전) |
| **headless 크롤 부활** — preview-extract 계열을 라인업·이벤트 추출로 확장 (VPS 배치 — VPS 변경은 오너 승인·별도 배포) | 마이그 | data/agents/scripts + VPS | 스크립트 미실행 |
| 무료 API 보정 호출 (FT 후 스코어·득점자 대조 → 불일치 검수 큐) — I-3에서 API 선택 | 인제스트 | lib + cron 1 | 보정 생략(크롤 단독) |
| 인제스트 수신 cron/API (VPS→Vercel, agent-draft 패턴) — retry_wait/dead_letter 표준 | 마이그 | cron 2 + lib | cron 해제 |
| 검증 술어 상시화: 평점⊆출전, 선발∩벤치=∅, 이벤트 선수∈양팀 명단 | 인제스트 | 술어 | — |
| **개막 후 백필** — 지난 라운드 소급 (PRD B1 "백필 가능"의 실행) | 게이트 통과 | 데이터만 | 원장 역재생 |

## 단계 4 — 편찬: MatchSaga + 실록 승격

| 작업 | 선행 | 변경 범위 | 롤백 |
|---|---|---|---|
| MatchSaga 생성 (identity `match:{fixture_id}` — 스텁 실재, D3) + 문서 UI | 단계 3 | lib/saga + UI | 사가 타입 미노출 |
| 뉴스 → 실록 **엔트리 승격 + 편(篇) 분류** (배정 데스크 desk 판정 실전화 — shadow 587판정 검증 후) | 편 구성 결정 | lib/news/publish 훅 확장 | 훅 되돌림(링크만으로) |
| wiki_revisions 도입 + published-fixes·naming-audit 경유 의무화 | — | 마이그 1 + 라우트 2 | 기록 중단(테이블 유지) |
| 리뷰 자동 생성 (D14: 데이터+커뮤니티 반응, 외부 텍스트 금지) — HITL 검수 경유 | MatchSaga | cron 1 + 프롬프트(버전 의무) | 발행 중단 |
| SeasonSaga 롤업 (라운드 연혁·누적 스탯·폼 곡선·월간 리캡) | MatchSaga | season.ts 확장 | 뷰 폴백(현행 조립) |
| **팬 평점 메뉴** (player_rating_votes — 출전자 한정 FK, FT 후 오픈, 정산 직후 모달 노출) | 단계 3 출전 데이터 | 마이그 1 + 위젯 + 모달 훅 | 위젯 미노출 |

## 단계 5 — 후순위 (8/31 이후 백로그)

연기 상태 도입(정책 결정 후) · manual_reverse 역연산 · agg retry 패턴 이식 · 자체 평점 계산식 · G4 정산 건틀릿(속성·변이) · 파서 이중 구현 통일 · 유저 제안(D8) 메커니즘.

## 일정 스케치 (타임박스)

- **~8/8**: 단계 0 전부 + 결정 회신
- **~8/15**: 팀 사전 + 매핑 shadow + 골든셋 라벨
- **~8/21 (개막 전)**: 매칭 게이트 통과 → 매핑 실기록, 순위·일정 정상화
- **8/22~**: 라인업·평점 인제스트 라이브 + 백필, MatchSaga 첫 문서
- **~8/31**: 실록 승격(편 분류) — 데드라인 데이를 이적+경기 양축이 있는 실록으로 맞이

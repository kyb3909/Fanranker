# 목표 아키텍처 — "세종실록" 3층 구조 (2026-08-06)

- 방향타: 오너 비전 = **"기사는 흘러가지만 기록은 자산이 된다"** — 경기 평점·스탯·리뷰·이면 뉴스가 하나의 자라는 실록으로.
- 제약: PRD 결정 로그(D1~**D16**) 준수. **D16 (2026-08-06 오너, D11 개정) = Soccerway 크롤 우선 + 무료 API 교차 보정** — 매치 발견은 정적 fetch, 라인업·기록 상세는 headless(기존 match-preview 인프라 부활, VPS), FT 후 무료 API로 스코어·득점자 대조(불일치→검수 큐). 유료 API는 파손·차단 시 폴백. ~~API-first~~ 문구는 이 개정으로 대체.
- 원칙: 런타임 멀티에이전트 금지(단순 체인+결정론 검증+HITL) / fail-closed 품질·fail-open 연동 / 신규 검증은 dev-time 건틀릿.

## 1. 큰 그림 — 사초 3갈래 → 편찬 → 실록

```
정사(正史): API 경기 데이터        야사(野史): 뉴스룸(가동 중)      민심(民心): 커뮤니티(배선됨)
fixtures·lineups·events·ratings    이적·사건·발언·사고 기사          투표·댓글 스탠스 스냅샷
        │                                  │                              │
        ▼                                  ▼                              ▼
   [매핑 사전 2종]                  [편(篇) 분류 — 배정 데스크        [D10 스냅샷 — 기존]
   팀·선수 (사람 확정)               desk 판정 재사용]
        │                                  │                              │
        └────────────┬─────────────────────┴──────────────────────────────┘
                     ▼
        MatchSaga (경기 문서: 라인업·이벤트·평점·리뷰 D14)
        TransferSaga (이적 문서: 가동 중)
                     │  롤업
                     ▼
        SeasonSaga = 실록 (연표에 경기·뉴스·민심이 날짜순으로 짜임)
```

## 2. 권장 데이터 모델

### 2.1 canonical ID 원칙 — "왕은 Soccerway ID, 내부는 매핑 사전" (D16 반영)

현재 팀 8·선수 3·리그 5·경기 4개 체계가 문자열 매칭으로 이어져 있다(probe-matchdata ③). 9번째 내부 체계를 발명하지 않는다 — **Soccerway의 ID(팀 해시·선수 페이지 ID·경기 `mid`)를 canonical로 삼고**, 기존 체계들은 매핑 사전으로 접붙인다. 무료 API의 ID는 보정용 보조 컬럼(nullable)로 병기 — 폴백 전환 시 canonical 승격 가능하게.

- **팀 사전** `team_dictionary` (신규): soccerway_team_id PK(해시 — 빌라 `W00wmLO0` 형식), name_en, name_kr(대표), aliases_kr[] (betman 표기·네이버 표기·사가 alias 흡수), free_api_team_id(보정용, nullable), team_map_pin_id(스타디움 연계, nullable). 등재 흐름 = 선수 표기 사전과 동일: **후보 자동 제안, 확정은 사람 클릭**.
- **선수 사전** = 기존 `news_alias_dictionary(category=player)`에 `soccerway_player_id` 컬럼 추가 — 마스터 신설 대신 910행 자산에 접붙임. 라인업 크롤 시 선수 링크에서 ID 수확. fpl json은 시드 소스로 강등.
- **경기** = `betman_games.mapped_match_id`(이미 존재, 전행 NULL)에 **soccerway `mid` 저장** — 스키마 신설 불요. 발견 경로: 날짜 목록 페이지 정적 fetch(실측 검증됨 — 빌라-뮌헨).

### 2.2 신규 테이블 5종 (경기 데이터 — 전부 append 지향)

| 테이블 | 키·핵심 컬럼 | 비고 |
|---|---|---|
| `fixtures` | api_fixture_id PK, league/season/round, home/away api_team_id, kickoff_utc, status, venue | betman과 1:N 아님 — betman_games.mapped_match_id → 여기 |
| `lineups` | (fixture_id, team_id) — formation, starters[](api_player_id), bench[] | **선발∩벤치=∅ CHECK는 코드 술어로** |
| `appearances` | (fixture_id, api_player_id) UNIQUE — minutes, position, is_starter | 평점의 유일한 유효 대상 |
| `match_events` | (fixture_id, seq) — type(goal/card/sub…), minute, api_player_id | |
| `player_ratings` | (fixture_id, api_player_id) UNIQUE + **FK→appearances** | **출전 없는 평점을 DB가 원천 봉쇄** (R14 선제). source(api\|computed), value, provenance |
| `player_rating_votes` | (fixture_id, api_player_id, user_id) UNIQUE + **FK→appearances**, value 1~10, append-only | **팬 평점 (민심 층, 2026-08-06 오너 발제)** — API 평점 옆에 나란히. FT 후에만 오픈. 응원팀 flair 로 팬덤별 분화 집계. 핵심 노출 = 베트맨 정산 직후 모달(기존 예측완료 주입 패턴 재사용 — 사가 투표 0표 교훈: 버튼이 아니라 동선이 생명) |

### 2.3 provenance 표준 (source provenance 구조)

사가 엔트리의 `origin{url,outlet,reporter}+echoes[]` 패턴이 이미 검증된 provenance다 — 전 파이프라인 표준으로 승격:
- 모든 자동 생성 행: `source`(공급자), `source_ref`(api id/url), `ingested_at`, `run_id`(cron 실행 추적 — 후보 원장 관례).
- 실록 연표 엔트리: 정사 엔트리는 `fixture_id` 참조, 야사 엔트리는 `post_id`(기사) 참조 — **모든 문장이 출처를 갖는다** (근거 없는 문장은 발행 게이트 통과 불가 — 킥오프 §가드레일).

### 2.4 wiki_revision (수정 이력)

`wiki_revisions`: (target_type, target_id, field, before, after, actor, reason, created_at) — published-fixes·naming-audit·향후 편집 도구가 **in-place 수정 전 필수 기록**. R4(수동 수정 덮어쓰기)의 구조적 해소. 롤백은 이 원장 역재생.

## 3. 파이프라인 재설계 (지시서 3본 ↔ 단계 매핑)

### 뉴스 파이프라인 (현행 유지 + 2단계 추가)
수집→중복제거(URL 4관문 ✅)→클러스터(cluster_key+에코 ✅)→엔티티 연결(사전 ✅)→주장·출처(origin/tier ✅)→이적 상태 판정(오피셜 게이트 ✅)→사가 반영(✅) **+ [신규] 편 분류(배정 데스크 desk 판정 실전화) + 실록 엔트리 승격**(현재 링크만 쌓임 → 연표 엔트리로).

### 경기 운영 파이프라인 (현행 유지 + 정정 경로 보수)
일정 수집→경기 생성(✅)→상태 추적(✅)→결과 확정→정산(CAS ✅)→중복 정산 검증(✅) **+ [수리] 정산 후 결과 변경 가드(R1) + 연기 상태 도입(R8, 정책 결정 후)**.

### 경기 데이터 파이프라인 (신설 — D16: Soccerway 크롤 + 무료 API 보정)
```
betman 경기 → [팀 사전] 팀 해석 → Soccerway 날짜 페이지 정적 fetch → 매치 후보
  → 동일성 술어(팀쌍 일치·킥오프 ±2h·대회) → mapped_match_id = soccerway mid
    (모호하면 무매핑+검수 큐, fail-closed / 홈원정은 Soccerway 정본 — betman과 불일치 시 큐)
  → 킥오프 전: [headless·VPS] 라인업 크롤 → FT 후: [headless] 이벤트·스탯 크롤
  → [무료 API 1~2호출] 스코어·득점자 교차 대조 — 불일치는 자동 수정 없이 검수 큐
  → 검증 술어(출전∩평점·선발∩벤치=∅ 등) → MatchSaga 문서(리뷰는 D14)
  → SeasonSaga 롤업(라운드 연혁·누적 스탯·폼)
```
- headless 층은 기존 match-preview 인프라(`data/agents/scripts/preview-extract-run.js` 계열, Playwright·VPS) 부활·확장. 마크업 파손 감지 = 무료 API 대조 실패율 급증 → 알림 + 유료 API 폴백 검토(D16).
- 평점: 1차 = **팬 평점(자체 — player_rating_votes)**. 데이터 평점은 무료 API 또는 자체 계산 후속(D-4 잔여).
- 재시도 표준: `news_assignments` 패턴 이식 — 시도 원장 + retry_wait/dead_letter + (대상, 입력 해시)부분 유니크로 재호출 봉인.

## 4. 큐·재시도 구조 (표준화)

새 인프라 도입 없음(큐 부재는 현 규모에서 문제 아님). 대신 **관례를 표준으로 명문화**:
1. 모든 신설 파이프라인 = cron 폴링 + status 상태 기계 + **DB 유니크 멱등**(코드 관례 금지 — R13 예외 2건도 UNIQUE 승격).
2. 실패 분류 의무: 판정 실패(reject류)와 실행 실패(retry_wait/dead_letter)를 절대 같은 값으로 합치지 않는다 (금주 3회 실사고의 교훈).
3. cron 신설 시 withCronLog + CRON_SECRET 필수 (기존 7종 미적용분 소급 — R16).

## 5. 검증·승인 구조

- **런타임**: 결정론 게이트(사전·URL·티어·오피셜) → LLM 판정(fail-closed) → HITL 큐(/admin/news-review·/admin2/saga) → 자동발행은 게이트 전 통과분만. 신규 파이프라인(경기 데이터)도 동일 형: **매칭·평점은 골든셋 게이트 통과 전 자동 반영 금지**.
- **dev-time**: 건틀릿(G1 가동 ✅, G2 골든셋 승인됨) — 게이트별 술어·크리틱·EVIDENCE. 상세는 `evaluation-plan.md`.
- **승인 등급**: 자동(술어 전부 green + 위험 low) / 수동(신규 유형·불일치·high risk) — 배정 데스크 risk 필드가 에스컬레이션 축.

## 6. 오너 결정 대기 (설계 분기점 — missing-information.md 상세)

Q3 API 예산·플랜 / D11 vs match-preview PRD 정리(soccerway 화석 폐기 여부) / 실록 편(篇) 구성 / 평점 소스(API vs 자체식) / 연기·정정 정책.

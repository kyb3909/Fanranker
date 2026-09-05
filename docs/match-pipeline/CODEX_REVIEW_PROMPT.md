# 경기 파이프라인 검수 — 코덱스용 프롬프트

아래 내용을 그대로 코덱스에게 붙여넣는다. (2026-09-05 작성)

---

당신은 이 저장소(gongnori.fan, Next.js 15 / Supabase)의 **경기 파이프라인**을 독립 검수하는 리뷰어다.
목표는 "설계가 말하는 대로 코드가 실제로 도는가"를 단계별로 판정하는 것이다. 코드를 고치지 말고, 판정과 근거만 낸다.

## 하지 말 것
- 코드 수정 · 커밋 · push 금지. 읽기만 한다.
- DB 쓰기 금지. 조회가 필요하면 읽기 전용 SQL 만.
- 추측으로 판정하지 않는다. 모든 판정에 `파일:줄` 근거를 붙인다. 근거를 못 찾으면 "확인 불가"라고 쓴다.

## 설계 — 이것이 "정상"의 정의다

파이프라인은 6단계이고, 각 단계의 정본(source of truth)이 정해져 있다.

| # | 단계 | 정본 | 설계 규칙 |
|---|---|---|---|
| 1 | 경기 일정 | **betman** (`betman_games`) | betman 이 파는 경기만 싣는다. LFA 는 같은 경기의 라이브 상태·스코어를 얹는 보강. **예외**: 인기 팀 14(빅6 + 유럽 8, `lib/match/popular-teams.ts`)는 betman 에 없어도 싣는다 — "포칼이나 컵대회에서 하부리그 팀과 만나도" |
| 2 | 라인업 | soccerway → LFA 폴백, `match_lineups` 영구 저장 | 예상 라인업(projected)은 저장 금지. 벤치 0 저장분은 자가 수리. 형제 행(같은 경기의 마켓별 6행) 전수 조회 |
| 3 | 불판 | `posts` (봇 작성, `match_game_id`) | 킥오프 −90분 ~ +120분 창, 라인업 `ready` 인 화이트리스트 경기만, 중복 방지 3중 |
| 4 | 실시간 스탯 | **LFA** (`lfa_day_cache` · `match_details_cache`) | betman 은 라이브를 안 준다. 목록 5분 · 상세 120초 캐시. 스코어는 뒤로 안 간다(단조 증가). DB 가 정본 창고, 화면은 외부 API 를 기다리지 않는다 |
| 5 | 종료 판정 | LFA `finished` | betman `completed` 는 정산 산물이라 FT 판정에 쓰지 않는다 |
| 6 | 매치 리포트 | Soccerway 원문 + LFA 종료 점수 | 2026-09-06 지시: 베트맨 결과 유무·불일치와 무관하게 진행. 원문 없음 · LFA 종료 점수 없음 · 작성 검증 실패는 `match_report_attempts`에 기록. 대상은 `MATCH_EXTRAS_LEAGUES`만 |

화이트리스트는 **한 곳**: `lib/match/leagues.ts` (`MATCH_PAGE_LEAGUES` / `MATCH_EXTRAS_LEAGUES`). 복사본을 두면 갈라진다.

## 읽을 파일 (단계 순)

```
1 일정   lib/match/get-fixtures.ts · lib/lfa/fixtures.ts · lib/match/popular-teams.ts · lib/match/pair-fixtures.ts
         lib/match/leagues.ts · lib/lfa/leagues.ts (LFA_LEAGUE_IDS)
         app/api/betman/games/route.ts (VPS 동기화 수신) · app/api/cron/betman-sync/route.ts
2 라인업 app/api/cron/lfa-warm/route.ts · lib/match/get-lineup.ts · lib/soccerway/lineup-lookup.ts · lib/lfa/lineups.ts
         lib/lfa/persist.ts · lib/match/pick-sibling-row.ts · lib/match/sibling-ids.ts
3 불판   app/api/cron/match-threads/route.ts · lib/match/thread.ts
4 실황   lib/lfa/match.ts · lib/lfa/day-freshness.ts · lib/lfa/stat-labels.ts
         app/match/[gameId]/page.tsx · app/match/[gameId]/live-refresher.tsx · lib/match/score-precedence.ts
5·6 리포트 app/api/cron/match-reports/route.ts · lib/soccerway/match-extras.ts · lib/soccerway/confirmed-score.ts
         lib/soccerway/score-gate.ts · lib/soccerway/report-gaps.ts · lib/soccerway/report-attempts.ts
크론   vercel.json (crons) · lib/ops/invariant-catalog.ts
```

크론 실측 주기: `lfa-warm */15` · `match-threads */10` · `match-reports */30` · `betman-sync */30` · `settle-pending */15` · `invariant-audit 44 * * * *`. VPS 쪽은 별도로 `sync.sh` 매시 :10, `fetch-results.sh` 15분.

## 검증 질문 — 단계마다 예/아니오 + 근거

### 1. 일정
- Q1-1 `getFixturesForDay` 가 betman 을 정본으로 두고 LFA 를 얹는가. 짝을 못 찾은 betman 행을 버리지 않는가.
- Q1-2 인기 팀 예외가 실제로 동작하는가: LFA 전용 행이 `isPopularFixture` 를 통과해 `merged` 에 들어가는 경로를 추적하라. 그 행의 `gameId` 는 무엇인가. **그 행이 2~6단계(라인업·불판·실황·리포트)로 이어지는가, 아니면 일정 표시에서 끝나는가.** 운영자 의도("그 팀들이 나왔으면")와 실제 동작의 차이를 명시하라.
- Q1-3 `MATCH_PAGE_LEAGUES` 의 코드가 전부 `LFA_LEAGUE_IDS` 에 매핑돼 있는가. **빠진 코드를 전부 나열하라.** 빠지면 그 대회 경기는 어느 단계부터 끊기는가.
- Q1-4 `lib/lfa/fixtures.ts` 가 `MATCH_PAGE_LEAGUES` 로 거른다. 인기 팀이 화이트리스트 **밖** 대회(예: 하부리그 원정 컵, 친선전)에 나오면 예외가 동작하는가.

### 2. 라인업
- Q2-1 라인업이 **언제** 처음 저장되는가 — 어느 코드 경로가 킥오프 전에 저장하는가(soccerway 경로의 창을 찾아라). 2026-09-05 실측: 04:00 킥오프 경기가 02:49 에 저장됨.
- Q2-2 `lfaLineupFallback` 이 projected 를 저장하지 않는지, `healHalfBakedLineup` 이 벤치 0 저장분을 실제로 갈아끼우는지 — 조건과 정지 조건을 확인하라.
- Q2-3 `lfa-warm` 이 `f.gameId` 없는 행을 거른다. 인기 팀 예외 행은 여기서 어떻게 되는가.
- Q2-4 형제 행 6개 중 라인업이 한 행에만 저장된다(실측: game_no 8866 만 1행). 읽기 경로(`loadStored`)가 형제 전수를 보는지, 쓰기 경로는 어느 행에 쓰는지 — 불일치 가능성을 판정하라.

### 3. 불판
- Q3-1 창(−90/+120)과 `status !== "completed"` 조건이 KST 06:00 매치데이 경계와 맞물려 **새벽 04:00 킥오프 경기**를 놓치는 경우가 있는가. `todayKst()` 의 계산을 따라가라.
- Q3-2 중복 방지 3중이 실제로 3중인가 — `match_game_id` unique 인덱스가 DB 에 존재하는지 마이그레이션에서 확인하라.
- Q3-3 라인업이 `ready` 가 아니면 스킵한다. 라인업이 킥오프 −90 안에 안 오는 경기(하부 컵, LFA 지연)는 불판이 영영 안 생기는가, 아니면 +120 안에 재시도되는가.

### 4. 실시간 스탯
- Q4-1 캐시 계층을 전부 나열하고 각 TTL 을 적어라: `lfa-day`(live/settled) · `lfa-details-v2`(live/settled) · 페이지 `revalidate` · `LiveRefresher` 폴링 · DB(`lfa_day_cache`·`match_details_cache`)의 stale 판정(`day-freshness.ts`). **최악의 화면 지연을 초 단위로 계산하라.**
- Q4-2 `day-freshness.ts` 의 stale 판정이 화이트리스트 리그만 세는가. 화이트리스트 밖 경기(K리그 등)가 같은 날에 있을 때 그 경기의 표시가 얼어붙는 것이 **설계**인지 **결함**인지, 코드 주석을 근거로 판정하라.
- Q4-3 `resolveMatch` 의 "정확히 1건" 규칙과 2026-09-02 팀명 가드. 동시 킥오프 슬롯에서 남의 경기에 붙을 수 있는 경로가 남아 있는가.
- Q4-4 `stat-labels.ts` — 라벨 대조가 정확일치인가 정규화인가. LFA 가 라벨을 바꾸면 몇 개가 죽는가(2026-08 실사고: 9개 중 8개). 경보(`console.warn`)는 어디로 가는가 — 관제실/디스코드에 닿는가, 로그에만 남는가.
- Q4-5 라이브 스코어 단조 증가 규칙(`dh > info.homeScore`)이 VAR 취소·정정 시 어떻게 되는가. 다음 갱신에서 바로잡힌다는 주석이 코드로 보장되는가.
- Q4-6 **주석-코드 불일치**: `page.tsx:45`·`page.tsx:105`·`live-refresher.tsx` 가 "60초"라고 적혀 있는데 실제 값은? 전부 나열하라.

### 5·6. 종료 · 리포트
- Q5-1 `match-reports` 크론이 `f.status === "completed"` 인 경기만 대상으로 삼는다. 이 `status` 가 betman 것이면 설계(FT 판정은 LFA)와 어긋난다. 어느 status 인가.
- Q5-2 `confirmScore`가 LFA 종료 점수만 받으며 베트맨 결과 미도착·불일치로 리포트를 막는 경로가 없는지 확인하라 (2026-09-06 운영자 지시).
- Q5-3 `match-extras.ts` 의 `score` 게이트와 `article` 게이트가 순차인가 독립인가. `article` 시도 기록이 있다고 `score` 가 통과했다고 볼 수 있는가.
- Q5-4 `match-reports` 크론의 `resolve` 기록 조건(`hasRecentReportAttempt(gameId, 10분)`)이 30분 크론 주기와 맞물려 **원문이 없는 경기에 30분마다 "soccerway 매핑 없음"이라는 틀린 라벨을 남기는지** 판정하라. 24시간 창이면 최대 몇 건인가.
- Q5-5 리포트 대상이 `MATCH_EXTRAS_LEAGUES` 인데 크론은 `isMatchPageLeague` 로 거른다(`match-reports/route.ts:61`). 두 목록의 차이(FA컵·리그컵·UEL 등)가 크론에 들어와 `getMatchExtras` 에서 어떻게 처리되는가 — 헛 호출·헛 기록이 생기는가.

### 횡단 — betman `status` 리셋 (최우선)
2026-09-05 실측: 04:10 · 05:10 · 06:10 · 07:10 · 08:01~10 · 09:11 — **매시 초반 모든 행이 `scheduled` 로 되돌아가고 :15~:17 에 fetch-results 가 복구**한다. 정산·스코어는 남고 `status` 만 되돌아간다. 라이브 라운드 680행 중 킥오프 4시간 넘은 134행이 `scheduled`, 어제 KBO·MLB 는 최종 스코어를 갖고도 `scheduled`.

- QX-1 `status: "scheduled"` 를 쓰는 경로를 **전부** 찾아라: `app/api/betman/games/route.ts:286` · `scripts/vps-betman-scraper.ts:253` · `lib/betman/game-fetcher.ts:216` · `scripts/betman-fetch-games.ts:93` · **`app/api/cron/betman-sync/route.ts`(Vercel, 30분)**. 각 경로가 기존 행의 status 를 덮는지, 보존하는지 판정하라.
- QX-2 `games/route.ts` 의 `rowsKeepingStatus` 가드(2026-09-03)가 왜 못 막는지 가설을 세우고 코드로 검증하라. 후보: (a) `betman-sync` 크론이 가드 없는 별도 경로 (b) read-then-upsert 경합 (c) round_id 스코프. 로그 없이 코드만으로 판정 가능한 범위를 명시하라.
- QX-3 `betman_games.status` 의 DB 기본값이 `'scheduled'` NOT NULL 이다. **동기화 payload 에서 `status` 를 아예 빼는** 수리가 안전한지 — PostgREST upsert 가 payload 에 없는 컬럼을 `DO UPDATE` 에서 제외하는지, 이 저장소의 supabase-js 버전에서 확인하라.
- QX-4 이 리셋이 6단계 어디에 닿는가: `match-reports` 의 `completed` 필터, 관제실 "경기 결과 대기", 홈 밴드 라이브 배지, `settle-pending`. 각각 영향 있음/없음을 근거와 함께.
- QX-5 `lib/ops/invariant-catalog.ts` 에 "킥오프 지난 경기가 `scheduled`" 불변식이 있는가. 없으면 어디에 어떤 조건으로 넣어야 하는지 제안하라.

## 이미 잡힌 의심 3건 — 확인 또는 반박하라
1. **코파 델 레이 매핑 누락** — `MATCH_PAGE_LEAGUES` 에 `"스페FA컵"` 이 있는데 `LFA_LEAGUE_IDS` 에 없다. 결과: 그 대회 경기는 라인업·실황·불판·리포트가 전부 안 됨. 다른 누락도 있는지.
2. **인기 팀 예외는 일정 표시에서 끝난다** — LFA 전용 행은 `gameId: null` 이라 `lfa-warm`·`match-threads`·매치 페이지가 전부 거른다. 운영자 의도와 다른지 판정.
3. **betman status 리셋** — 위 QX. `betman-sync` 크론이 새 용의자.

## 산출물 형식

```
## 판정표
| 단계 | 질문 | 판정(정상/결함/설계의도/확인불가) | 근거 file:line | 심각도(P0~P3) | 한 줄 |

## P0·P1 상세 — 재현 조건 · 영향 범위 · 최소 수리안 (코드는 쓰지 말고 설명만)
## 설계-코드 불일치 목록 (주석이 거짓말하는 곳)
## 확인 못 한 것과 그 이유
```

한국어로, 평이하게. 내부 코드네임을 설명 없이 쓰지 말 것.

## 참고 — 2026-09-05 입스위치 vs 리버풀 실측 타임라인 (KST)

```
02:49:32 라인업 저장 (선발 11/11 · 벤치 9/9, status=ready) — 킥오프 −71분
04:00    킥오프 · 04:01 betman in_progress
04:10    betman 전 행 scheduled 리셋 → 04:10:53 복구        ← 매시 반복
04:13    LFA 0-1 8'  · 04:58 HT · 05:13 48'
06:01:47 LFA 상세 finished=true  (목록은 06:13 — 12분 늦음)
06:01:48 리포트 1차 시도 score 실패(betman 스코어 null) · 06:01:50 article 실패(원문 없음)
07:16:43 betman completed 0-2 (종료 +63분)
07:17:20 정산 완료 (슬립 won, 결과 +37초)
07:30:48 match-reports 크론 첫 대상화 → `resolve` 포괄 라벨 (안쪽 기록 17분 전이라 자동 부착)
07:40    article 재실패 — 최종: 원문 부재로 미발행 (설계대로)
08:01:47 정산 끝난 행이 다시 scheduled 로 리셋
```

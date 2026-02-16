# Betman 데이터 파이프라인 아키텍처 문서

> 작성일: 2026-02-15
> 최종 업데이트: 2026-02-15 09:14 UTC
> 작성자: 시니어 백엔드/인프라 엔지니어 + SRE

---

## 1. 타임라인: Vultr VPS에서 수행한 작업

| 순서 | 시간 (KST) | 작업 | 근거 |
|------|-----------|------|------|
| 1 | 2026-02-15 ~16:00 | Vultr VPS 프로비저닝 | IP: `158.247.193.9`, Ubuntu 22.04.5 LTS, 1vCPU/1GB RAM |
| 2 | 2026-02-15 ~16:30 | `/opt/betman/` 디렉토리 생성, `.env` 설정 | `.env`에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 저장 |
| 3 | 2026-02-15 ~16:50 | `sync.sh` 작성 및 배포 (188줄) | betman.co.kr에서 게임 데이터 크롤링 → Supabase REST 직접 저장 |
| 4 | 2026-02-15 17:13 | `sync.sh` 첫 실행 성공 | `sync.log`: gmTs=260020, 411건 저장 확인 |
| 5 | 2026-02-15 ~17:30 | `fetch-results.sh` 1차 작성 및 배포 (172줄) | 경기 결과 수집 + Supabase RPC 정산 |
| 6 | 2026-02-15 17:51 | `fetch-results.sh` 1차 실행 → **파싱 실패** | `results.log`: "파싱 결과 없음" — jq 1.6에서 `\s` regex 미지원 |
| 7 | 2026-02-15 ~17:55 | jq regex 수정 (`\s` → `sub("^ +";"")`) 및 재배포 | jq 1.6 (Ubuntu 22.04 기본) 호환성 문제 해결 |
| 8 | 2026-02-15 17:57 | `fetch-results.sh` 2차 실행 → **성공** | `results.log`: 260020 295건, 260019 211건 = 총 506건 업데이트 |
| 9 | 2026-02-15 ~18:00 | crontab 등록 | `0 */2 * * * sync.sh`, `30 */2 * * * fetch-results.sh` |
| 10 | 2026-02-15 17:24 | GitHub Actions 워크플로우 삭제 | 커밋 `220d98f`: VPS cron으로 완전 대체 |

**증거 소스:**
- `git log --since="2026-02-15"` → 커밋 `41c740c`, `220d98f`
- VPS `ls -la /opt/betman/` → 파일 생성 시각 확인
- VPS `crontab -l` → 크론 등록 확인
- VPS `sync.log`, `results.log` → 실행 로그

---

## 2. 왜 Vultr VPS가 필요한가

### 문제: betman.co.kr의 접근 제한

```
betman.co.kr
    │
    ├── GitHub Actions IP → ❌ 차단 (클라우드 IP 대역)
    ├── Vercel Edge      → ❌ 차단 (클라우드 IP 대역)
    ├── Supabase Edge    → ❌ 차단 (클라우드 IP 대역)
    │
    └── Vultr 한국 서울 VPS (158.247.x.x) → ✅ 접속 가능
```

betman.co.kr은 클라우드 서비스 IP 대역을 차단한다. GitHub Actions, Vercel, Supabase Edge Function에서는 betman.co.kr의 내부 API에 접근할 수 없다. 한국 서울 리전의 VPS만이 betman.co.kr에 정상 접근이 가능하다.

### 추가 제약: Vercel Deployment Protection

Vercel에 SSO 기반 Deployment Protection이 활성화되어 있어, VPS에서 Next.js API Route(`/api/betman/results`, `/api/betman/settle`)를 직접 호출할 수 없다 (401 Authentication Required). 이 때문에 VPS 스크립트는 **Supabase REST API + RPC 함수를 직접 호출**하는 방식으로 구현되었다.

---

## 3. 전체 서비스 워크플로우

### 3.1 시스템 구성도

```
┌──────────────────────────────────────────────────────────────────┐
│                        사용자 (브라우저)                          │
│    예측 제출 / 랭킹 조회 / 내 통계 확인                           │
└──────────────┬───────────────────────────┬───────────────────────┘
               │                           │
               ▼                           ▼
┌──────────────────────┐     ┌──────────────────────────────────┐
│   Vercel (Next.js)   │     │        Clerk (인증)               │
│                      │     │   user_id → JWT → API 인증       │
│  /api/betman/games   │     └──────────────────────────────────┘
│  /api/betman/prediction│
│  /api/betman/rankings│
│  /api/betman/my-stats│
│  /api/betman/settle  │◄── (내부 CRON_SECRET 호출 전용)
│  /api/betman/results │◄── (내부 CRON_SECRET 호출 전용)
│  /api/betman/round   │◄── (내부 CRON_SECRET 호출 전용)
│  /api/betman/sync-state│◄─ (내부 CRON_SECRET 호출 전용)
└──────────┬───────────┘
           │ Supabase JS Client
           ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Supabase (PostgreSQL)                        │
│                                                                  │
│  betman_rounds          betman_games          betman_predictions │
│  betman_user_sport_stats   betman_sync_state                     │
│                                                                  │
│  RPC: settle_round()   recalc_user_sport_stats()   calc_streaks()│
│  RPC: betman_update_sync_state()                                 │
└──────────────────────────────────────────────────────────────────┘
           ▲                           ▲
           │ PostgREST (REST API)      │ RPC 호출
           │                           │
┌──────────┴───────────────────────────┴──────────┐
│              Vultr VPS (서울)                     │
│              158.247.193.9                        │
│              Ubuntu 22.04.5 LTS                   │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │ cron: 0 */2 * * *                           │ │
│  │ /opt/betman/sync.sh (188줄)                  │ │
│  │                                              │ │
│  │ 1. betman.co.kr에서 최신 gmTs 감지           │ │
│  │ 2. gameInfoInq.do 호출 → 게임 데이터 수집    │ │
│  │ 3. jq로 파싱 → Supabase REST PATCH/POST     │ │
│  │ 4. betman_update_sync_state RPC 호출         │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │ cron: 30 */2 * * *                          │ │
│  │ /opt/betman/fetch-results.sh (172줄)         │ │
│  │                                              │ │
│  │ 1. betman_rounds에서 활성 회차 조회          │ │
│  │ 2. inqWinrstDetlBody.do 호출 → 결과 수집    │ │
│  │ 3. jq로 파싱 → Supabase REST PATCH          │ │
│  │ 4. settle_round() RPC 호출 → 자동 정산      │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  betman.co.kr ◄── curl + 쿠키 기반 HTTP 요청     │
└───────────────────────────────────────────────────┘
```

### 3.2 데이터 흐름: Sync (게임 수집)

```
betman.co.kr                    VPS sync.sh                 Supabase
─────────────                   ───────────                 ────────
buyableGameList.do ──GET──►     최신 gmTs 추출
                                    │
                                    ▼
                                DB gmTs 비교
                                    │
                            ┌───────┴───────┐
                            │ 새 회차 발견   │ 동일 gmTs
                            ▼               ▼
                    POST betman_rounds   기존 round_id 사용
                            │
                            ▼
gameInfoInq.do ────POST──►  게임 데이터 수신
                            (array-of-arrays 형식)
                                    │
                                    ▼
                            jq 파싱 (411건)
                                    │
                                    ▼
                            PATCH betman_games ──────────► DB 저장
                            (round_id + game_no 기준)
                                    │
                                    ▼
                            RPC betman_update_sync_state ► sync_state 갱신
```

### 3.3 데이터 흐름: Results + Settlement (결과 수집 + 정산)

```
betman.co.kr                VPS fetch-results.sh            Supabase
─────────────               ────────────────────            ────────
                            활성 회차 목록 조회 ◄──────── betman_rounds
                                    │                    (status IN open,closed)
                                    ▼
inqWinrstDetlBody.do ──POST──►  결과 JSON 수신
                                (detlBody 배열)
                                    │
                                    ▼
                            jq 파싱:
                            ├── GAME_RESULT 매핑
                            │   0 → home/under
                            │   1 → draw
                            │   2 → away/over
                            │   4 → cancelled
                            ├── HANDI_VAL 매핑
                            │   0,14 → 일반
                            │   2 → 핸디캡
                            │   9 → 언더오버
                            │   5 → SUM (건너뜀)
                            └── MCH_SCORE 파싱
                                    │
                                    ▼
                            일반 게임 점수 맵 구축
                            (핸디캡/언오버에 실제 점수 매핑)
                                    │
                                    ▼
                            PATCH betman_games ──────────► result, status,
                            (game_no 기준)                 home_score, away_score
                                    │
                                    ▼
                            RPC settle_round() ──────────► 정산 실행:
                                                           ├── prediction vs result 비교
                                                           ├── is_correct, points_earned
                                                           ├── betman_predictions 업데이트
                                                           ├── round status 갱신
                                                           └── recalc_user_sport_stats()
                                                               ├── 종목별 통계
                                                               ├── 전체 통계
                                                               └── 연승/연패 계산
```

---

## 4. 예측 → 정산 → 랭킹 흐름

### 4.1 사용자 예측 제출

```
사용자 브라우저
    │
    ▼
POST /api/betman/prediction
    │
    ├── Clerk 인증 (currentUser)
    ├── 검증:
    │   ├── 예측 형식 (home/draw/away/over/under)
    │   ├── 같은 회차 검증
    │   ├── 단일 종목 제한
    │   ├── 중복 경기 제한
    │   ├── 경기 시작 전 검증
    │   ├── game_type ↔ prediction 매칭
    │   └── 볼 잔액 확인 (1예측 = 1볼)
    │
    ├── user_tokens 차감
    ├── token_transactions 기록
    └── betman_predictions INSERT
```

### 4.2 자동 정산 (RPC: settle_round)

```sql
-- settle_round(p_gm_ts text) → jsonb
-- 실행 시점: fetch-results.sh 완료 후 자동 호출

1. gm_ts → round_id 조회
2. 해당 round의 completed/cancelled 경기 조회
3. pending 예측 조회 (betman_predictions)
4. 각 예측 정산:
   ├── 경기 cancelled → 예측도 cancelled (is_correct=NULL, points=0)
   └── 경기 completed → prediction == game.result?
       ├── 적중 → is_correct=true, points_earned=해당 배당률
       └── 미적중 → is_correct=false, points_earned=0
5. round status 갱신:
   ├── 모든 경기 완료 → 'settled'
   └── 미완료 경기 존재 → 'closed'
6. 영향받은 유저별 recalc_user_sport_stats() 호출
```

### 4.3 통계 재계산 (RPC: recalc_user_sport_stats)

```
recalc_user_sport_stats(p_user_id)
    │
    ├── settled/cancelled 예측 전체 조회
    ├── 종목별 그룹핑 (축구, 농구, 야구, 배구, 하키)
    ├── 각 종목별:
    │   ├── total_predictions, correct, wrong, cancelled
    │   ├── accuracy = correct / (correct + wrong) * 100
    │   ├── total_returns = SUM(points_earned)
    │   ├── net_profit = total_returns - total_wagered
    │   ├── profit_rate = net_profit / total_wagered * 100
    │   └── calc_streaks() → current_streak, best_win, worst_lose
    │
    ├── '전체' 집계
    └── UPSERT betman_user_sport_stats (ON CONFLICT user_id, sport)
```

### 4.4 랭킹 조회

```
GET /api/betman/rankings?sport=전체&sort=profit_rate
    │
    ├── betman_user_sport_stats에서 조회
    │   ├── sport 필터
    │   ├── min_predictions 필터
    │   ├── total_wagered > 0 필터
    │   └── sort: profit_rate DESC / accuracy DESC / net_profit DESC
    │
    ├── profiles 조인 (nickname, avatar_url)
    │
    └── 내 순위 동적 계산:
        └── 나보다 높은 사람 수 + 1
```

---

## 5. DB 스키마 요약

### 5.1 Betman 테이블

| 테이블 | 행수 | 설명 |
|--------|------|------|
| `betman_rounds` | 4 | 회차 정보 (gm_ts, year, round, status, deadline) |
| `betman_games` | 847 | 개별 경기 (종목, 팀, 배당률, 결과, 스코어) |
| `betman_predictions` | 1 | 사용자 예측 (prediction, is_correct, points_earned) |
| `betman_user_sport_stats` | 2 | 종목별 사용자 통계 (랭킹 기반) |
| `betman_sync_state` | 1 | 동기화 상태 (latest_gm_ts, active_rounds) |

### 5.2 회차 현황 (실시간 스냅샷)

| gm_ts | status | 전체 | 완료 | 취소 | 예정 |
|-------|--------|------|------|------|------|
| 260020 | closed | 411 | 289 | 0 | 122 |
| 260019 | closed | 177 | 176 | 0 | 1 |
| 260018 | settled | 194 | 194 | 0 | 0 |
| null | open | 65 | 0 | 0 | 65 |

### 5.3 주요 인덱스

```
betman_rounds:
  UNIQUE (gm_ts) WHERE gm_ts IS NOT NULL
  UNIQUE (year, round)
  INDEX  (status)

betman_games:
  UNIQUE (round_id, game_no)
  INDEX  (status), (sport), (game_type), (league_code), (match_time)

betman_predictions:
  UNIQUE (user_id, game_id)
  INDEX  (round_id), (status), (user_id), (user_id, round_id)

betman_user_sport_stats:
  UNIQUE (user_id, sport)
  INDEX  (sport, profit_rate DESC)
  INDEX  (sport, accuracy DESC)
  INDEX  (sport, net_profit DESC)
```

### 5.4 Supabase RPC 함수

| 함수명 | 용도 |
|--------|------|
| `settle_round(p_gm_ts)` | 회차 정산: 예측 비교, points_earned 계산, round 상태 갱신 |
| `recalc_user_sport_stats(p_user_id)` | 유저 종목별+전체 통계 재계산 |
| `calc_streaks(p_user_id, p_sport)` | 연승/연패 계산 (gap-and-island 패턴) |
| `betman_update_sync_state(...)` | sync_state 테이블 갱신 |
| `settle_betman_game(...)` | 단일 경기 정산 (레거시) |

### 5.5 RLS 정책

모든 betman 테이블에 RLS 활성화. VPS는 `service_role` 키로 RLS를 바이패스하여 데이터를 쓴다.
프론트엔드 API는 `createAnonClient()` (랭킹 등 공개 조회) 또는 `createServiceRoleClient()` (내부 쓰기 작업)를 사용한다.

---

## 6. VPS 인프라 상세

### 6.1 서버 사양

| 항목 | 값 |
|------|-----|
| 호스팅 | Vultr (서울 리전) |
| IP | 158.247.193.9 |
| OS | Ubuntu 22.04.5 LTS (커널 5.15.0-170-generic) |
| CPU | 1 vCPU (x86_64) |
| RAM | 951MB (사용 213MB, 가용 588MB) |
| 디스크 | 23GB (사용 6.5GB, 가용 16GB, 30%) |
| SSH | root@158.247.193.9, 키: `~/.ssh/vultr_betman` |

### 6.2 디렉토리 구조

```
/opt/betman/
├── .env              (300B)  Supabase 인증 정보
├── sync.sh           (188줄) 게임 데이터 동기화 스크립트
├── fetch-results.sh  (172줄) 결과 수집 + 정산 스크립트
├── sync.log                  sync.sh 실행 로그
├── results.log               fetch-results.sh 실행 로그
└── cron.log                  crontab stdout/stderr 로그
```

### 6.3 환경 변수 (.env)

```
SUPABASE_URL=***MASKED***
SUPABASE_SERVICE_ROLE_KEY=***MASKED***
```

> `APP_URL`, `CRON_SECRET`는 불필요 — VPS는 Next.js API를 거치지 않고 Supabase REST를 직접 호출

### 6.4 Cron 스케줄

```
# 게임 데이터 동기화 (매 짝수 시 정각)
0 */2 * * * /bin/bash /opt/betman/sync.sh >> /opt/betman/cron.log 2>&1

# 결과 수집 + 정산 (매 짝수 시 30분)
30 */2 * * * /bin/bash /opt/betman/fetch-results.sh >> /opt/betman/cron.log 2>&1
```

**실행 주기**: 하루 12회 동기화, 12회 결과 수집 = 총 24회/일

### 6.5 의존성

```
jq 1.6 (apt 기본)  — JSON 파싱 (⚠️ \s regex 미지원)
curl 7.81.0         — HTTP 요청
bash 5.1.16         — 스크립트 실행
```

---

## 7. betman.co.kr 내부 API 명세

> 아래 API는 betman.co.kr의 내부 XHR 엔드포인트로, 공식 문서화되지 않음.
> 쿠키 기반 세션이 필요하며, 일반 웹 브라우저 헤더를 모방해야 정상 응답.

### 7.1 게임 목록 조회

```
POST /gamebuy/gameSlip/gameInfoInq.do
Content-Type: application/json;charset=UTF-8
X-Requested-With: XMLHttpRequest

Body: { "gmId": "G101", "gmTs": 260020 }

Response: {
  "compSchedules": {
    "datas": [
      [순번, 경기일시, 종목코드, 리그코드, ..., 홈팀, 원정팀, 배당률들...]
      // array-of-arrays 형식 — 위치 기반 파싱 필요
    ]
  }
}
```

### 7.2 결과 조회

```
POST /gamebuy/winrst/inqWinrstDetlBody.do
Content-Type: application/json;charset=UTF-8
X-Requested-With: XMLHttpRequest

Body: { "gmId": "G101", "gmTs": 260020 }

Response: {
  "detlBody": [
    {
      "GM_SEQ": 1,
      "GAME_RESULT": "0",     // 0=홈승/언더, 1=무, 2=원정승/오버, 4=취소
      "HANDI_VAL": 0,          // 0,14=일반, 2=핸디캡, 5=SUM, 9=언오버
      "MCH_SCORE": "104:101",
      "HOME_TEAM": "팀A",
      "AWAY_TEAM": "팀B",
      "FIX_MCH_DTM": "20260215",
      "ODDS_WIN": 1.85,
      "ODDS_DRAW": 3.40,
      "ODDS_LOSE": 2.10
    }
  ]
}
```

### 7.3 최신 회차 감지

```
POST /gamebuy/gameSlip/buyableGameList.do
Content-Type: application/json;charset=UTF-8

Body: { "gmId": "G101" }

Response: buyableGameList 배열 → 마지막 항목의 gmTs가 최신 회차
```

---

## 8. Next.js API Route 명세

### 8.1 내부 전용 (CRON_SECRET 인증)

| Endpoint | Method | 용도 | 호출자 |
|----------|--------|------|--------|
| `/api/betman/round` | POST | 회차 생성/조회 | VPS sync.sh (간접) |
| `/api/betman/games` | POST | 게임 데이터 upsert | VPS sync.sh (간접) |
| `/api/betman/results` | POST | 경기 결과 업데이트 | betman-fetch-results.ts |
| `/api/betman/settle` | POST | 정산 실행 | betman-fetch-results.ts |
| `/api/betman/sync-state` | GET/POST | 동기화 상태 조회/갱신 | betman-sync.ts |

> **참고**: VPS 스크립트는 Vercel Deployment Protection 때문에 위 API를 직접 호출하지 않는다.
> 대신 Supabase REST API + RPC를 직접 사용한다.
> 위 API들은 로컬 개발 또는 향후 Vercel cron 전환 시 활용 가능.

### 8.2 사용자 대면 (Clerk 인증 / 공개)

| Endpoint | Method | 용도 | 인증 |
|----------|--------|------|------|
| `/api/betman/games` | GET | 오늘 예측 가능 경기 목록 | 공개 (Clerk 선택) |
| `/api/betman/prediction` | POST | 예측 제출 | Clerk 필수 |
| `/api/betman/prediction` | GET | 내 예측 조회 | Clerk 필수 |
| `/api/betman/rankings` | GET | 종목별 랭킹 | 공개 |
| `/api/betman/my-stats` | GET | 내 통계 | Clerk 필수 |

---

## 9. 코드베이스 관련 파일 목록

### 9.1 API Routes

```
app/api/betman/
├── games/route.ts       GET(경기목록) + POST(게임upsert)
├── prediction/route.ts  GET(내예측) + POST(예측제출)
├── rankings/route.ts    GET(랭킹)
├── my-stats/route.ts    GET(내통계)
├── results/route.ts     POST(결과업데이트)
├── round/route.ts       POST(회차생성)
├── settle/route.ts      POST(정산)
└── sync-state/route.ts  GET/POST(동기화상태)
```

### 9.2 라이브러리

```
lib/betman/
└── stats.ts             calculateStreaks() + updateUserSportStats()
```

### 9.3 스크립트 (로컬/CI용, 현재 미사용)

```
scripts/
├── betman-sync.ts           Playwright 기반 동기화 (VPS sync.sh로 대체)
├── betman-fetch-results.ts  Playwright 기반 결과 수집 (VPS fetch-results.sh로 대체)
└── betman-fetch-games.ts    게임 데이터 수집 (레거시)
```

### 9.4 Supabase 마이그레이션 (betman 관련)

| 버전 | 이름 | 내용 |
|------|------|------|
| 20260123193852 | create_betman_rounds_table | rounds 테이블 |
| 20260123193934 | create_betman_games_table | games 테이블 + 인덱스 |
| 20260123193951 | create_team_and_league_aliases | 팀/리그 별칭 |
| 20260123194014 | create_betman_predictions_table | predictions 테이블 |
| 20260123194626 | create_betman_import_functions | 임포트 RPC |
| 20260123214745 | add_odds_columns_to_betman_games | 배당률 컬럼 |
| 20260210234749 | add_round_id_to_betman_predictions | round_id FK |
| 20260211005701 | improve_betman_games_handicap_columns | handicap, over_under_line |
| 20260212233437 | change_points_earned_to_numeric | points numeric 변환 |
| 20260213180653 | create_betman_user_sport_stats | 종목별 통계 테이블 |
| 20260215002110 | create_betman_sync_state | 동기화 상태 테이블 |
| 20260215010106 | add_betman_update_sync_state_rpc | sync_state RPC |
| 20260215084656 | add_settlement_rpc_functions | settle_round, calc_streaks, recalc 함수 |

---

## 10. 품질 검사: 이슈 목록

### 10.1 이슈 테이블

| ID | 심각도 | 카테고리 | 이슈 | 영향 | 근거 |
|----|--------|---------|------|------|------|
| I-01 | **P0** | 데이터 정합성 | gm_ts=null인 회차(round=11) 존재: open 상태이지만 VPS에서 betman 결과 조회 불가 | fetch-results.sh가 null 회차를 매번 처리 시도 후 스킵 | DB 조회: `betman_rounds WHERE gm_ts IS NULL` → 1건 |
| I-02 | **P1** | 데이터 누락 | 260020 회차: betman 426건 vs DB 411건 = **15건 차이**. 결과 업데이트 시 8건 에러 | 일부 경기 결과가 DB에 반영되지 않음 | `results.log`: "에러: 8건" |
| I-03 | **P1** | 정산 미완료 | 260019 회차: 177건 중 176건 완료, **1건 scheduled 잔존** → settled 전환 불가 | 회차가 영구적으로 'closed' 상태에 머무름 | DB: `scheduled_count=1` |
| I-04 | **P1** | 운영 리스크 | cron.log에 로그 로테이션 없음 → 장기 운영 시 디스크 사용량 증가 | 디스크 풀 가능성 | `crontab -l`: `>> cron.log` (append only) |
| I-05 | **P2** | 보안 | `.env`에 `service_role` 키 평문 저장 (root 권한 읽기 전용이긴 함) | 서버 침해 시 DB 전체 접근 가능 | `ls -la .env`: `-rw-------` (600) |
| I-06 | **P2** | 중복 코드 | 정산 로직이 두 곳에 존재: `settle/route.ts` (Next.js) + `settle_round()` (PL/pgSQL RPC) | 로직 분기 시 불일치 가능 | 코드 비교 확인 |
| I-07 | **P2** | 모니터링 | VPS에 헬스체크/알림 시스템 없음. cron 실패 시 감지 불가 | 자동 복구 없이 수동 확인 필요 | VPS 설정 확인 |
| I-08 | **P2** | 데이터 정합성 | score 교차참조: 핸디캡/언오버 게임의 점수가 일반 게임에서 매핑되는데, 일반 게임이 없는 경우 null | 일부 게임의 home_score, away_score가 null | fetch-results.sh 로직 분석 |
| I-09 | **P3** | 코드 정리 | `scripts/betman-sync.ts`, `betman-fetch-results.ts`, `betman-fetch-games.ts`가 VPS 전환 후 미사용 상태 | 코드 혼란 가능 | 파일 존재 확인 |
| I-10 | **P3** | 확장성 | VPS 1대 단일 장애점(SPOF). 서버 다운 시 전체 데이터 수집 중단 | 수집 지연 (최대 2시간 데이터 손실) | 아키텍처 분석 |
| I-11 | **P3** | 비용 | Vultr VPS 월 비용 발생 (현재 최소 사양) | 운영 비용 | VPS 프로비저닝 확인 |

### 10.2 중복/불일치 분석

| 항목 | 위치 A | 위치 B | 상태 |
|------|--------|--------|------|
| 정산 로직 | `app/api/betman/settle/route.ts` | PL/pgSQL `settle_round()` | **중복** — 현재 VPS는 RPC만 사용 |
| 통계 계산 | `lib/betman/stats.ts` | PL/pgSQL `recalc_user_sport_stats()` | **중복** — 동일 로직의 두 구현 |
| 연승 계산 | `lib/betman/stats.ts:calculateStreaks()` | PL/pgSQL `calc_streaks()` | **중복** |
| 게임 저장 | `app/api/betman/games/route.ts` POST | VPS sync.sh (Supabase REST 직접) | **병렬 경로** — 현재 VPS만 사용 |
| 동기화 상태 | `app/api/betman/sync-state/route.ts` | VPS (Supabase REST + RPC 직접) | **병렬 경로** |

---

## 11. Task Backlog

### P0 — 즉시 해결

- [ ] **I-01: gm_ts=null 회차 처리**
  - 해당 회차(round=11)의 gm_ts를 betman에서 확인하여 설정하거나, 레거시 데이터면 status를 'settled'로 닫기
  - DoD: `SELECT * FROM betman_rounds WHERE gm_ts IS NULL` → 0건

### P1 — 1주 내 해결

- [ ] **I-02: betman vs DB 게임 수 불일치 조사**
  - betman이 426건 반환하는데 DB에 411건만 있는 원인 파악 (SUM 게임 필터링? 파싱 누락?)
  - fetch-results.sh의 에러 8건 원인 파악 및 해결
  - DoD: 에러 0건으로 결과 업데이트 성공

- [ ] **I-03: 260019 회차 잔존 scheduled 경기 해결**
  - 해당 1건의 경기 상태 확인 (취소? 연기?)
  - 수동 또는 자동으로 상태 업데이트 후 회차 settled 전환
  - DoD: `betman_rounds WHERE gm_ts='260019' AND status='settled'`

- [ ] **I-04: 로그 로테이션 설정**
  - `logrotate` 설정 또는 cron에서 날짜별 로그 파일 분리
  - DoD: 7일 이상 로그 자동 삭제/압축 확인

### P2 — 2주 내 해결

- [ ] **I-06: 정산 로직 일원화**
  - Next.js API (`settle/route.ts`)와 PL/pgSQL RPC (`settle_round`) 중 하나로 통일
  - 권장: PL/pgSQL RPC를 정본으로 유지, Next.js API는 RPC를 호출하도록 래핑
  - DoD: 정산 코드가 단일 소스에서만 관리됨

- [ ] **I-07: VPS 모니터링 설정**
  - 최소: cron 실행 결과를 외부로 알림 (예: Slack webhook, UptimeRobot)
  - 권장: sync.sh/fetch-results.sh 실패 시 알림 전송
  - DoD: 의도적으로 스크립트 실패시켜 알림 수신 확인

- [ ] **I-08: 핸디캡/언오버 게임 점수 null 처리**
  - 일반 게임이 없는 경우에도 betman 결과에서 점수를 추출하는 로직 추가
  - DoD: `betman_games WHERE status='completed' AND home_score IS NULL AND game_type != 'SUM'` → 0건

### P3 — 백로그

- [ ] **I-09: 미사용 스크립트 정리**
  - `scripts/betman-sync.ts`, `betman-fetch-results.ts`, `betman-fetch-games.ts` 삭제 또는 `scripts/legacy/`로 이동
  - DoD: `scripts/` 디렉토리에 활성 스크립트만 존재

- [ ] **I-10: VPS 이중화 검토**
  - 현재: 단일 VPS → 장애 시 최대 2시간 데이터 손실
  - 선택지: (A) 2번째 VPS 대기, (B) Supabase Edge Function에서 프록시 시도, (C) 현재 단일 VPS 유지
  - DoD: 리스크 수용 여부 결정 문서화

- [ ] **I-11: 운영 비용 최적화**
  - VPS 사양이 과대한지 검토 (현재 RAM 213MB/951MB 사용)
  - 더 저렴한 플랜 또는 스팟 인스턴스 검토
  - DoD: 비용 비교 표 작성

---

## 부록 A: 커밋 히스토리 (Betman 관련)

```
220d98f 2026-02-15 Remove betman GitHub Actions workflows (replaced by VPS cron)
41c740c 2026-02-15 Stabilize betman pipeline: DB-based state, API auth, field name fix
6351257 2026-02-14 Add GitHub Actions for results collection and gmTs auto-detection
bfca4a5 2026-02-14 Add stats recalculate API and auto-settlement trigger
55d6c85 2026-02-14 Add ranking system, follow API, and mypage stats
0528463 2026-02-14 Add betman prediction settlement API
3b0f970 2026-02-13 Add betman game results fetching and storage
6053494 2026-02-13 Add ball token deduction system for predictions
0799ad6 2026-02-12 Add betman fetch workflow and fix handicap/over-under display
5178d7c 2026-02-11 Add Betman odds collection system with Playwright
```

## 부록 B: GAME_RESULT / HANDI_VAL 매핑 테이블

### GAME_RESULT → result

| GAME_RESULT | 일반/핸디캡 | 언더오버 |
|-------------|-----------|---------|
| "0" | home | under |
| "1" | draw | — |
| "2" | away | over |
| "4" | cancelled | cancelled |

### HANDI_VAL → game_type

| HANDI_VAL | game_type | 예측 가능 값 |
|-----------|-----------|-------------|
| 0, 14 | 일반 | home, draw, away |
| 2 | 핸디캡 | home, away |
| 5 | SUM | (예측 불가 — 홀짝) |
| 9 | 언더오버 | over, under |

# Betman 승부예측 시스템 기술문서

> betman.co.kr에서 프로토 승부식 배당률을 수집하고, 승부 예측 게임을 운영하며, 결과 정산 및 랭킹을 관리하는 시스템

## 목차

1. [시스템 개요](#시스템-개요)
2. [아키텍처](#아키텍처)
3. [스크립트 사용법](#스크립트-사용법)
4. [API 레퍼런스](#api-레퍼런스)
5. [GitHub Actions](#github-actions)
6. [n8n 워크플로우 설정](#n8n-워크플로우-설정)
7. [데이터베이스 스키마](#데이터베이스-스키마)
8. [JSON 파일 구조](#json-파일-구조)
9. [수익 계산 공식](#수익-계산-공식)
10. [트러블슈팅](#트러블슈팅)

---

## 시스템 개요

### 목적

- betman.co.kr에서 프로토 승부식 경기 배당률 실시간 수집
- 회차(gmTs)별 경기 데이터 관리
- 사용자 승부 예측 게임 운영
- 경기 결과 수집 및 예측 자동 정산
- 종목별 통계 및 랭킹 시스템

### 핵심 기능

| 기능 | 설명 |
|------|------|
| 새 회차 감지 | GitHub Actions / n8n으로 새로운 gmTs 자동 확인 |
| 배당률 갱신 | 활성 라운드 배당률 주기적 업데이트 |
| 결과 수집 | `winrstDetl.do`에서 경기 결과 크롤링 |
| 자동 정산 | 결과 수집 후 예측 적중 판정 및 배당률 기반 수익 계산 |
| 통계/랭킹 | 종목별(축구/농구/배구/야구) 적중률, 수익률, 연승 관리 |
| JSON 저장 | 회차별 `data/{gmTs}.json` 파일 생성 |
| DB 저장 | Supabase에 라운드/경기/예측/통계 데이터 저장 |

### 기술 스택

- **스크래핑**: Playwright (headless Chrome)
- **런타임**: Node.js + TypeScript (tsx)
- **스케줄링**: GitHub Actions (주) / n8n (보조)
- **데이터베이스**: Supabase (PostgreSQL)
- **API**: Next.js API Routes
- **인증**: Clerk

---

## 아키텍처

```
┌─────────────────────────────────────────────────────────────────────┐
│                      GitHub Actions 워크플로우                        │
├─────────────────────────────────────────────────────────────────────┤
│  betman-sync.yml (6시간마다)    betman-results.yml (3회/일)          │
│       ↓                              ↓                              │
│  경기 수집 + 배당률 갱신          결과 수집 → 정산 → 통계 갱신         │
│       ↓                              ↓                              │
│  betman-sync.ts                 betman-fetch-results.ts              │
└───────────────────────────────┬─────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                        Playwright 스크립트                           │
├─────────────────────────────────────────────────────────────────────┤
│  [수집] gameSlip.do → gameInfoInq.do → data/{gmTs}.json + DB       │
│  [결과] winrstDetl.do → inqWinrstDetlBody.do → DB + 자동 정산       │
└───────────────────────────────┬─────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                          Next.js API                                 │
├─────────────────────────────────────────────────────────────────────┤
│  POST /api/betman/round         → 라운드 생성/조회                   │
│  POST /api/betman/games         → 경기 목록 저장 (upsert)            │
│  GET  /api/betman/games         → 오늘 경기 조회                     │
│  POST /api/betman/prediction    → 예측 제출                          │
│  GET  /api/betman/prediction    → 내 예측 조회                       │
│  POST /api/betman/results       → 경기 결과 저장                     │
│  POST /api/betman/settle        → 예측 정산 + 통계 갱신              │
│  GET  /api/betman/rankings      → 종목별 랭킹 조회                   │
│  GET  /api/betman/my-stats      → 내 통계 조회                       │
│  POST /api/betman/stats/recalculate → 전체 통계 재계산 (관리자)       │
└───────────────────────────────┬─────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                          Supabase DB                                 │
├─────────────────────────────────────────────────────────────────────┤
│  betman_rounds           : 회차 정보 (gmTs, status)                  │
│  betman_games            : 경기 정보 (배당률, 점수, 결과)              │
│  betman_predictions      : 사용자 예측 (적중 여부, 수익금)             │
│  betman_user_sport_stats : 유저별 종목 통계 (적중률, 수익률, 연승)     │
│  user_tokens             : 볼(토큰) 잔액                             │
│  token_transactions      : 토큰 거래 내역                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 스크립트 사용법

### 1. 통합 동기화 스크립트 (권장)

**파일**: `scripts/betman-sync.ts`

모든 기능을 하나로 통합한 메인 스크립트입니다.

```bash
# 최신 gmTs 확인만 (데이터 수집 안함)
pnpm exec tsx scripts/betman-sync.ts --check-only

# 특정 회차 데이터 수집 + JSON 저장 + API 저장
pnpm exec tsx scripts/betman-sync.ts --gmts=260018

# JSON만 저장 (API 호출 스킵)
pnpm exec tsx scripts/betman-sync.ts --gmts=260018 --skip-api
```

**출력 (JSON)**:
```json
{
  "action": "created",
  "gmTs": "260018",
  "isNew": true,
  "gamesCount": 194,
  "jsonPath": "data/260018.json",
  "activeRounds": ["260017", "260018"]
}
```

### 2. 결과 수집 + 자동 정산 스크립트

**파일**: `scripts/betman-fetch-results.ts`

`winrstDetl.do` 페이지에서 경기 결과를 수집하고, 자동으로 정산까지 실행합니다.

```bash
# 특정 회차 결과 수집 + 정산
pnpm exec tsx scripts/betman-fetch-results.ts 260018

# 환경변수 방식
BETMAN_GM_TS=260018 pnpm exec tsx scripts/betman-fetch-results.ts
```

**처리 흐름**:
1. `winrstDetl.do` 페이지를 Playwright로 접속
2. `inqWinrstDetlBody.do` API 호출로 결과 데이터 수신
3. 게임 타입별 결과 판정 (일반/핸디캡/언더오버/SUM)
4. `POST /api/betman/results`로 결과 DB 저장
5. `POST /api/betman/settle`로 자동 정산 트리거

### 3. JSON 저장 전용 스크립트

**파일**: `scripts/betman-save-json.ts`

```bash
pnpm exec tsx scripts/betman-save-json.ts 260018
```

### 4. API 저장 전용 스크립트

**파일**: `scripts/betman-fetch-games.ts`

```bash
pnpm exec tsx scripts/betman-fetch-games.ts 260018
```

### 5. 환경변수

| 변수명 | 설명 | 기본값 |
|--------|------|--------|
| `BETMAN_GM_TS` | 회차 번호 | 260018 |
| `NEXT_PUBLIC_APP_URL` | API 서버 주소 | http://localhost:3000 |
| `VERCEL_URL` | Vercel 배포 URL | - |

---

## API 레퍼런스

### POST /api/betman/round

새 회차 생성 또는 기존 회차 조회

**Request**:
```json
{
  "gmTs": "260018",
  "year": 2026,
  "round": 18
}
```

**Response**:
```json
{
  "created": true,
  "roundId": "uuid",
  "year": 2026,
  "round": 260018,
  "gmTs": "260018"
}
```

### POST /api/betman/games

경기 목록 저장 (upsert)

**Request**:
```json
{
  "roundId": "uuid",
  "games": [
    {
      "game_no": 1,
      "match_time": "2026-02-11T09:30:00+09:00",
      "sport": "축구",
      "game_type": "일반",
      "home_team_name": "토트넘",
      "away_team_name": "맨시티",
      "league_code": "EPL",
      "home_win_odds": 2.5,
      "draw_odds": 3.2,
      "away_win_odds": 2.8
    }
  ]
}
```

**Response**:
```json
{
  "roundId": "uuid",
  "count": 194,
  "message": "194개 경기가 저장되었습니다."
}
```

### GET /api/betman/games

오늘 경기 목록 조회 (KST 기준)

**Query Parameters**:
- `sport`: 종목 필터 (축구, 농구, 배구, 야구, all)
- `game_type`: 게임 유형 (일반, 핸디캡, 언더오버, SUM, all)

**Response**:
```json
{
  "today": {
    "date": "2026-02-11T00:00:00.000Z",
    "label": "2월 11일 화요일"
  },
  "games": [],
  "groupedGames": [],
  "userPredictions": [],
  "total": 194
}
```

### POST /api/betman/prediction

예측 제출

**Request**:
```json
{
  "predictions": [
    { "game_id": "uuid", "prediction": "home" },
    { "game_id": "uuid", "prediction": "away" }
  ]
}
```

**유효한 prediction 값**:
- 일반/핸디캡: `home`, `draw`, `away`
- 언더오버: `over`, `under`

### GET /api/betman/prediction

내 예측 조회

**Query Parameters**:
- `round_id`: 회차 ID (optional, 기본: 현재 진행중 회차)

### POST /api/betman/results

경기 결과 저장 (크롤링 스크립트에서 호출)

**Request**:
```json
{
  "gmTs": "260018",
  "results": [
    {
      "game_no": 1,
      "home_score": 2,
      "away_score": 1,
      "result": "home",
      "status": "completed"
    }
  ]
}
```

**result 값**: `home` / `draw` / `away` / `over` / `under` / `cancelled` / `""` (SUM)
**status 값**: `completed` / `cancelled`

**Response**:
```json
{
  "roundId": "uuid",
  "gmTs": "260018",
  "updated": 145,
  "cancelled": 4,
  "total": 149,
  "message": "145건 업데이트, 4건 취소 처리 완료"
}
```

### POST /api/betman/settle

예측 정산 + 유저 통계 자동 갱신

**Request**:
```json
{
  "round_id": "uuid"
}
```
또는
```json
{
  "gm_ts": "260018"
}
```

**처리 흐름**:
1. 해당 라운드의 `completed`/`cancelled` 경기 조회
2. `pending` 예측에 대해 적중 판정
3. 적중 시 `points_earned` = 해당 배당률, 미적중 시 `0`
4. 취소 경기 예측 → `status='cancelled'`
5. 라운드 상태 업데이트 (`closed` 또는 `settled`)
6. 영향 받은 유저의 종목별 통계 자동 갱신

**Response**:
```json
{
  "roundId": "uuid",
  "roundStatus": "settled",
  "settled": 45,
  "correct": 18,
  "wrong": 27,
  "cancelled": 3,
  "totalPredictions": 48,
  "statsUpdated": 5
}
```

### GET /api/betman/rankings

종목별 랭킹 조회

**Query Parameters**:
- `sport`: `전체` / `축구` / `농구` / `배구` / `야구` (기본: `전체`)
- `sort`: `profit_rate` / `accuracy` / `net_profit` (기본: `profit_rate`)
- `limit`: 결과 수 (기본: 50, 최대: 100)
- `offset`: 페이지네이션 (기본: 0)
- `min_predictions`: 최소 예측 수 필터 (기본: 1)

**Response**:
```json
{
  "rankings": [
    {
      "rank": 1,
      "user_id": "...",
      "nickname": "프로토왕",
      "avatar_url": "...",
      "sport": "전체",
      "total_predictions": 45,
      "correct_predictions": 28,
      "accuracy": 62.22,
      "total_wagered": 45,
      "total_returns": 68.50,
      "net_profit": 23.50,
      "profit_rate": 52.22,
      "current_streak": 3,
      "best_win_streak": 7
    }
  ],
  "total": 120,
  "my_rank": { "rank": 15, "..." : "..." }
}
```

### GET /api/betman/my-stats

현재 로그인 유저의 종목별 통계 전체 반환 (인증 필요)

**Response**:
```json
{
  "summary": {
    "total_predictions": 100,
    "correct_predictions": 55,
    "wrong_predictions": 42,
    "cancelled_predictions": 3,
    "accuracy": 56.7,
    "total_wagered": 97,
    "total_returns": 120.5,
    "net_profit": 23.5,
    "profit_rate": 24.23,
    "current_streak": -2,
    "best_win_streak": 7,
    "worst_lose_streak": 5
  },
  "sports": [
    { "sport": "농구", "total_predictions": 30, "..." : "..." },
    { "sport": "축구", "total_predictions": 70, "..." : "..." }
  ]
}
```

### POST /api/betman/stats/recalculate

전체 유저 통계 재계산 (관리자용). 모든 settled 예측을 기반으로 `betman_user_sport_stats` 재집계.

---

## GitHub Actions

### betman-sync.yml (경기 수집)

**파일**: `.github/workflows/betman-sync.yml`

| 항목 | 설정 |
|------|------|
| **스케줄** | 매 6시간 (00:00, 06:00, 12:00 UTC) |
| **수동 트리거** | `workflow_dispatch` (gmTs 입력) |
| **처리** | 최신 gmTs 자동 감지 → Playwright로 경기 데이터 수집 → DB 저장 |

### betman-results.yml (결과 수집 & 정산)

**파일**: `.github/workflows/betman-results.yml`

| 항목 | 설정 |
|------|------|
| **스케줄** | 매일 KST 07:00, 13:00, 22:00 (cron: `0 22,4,13 * * *`) |
| **수동 트리거** | `workflow_dispatch` (gmTs 필수 입력) |
| **처리** | gmTs 자동 감지 → 결과 크롤링 → DB 저장 → 자동 정산 → 통계 갱신 |

---

## n8n 워크플로우 설정

### 워크플로우 1: 새 라운드 감지 (5분마다)

```
Schedule Trigger (5min)
  → Execute: betman-sync.ts --check-only
  → IF: isNew == true
  → Execute: betman-sync.ts --gmts={gmTs}
```

### 워크플로우 2: 배당률 갱신 (1시간마다)

```
Schedule Trigger (1h)
  → Read: data/betman-state.json
  → Loop: activeRounds[]
  → Execute: betman-sync.ts --gmts={각 라운드}
```

---

## 데이터베이스 스키마

### betman_rounds

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK |
| gm_ts | text | Betman 회차 키 (260018) |
| year | integer | 연도 |
| round | integer | 회차 번호 |
| status | text | open / closed / settled |
| deadline | text | 예측 마감 시간 |
| created_at | timestamptz | 생성 시간 |

### betman_games

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK |
| round_id | uuid | FK → betman_rounds |
| game_no | integer | 경기 번호 |
| match_time | timestamptz | 경기 시간 |
| sport | text | 종목 (축구/농구/배구/야구/하키) |
| game_type | text | 유형 (일반/핸디캡/언더오버/SUM) |
| home_team_name | text | 홈팀 |
| away_team_name | text | 원정팀 |
| league_code | text | 리그/대회명 |
| handicap | numeric | 핸디캡 스프레드 (홈팀 기준) |
| over_under_line | numeric | 언오버 기준선 |
| home_win_odds | numeric | 홈 승 배당률 |
| draw_odds | numeric | 무승부 배당률 |
| away_win_odds | numeric | 원정 승 배당률 |
| over_odds | numeric | 오버 배당률 |
| under_odds | numeric | 언더 배당률 |
| odd_odds | numeric | 홀 배당률 |
| even_odds | numeric | 짝 배당률 |
| home_score | integer | 홈팀 점수 (결과) |
| away_score | integer | 원정팀 점수 (결과) |
| result | text | home/draw/away/over/under/cancelled |
| status | text | scheduled/in_progress/completed/cancelled/postponed |

**Unique Constraint**: `(round_id, game_no)`

### betman_predictions

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK |
| user_id | text | Clerk 사용자 ID |
| round_id | uuid | FK → betman_rounds |
| game_id | uuid | FK → betman_games |
| prediction | text | home/draw/away/over/under |
| is_correct | boolean | 적중 여부 (정산 후) |
| points_earned | numeric | 적중 시 배당률, 미적중 시 0 |
| status | text | pending/settled/cancelled |
| settled_at | timestamptz | 정산 시각 |
| created_at | timestamptz | 예측 시간 |

### betman_user_sport_stats

유저별 종목 통계 (정산 시 자동 갱신)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK |
| user_id | text | Clerk 사용자 ID |
| sport | text | 축구/농구/배구/야구/하키/전체 |
| total_predictions | int | 총 예측 수 |
| correct_predictions | int | 적중 수 |
| wrong_predictions | int | 미적중 수 |
| cancelled_predictions | int | 취소 수 |
| accuracy | numeric | 적중률 (%) |
| total_wagered | int | 총 베팅 볼 수 |
| total_returns | numeric | 총 반환금 |
| net_profit | numeric | 순수익 |
| profit_rate | numeric | 수익률 (%) |
| current_streak | int | 현재 연승(+)/연패(-) |
| best_win_streak | int | 최고 연승 |
| worst_lose_streak | int | 최악 연패 |

**Unique Constraint**: `(user_id, sport)`

---

## JSON 파일 구조

### 상태 파일: `data/betman-state.json`

```json
{
  "lastChecked": "2026-02-11T04:07:18.108Z",
  "activeRounds": ["260017", "260018"],
  "latestGmTs": "260018"
}
```

### 경기 데이터: `data/{gmTs}.json`

```json
{
  "gmTs": "260018",
  "gmId": "G101",
  "updatedAt": "2026-02-11T04:07:18.108Z",
  "totalGames": 194,
  "games": [
    {
      "game_no": 187,
      "match_time": "2026-02-11T09:30:00+09:00",
      "sport": "농구",
      "league": "NBA",
      "game_type": "일반",
      "home_team": "뉴욕닉스",
      "away_team": "인디페이",
      "home_win_odds": 1.04,
      "draw_odds": null,
      "away_win_odds": 5.32,
      "home_score": 104,
      "away_score": 101,
      "result": "home",
      "status": "completed"
    }
  ]
}
```

### 게임 유형별 배당률 필드

| 게임 유형 | 사용 필드 |
|----------|----------|
| 일반 | home_win_odds, draw_odds, away_win_odds |
| 핸디캡 | home_win_odds, draw_odds, away_win_odds |
| 언더오버 | over_odds, under_odds |
| SUM | odd_odds, even_odds |

---

## 수익 계산 공식

```
예측 1건 기준:
  베팅: 1볼
  적중 시 반환: 배당률 (예: 2.50)
  적중 시 순이익: 배당률 - 1 (예: 1.50)
  미적중 시 반환: 0
  미적중 시 순이익: -1

유저 전체 기준:
  총 베팅(wagered) = 적중 건수 + 미적중 건수 (취소 제외)
  총 반환(returns) = SUM(적중 배당률)
  순이익(net_profit) = returns - wagered
  수익률(profit_rate) = (net_profit / wagered) * 100 %
  적중률(accuracy) = 적중 건수 / (적중 + 미적중) * 100 %
```

---

## 트러블슈팅

### 1. Playwright 브라우저 오류

```bash
pnpm exec playwright install chromium
```

### 2. 타임아웃 오류

betman.co.kr 응답이 느릴 경우 스크립트의 timeout 값을 증가시키세요.

### 3. API 500 오류

- 로컬 서버 실행 확인: `pnpm dev`
- 환경변수 확인: `NEXT_PUBLIC_APP_URL`
- Supabase 연결 확인

### 4. 정산 결과 없음

- 해당 회차의 경기가 `completed` 상태인지 확인
- `betman_predictions`에 `pending` 상태 예측이 있는지 확인
- 결과 수집 스크립트가 먼저 실행되었는지 확인

### 5. 통계 불일치

- `POST /api/betman/stats/recalculate`로 전체 재계산 가능
- 모든 settled 예측을 기반으로 재집계

---

## 빠른 명령어 참조

```bash
# 최신 회차 확인
pnpm exec tsx scripts/betman-sync.ts --check-only

# 특정 회차 전체 동기화 (JSON + DB)
pnpm exec tsx scripts/betman-sync.ts --gmts=260018

# JSON만 생성
pnpm exec tsx scripts/betman-sync.ts --gmts=260018 --skip-api

# 결과 수집 + 자동 정산
pnpm exec tsx scripts/betman-fetch-results.ts 260018

# JSON 저장 전용
pnpm exec tsx scripts/betman-save-json.ts 260018

# DB 저장 전용
pnpm exec tsx scripts/betman-fetch-games.ts 260018
```

---

## 관련 파일 목록

```
scripts/
├── betman-sync.ts              # 통합 동기화 (메인)
├── betman-fetch-results.ts     # 결과 수집 + 자동 정산
├── betman-save-json.ts         # JSON 저장
├── betman-fetch-games.ts       # API 저장
├── betman-check-latest.ts      # 최신 회차 확인
├── n8n-betman-parse-gameslip.js    # n8n 파싱
└── n8n-betman-extract-cookies.js   # n8n 쿠키 추출

.github/workflows/
├── betman-sync.yml             # 경기 수집 (6시간마다)
└── betman-results.yml          # 결과 수집 & 정산 (3회/일)

app/api/betman/
├── round/route.ts              # 라운드 API
├── games/route.ts              # 경기 API
├── prediction/route.ts         # 예측 API
├── results/route.ts            # 결과 저장 API
├── settle/route.ts             # 정산 API
├── rankings/route.ts           # 랭킹 API
├── my-stats/route.ts           # 내 통계 API
└── stats/recalculate/route.ts  # 통계 재계산 API (관리자)

lib/betman/
└── stats.ts                    # 유저 통계 계산 유틸리티

data/
├── betman-state.json           # 상태 관리
└── {gmTs}.json                 # 회차별 경기 데이터
```

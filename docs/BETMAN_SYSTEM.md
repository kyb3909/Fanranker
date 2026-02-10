# Betman 배당률 수집 시스템 기술문서

> 실시간으로 betman.co.kr에서 프로토 승부식 배당률을 수집하고, 승부 예측 게임을 운영하기 위한 시스템

## 목차

1. [시스템 개요](#시스템-개요)
2. [아키텍처](#아키텍처)
3. [스크립트 사용법](#스크립트-사용법)
4. [API 레퍼런스](#api-레퍼런스)
5. [n8n 워크플로우 설정](#n8n-워크플로우-설정)
6. [데이터베이스 스키마](#데이터베이스-스키마)
7. [JSON 파일 구조](#json-파일-구조)
8. [트러블슈팅](#트러블슈팅)

---

## 시스템 개요

### 목적

- betman.co.kr에서 프로토 승부식 경기 배당률 실시간 수집
- 회차(gmTs)별 경기 데이터 관리
- 사용자 승부 예측 게임 운영

### 핵심 기능

| 기능 | 설명 |
|------|------|
| 새 회차 감지 | 5분마다 새로운 gmTs 확인 |
| 배당률 갱신 | 1시간마다 활성 라운드 배당률 업데이트 |
| JSON 저장 | 회차별 `data/{gmTs}.json` 파일 생성 |
| DB 저장 | Supabase에 라운드/경기/예측 데이터 저장 |
| 예측 게임 | 사용자가 경기 결과 예측 참여 |

### 기술 스택

- **스크래핑**: Playwright (headless Chrome)
- **런타임**: Node.js + TypeScript (tsx)
- **스케줄링**: n8n / GitHub Actions
- **데이터베이스**: Supabase (PostgreSQL)
- **API**: Next.js API Routes

---

## 아키텍처

```
┌─────────────────────────────────────────────────────────────────────┐
│                           n8n 워크플로우                              │
├─────────────────────────────────────────────────────────────────────┤
│  Schedule (5분)           Schedule (1시간)                           │
│       ↓                         ↓                                    │
│  새 gmTs 확인              활성 라운드 갱신                           │
│       ↓                         ↓                                    │
│  betman-sync.ts           betman-sync.ts                             │
│  --check-only             --gmts={각 라운드}                         │
└───────────────────────────────┬─────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                        Playwright 스크립트                           │
├─────────────────────────────────────────────────────────────────────┤
│  1. gameSlip.do 페이지 접속 (세션/쿠키 획득)                         │
│  2. gameInfoInq.do API 호출 (브라우저 컨텍스트에서)                   │
│  3. JSON 응답 파싱                                                   │
│  4. data/{gmTs}.json 저장                                           │
│  5. API 호출 (DB 저장)                                              │
└───────────────────────────────┬─────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                          Next.js API                                 │
├─────────────────────────────────────────────────────────────────────┤
│  POST /api/betman/round     → 라운드 생성/조회                       │
│  POST /api/betman/games     → 경기 목록 저장 (upsert)                │
│  GET  /api/betman/games     → 오늘 경기 조회                         │
│  POST /api/betman/prediction → 예측 제출                             │
│  GET  /api/betman/prediction → 내 예측 조회                          │
└───────────────────────────────┬─────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                          Supabase DB                                 │
├─────────────────────────────────────────────────────────────────────┤
│  betman_rounds     : 회차 정보 (id, gm_ts, year, round, status)      │
│  betman_games      : 경기 정보 (배당률, 팀명, 시간 등)                │
│  betman_predictions: 사용자 예측 (user_id, game_id, prediction)      │
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
  "action": "created",        // created | updated | checked | error
  "gmTs": "260018",
  "isNew": true,              // 새 라운드 여부
  "gamesCount": 194,          // 수집된 경기 수
  "jsonPath": "data/260018.json",
  "activeRounds": ["260017", "260018"]
}
```

### 2. JSON 저장 전용 스크립트

**파일**: `scripts/betman-save-json.ts`

```bash
# 특정 회차 JSON 파일 생성
pnpm exec tsx scripts/betman-save-json.ts 260018
```

**결과**: `260018.json` 파일 생성

### 3. API 저장 전용 스크립트

**파일**: `scripts/betman-fetch-games.ts`

```bash
# 특정 회차 데이터 수집 → API로 DB 저장
pnpm exec tsx scripts/betman-fetch-games.ts 260018

# 환경변수 방식
BETMAN_GM_TS=260018 pnpm exec tsx scripts/betman-fetch-games.ts
```

### 4. 환경변수

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
  "year": 2026,      // optional, 기본값: 현재 연도
  "round": 18        // optional, 기본값: gmTs 숫자
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
  "games": [...],
  "groupedGames": [...],
  "userPredictions": [...],
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

---

## n8n 워크플로우 설정

### 워크플로우 1: 새 라운드 감지 (5분마다)

```
┌────────────────────────────────────────────────────────┐
│ 노드 1: Schedule Trigger                               │
│   - Interval: 5 minutes                                │
└──────────────────────┬─────────────────────────────────┘
                       ↓
┌────────────────────────────────────────────────────────┐
│ 노드 2: Execute Command                                │
│   - Command: pnpm exec tsx scripts/betman-sync.ts      │
│              --check-only                              │
│   - Working Directory: /path/to/community              │
└──────────────────────┬─────────────────────────────────┘
                       ↓
┌────────────────────────────────────────────────────────┐
│ 노드 3: IF                                             │
│   - Condition: {{ $json.isNew }} equals true           │
└──────────────────────┬─────────────────────────────────┘
                       ↓ (true일 때)
┌────────────────────────────────────────────────────────┐
│ 노드 4: Execute Command                                │
│   - Command: pnpm exec tsx scripts/betman-sync.ts      │
│              --gmts={{ $json.gmTs }}                   │
└────────────────────────────────────────────────────────┘
```

### 워크플로우 2: 배당률 갱신 (1시간마다)

```
┌────────────────────────────────────────────────────────┐
│ 노드 1: Schedule Trigger                               │
│   - Interval: 1 hour                                   │
└──────────────────────┬─────────────────────────────────┘
                       ↓
┌────────────────────────────────────────────────────────┐
│ 노드 2: Read Binary File                               │
│   - File Path: data/betman-state.json                  │
└──────────────────────┬─────────────────────────────────┘
                       ↓
┌────────────────────────────────────────────────────────┐
│ 노드 3: JSON Parse                                     │
│   - {{ $json.activeRounds }}                           │
└──────────────────────┬─────────────────────────────────┘
                       ↓
┌────────────────────────────────────────────────────────┐
│ 노드 4: Loop Over Items                                │
│   - Items: activeRounds 배열                           │
└──────────────────────┬─────────────────────────────────┘
                       ↓ (각 라운드마다)
┌────────────────────────────────────────────────────────┐
│ 노드 5: Execute Command                                │
│   - Command: pnpm exec tsx scripts/betman-sync.ts      │
│              --gmts={{ $json }}                        │
└────────────────────────────────────────────────────────┘
```

### n8n Execute Command 설정 예시

| 설정 | 값 |
|------|-----|
| **Command** | `pnpm exec tsx scripts/betman-sync.ts --gmts={{ $json.gmTs }}` |
| **Working Directory** | 프로젝트 절대 경로 |
| **Timeout** | 60000 (60초) |

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
| deadline | timestamptz | 예측 마감 시간 |
| created_at | timestamptz | 생성 시간 |

### betman_games

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK |
| round_id | uuid | FK → betman_rounds |
| game_no | integer | 경기 번호 |
| match_time | timestamptz | 경기 시간 |
| sport | text | 종목 (축구/농구/배구/야구) |
| game_type | text | 유형 (일반/핸디캡/언더오버/SUM) |
| home_team_name | text | 홈팀 |
| away_team_name | text | 원정팀 |
| league_code | text | 리그/대회명 |
| home_win_odds | numeric | 홈 승 배당률 |
| draw_odds | numeric | 무승부 배당률 |
| away_win_odds | numeric | 원정 승 배당률 |
| over_odds | numeric | 오버 배당률 |
| under_odds | numeric | 언더 배당률 |
| odd_odds | numeric | 홀 배당률 |
| even_odds | numeric | 짝 배당률 |
| status | text | scheduled / finished / cancelled |
| result | text | 경기 결과 |

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
| created_at | timestamptz | 예측 시간 |

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
      "over_odds": null,
      "under_odds": null,
      "odd_odds": null,
      "even_odds": null
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

## 트러블슈팅

### 1. Playwright 브라우저 오류

```bash
# Chromium 브라우저 설치
pnpm exec playwright install chromium
```

### 2. 타임아웃 오류

betman.co.kr 응답이 느릴 경우:
```typescript
// betman-sync.ts에서 timeout 값 증가
await page.goto(url, { timeout: 60000 }); // 60초
```

### 3. API 500 오류

- 로컬 서버 실행 확인: `pnpm dev`
- 환경변수 확인: `NEXT_PUBLIC_APP_URL`
- Supabase 연결 확인

### 4. JSON 파싱 오류

betman API 응답 구조 변경 시:
```bash
# 디버깅: 원본 응답 확인
pnpm exec tsx -e "
const { chromium } = require('playwright');
// ... 페이지 접속 후
console.log(JSON.stringify(json, null, 2));
"
```

### 5. 경기 데이터 없음 (0개)

- 해당 회차가 아직 발매 전일 수 있음
- 배당률이 모두 0인 경기는 필터링됨

---

## 빠른 명령어 참조

```bash
# 최신 회차 확인
pnpm exec tsx scripts/betman-sync.ts --check-only

# 특정 회차 전체 동기화 (JSON + DB)
pnpm exec tsx scripts/betman-sync.ts --gmts=260018

# JSON만 생성
pnpm exec tsx scripts/betman-sync.ts --gmts=260018 --skip-api

# JSON 저장 전용
pnpm exec tsx scripts/betman-save-json.ts 260018

# DB 저장 전용
pnpm exec tsx scripts/betman-fetch-games.ts 260018
```

---

## 관련 파일 목록

```
scripts/
├── betman-sync.ts           # 통합 동기화 (메인)
├── betman-save-json.ts      # JSON 저장
├── betman-fetch-games.ts    # API 저장
├── betman-check-latest.ts   # 최신 회차 확인
├── n8n-betman-parse-gameslip.js    # n8n 파싱
└── n8n-betman-extract-cookies.js   # n8n 쿠키 추출

app/api/betman/
├── round/route.ts           # 라운드 API
├── games/route.ts           # 경기 API
└── prediction/route.ts      # 예측 API

data/
├── betman-state.json        # 상태 관리
└── {gmTs}.json              # 회차별 경기 데이터
```

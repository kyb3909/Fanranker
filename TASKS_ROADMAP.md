# Betman 승부예측 — 결과 정산 & 통계/랭킹 로드맵

> 마지막 업데이트: 2026-02-14

## 기본 원칙

- **예측 규칙(prediction rules)은 절대 변경하지 않는다.** 기존 로직 그대로 유지.
- 기존 테이블(`betman_rounds`, `betman_games`, `betman_predictions`, `user_tokens`, `token_transactions`)을 최대한 활용한다.
- 예측은 '같은 종목끼리만 묶어서' 진행되며, **종목별 통계/랭킹이 반드시 가능**해야 한다.

---

## 현재 완료된 기능

- [x] 경기 데이터 크롤링 (`scripts/betman-fetch-games.ts` — Playwright로 `gameSlip.do` 파싱)
- [x] 경기 목록 API (`GET/POST /api/betman/games`)
- [x] 회차 관리 API (`POST /api/betman/round`)
- [x] 예측 등록/조회 API (`GET/POST /api/betman/prediction`)
- [x] 볼(토큰) 시스템 — 1예측당 1볼 차감, 일일 10볼 리셋
- [x] 핸디캡/언오버 기준선 표시
- [x] 종목별 조합 제약 (같은 종목끼리만)
- [x] GitHub Actions 워크플로우 (경기 수집)

---

## 현재 DB 상태 (참고)

| 테이블 | 데이터 |
|--------|--------|
| `betman_rounds` | 3개 (11회차, 260018, 260019), 전부 `open` |
| `betman_games` | 436건, 전부 `scheduled`, `result=null` |
| `betman_predictions` | 1건 (농구 일반, 인디페이 원정승 @5.32, `pending`) |
| `user_prediction_stats` | 0건, **종목(sport) 차원 없음** |

### 핵심 URL

- 경기 일정 + 배당률: `https://www.betman.co.kr/main/mainPage/gamebuy/gameSlip.do?gmId=G101&gmTs={gmTs}`
- 경기 결과: `https://www.betman.co.kr/main/mainPage/gamebuy/winrstDetl.do?gmId=G101&gmTs={gmTs}`

---

## Phase 1: 경기 결과 수집

> 목표: `winrstDetl.do`에서 경기 결과를 가져와 `betman_games`에 반영하고, `{gmTs}.json`에 통합 저장

### 1.1 결과 크롤링 스크립트

- [ ] **`scripts/betman-fetch-results.ts` 작성**
  - 기존 `betman-fetch-games.ts`와 동일한 Playwright 패턴 사용
  - `winrstDetl.do?gmId=G101&gmTs={gmTs}` 페이지를 열고, 페이지 컨텍스트에서 결과 API 호출
  - 파싱 대상:
    - 경기별 `home_score` (홈팀 점수)
    - 경기별 `away_score` (원정팀 점수)
    - 경기별 `result` 판정:
      - **일반**: 홈스코어 > 원정 → `home`, 같으면 → `draw`, 원정 > 홈 → `away`
      - **핸디캡**: (홈스코어 + 핸디캡값) vs 원정스코어로 판정 → `home` / `away`
      - **언더오버**: (홈스코어 + 원정스코어) vs `over_under_line` → `over` / `under`
      - **SUM(홀짝)**: (홈스코어 + 원정스코어) 홀수/짝수 판정
    - 경기 `status` → `completed` / `cancelled` / `postponed`
  - 실행: `pnpm exec tsx scripts/betman-fetch-results.ts [gmTs]`

- [ ] **winrstDetl.do 페이지 구조 분석**
  - Playwright로 페이지를 열어 실제 DOM/API 응답 구조 확인
  - 어떤 API를 내부적으로 호출하는지 파악 (네트워크 탭 관찰)
  - 결과 데이터 매핑 규칙 확정

### 1.2 결과 저장 API

- [ ] **`POST /api/betman/results` 엔드포인트 생성**
  - 입력: `{ gmTs, results: [{ game_no, home_score, away_score, result, status }] }`
  - 처리:
    1. `gmTs`로 `betman_rounds` 조회 → `round_id` 확보
    2. `betman_games` 업데이트: `home_score`, `away_score`, `result`, `status='completed'`
    3. 매칭 키: `(round_id, game_no)`로 기존 게임 찾아 업데이트
    4. 취소/연기 경기 처리: `status='cancelled'` 또는 `status='postponed'`
  - 응답: `{ updated: N, cancelled: N, errors: [] }`

### 1.3 JSON 파일 통합 저장

- [ ] **결과 수집 시 `{gmTs}.json` 파일 업데이트**
  - 기존 구조 (경기 일정 + 배당률)에 결과 필드 추가:
    ```json
    {
      "gmTs": "260018",
      "gmId": "G101",
      "fetchedAt": "...",
      "resultsUpdatedAt": "...",
      "totalGames": 149,
      "completedGames": 149,
      "games": [
        {
          "game_no": 1,
          "home_team_name": "...",
          "away_team_name": "...",
          "home_win_odds": 1.55,
          "away_win_odds": 2.10,
          "draw_odds": 3.80,
          "home_score": 2,
          "away_score": 1,
          "result": "home",
          "status": "completed"
        }
      ]
    }
    ```
  - 이미 일정 데이터가 있는 파일이면 merge, 없으면 새로 생성

### 1.4 GitHub Actions 워크플로우

- [ ] **`.github/workflows/betman-fetch-results.yml` 생성**
  - 스케줄: 회차 마감 이후 일정 시간마다 실행 (결과가 나올 때까지 반복)
  - 수동 트리거: `workflow_dispatch`로 `gmTs` 입력 가능
  - 순서: 결과 크롤링 → API 호출 → JSON 아티팩트 저장 → 정산 트리거

---

## Phase 2: 예측 정산 (Settlement)

> 목표: 완료된 경기의 예측을 판정하고, 수익금(배당률 기반)을 계산하여 저장

### 2.1 정산 API

- [ ] **`POST /api/betman/settle` 엔드포인트 생성**
  - 입력: `{ round_id }` 또는 `{ gm_ts }`
  - 처리 흐름:
    1. 해당 라운드의 `betman_games` 중 `status='completed'`인 경기 조회
    2. 해당 경기에 대한 `betman_predictions` 중 `status='pending'`인 예측 조회
    3. **적중 판정** (게임 타입별):

       | 게임 타입 | 판정 로직 | 결과값 |
       |-----------|-----------|--------|
       | 일반 | `prediction == result` | `home` / `draw` / `away` |
       | 핸디캡 | `prediction == result` (result는 이미 핸디캡 적용된 값) | `home` / `away` |
       | 언더오버 | `prediction == result` (result는 이미 기준선 비교된 값) | `over` / `under` |
       | SUM(홀짝) | 현재 예측 대상 아님 — 스킵 | — |

    4. **수익금 계산** (배당률 기반):
       - 적중 시: `points_earned` = 선택한 배당률 (소수점 2자리)
         - `home` 예측 적중 → `home_win_odds`
         - `away` 예측 적중 → `away_win_odds`
         - `draw` 예측 적중 → `draw_odds`
         - `over` 예측 적중 → `over_odds`
         - `under` 예측 적중 → `under_odds`
       - 미적중 시: `points_earned` = 0

    5. **betman_predictions 업데이트**:
       - `is_correct`: true / false
       - `points_earned`: 배당률 값 (적중 시) 또는 0 (미적중 시)
       - `status`: `'settled'`
       - `settled_at`: 현재 시각
       - 취소된 경기 예측: `status='cancelled'`, `is_correct=null`

    6. **betman_rounds 상태 업데이트**:
       - 해당 라운드의 모든 경기가 completed/cancelled이면 → `status='settled'`
       - 아직 진행 중인 경기가 있으면 → `status='closed'` (부분 정산)

  - 응답: `{ settled: N, correct: N, wrong: N, cancelled: N }`

### 2.2 자동 정산 트리거

- [ ] **결과 수집 완료 후 자동 정산 호출**
  - `betman-fetch-results.ts` 스크립트 마지막에 `/api/betman/settle` 호출
  - 또는 GitHub Actions에서 결과 수집 → 정산 순차 실행

### 2.3 points_earned 의미 정의

> **중요: 기존 컬럼의 의미를 아래와 같이 확정한다**

| 컬럼 | 의미 | 예시 |
|------|------|------|
| `betman_predictions.points_earned` | 적중 시 배당률 (= 1볼 베팅 기준 반환금) | 적중: `5.32`, 미적중: `0` |
| 순수익 계산 | `points_earned - 1` (1볼 투자 기준) | 적중: `4.32`, 미적중: `-1` |

- 1볼 베팅 → 적중 시 `배당률`만큼 반환 → 순이익 = `배당률 - 1`
- 1볼 베팅 → 미적중 시 반환 0 → 순이익 = `-1`

---

## Phase 3: 종목별 통계 테이블

> 목표: 유저의 적중률/수익률/수익금을 전체 + 종목별로 빠르게 산출 가능하게 만든다

### 3.1 새 테이블: `betman_user_sport_stats`

- [ ] **마이그레이션 작성 및 적용**

  ```sql
  CREATE TABLE betman_user_sport_stats (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id text NOT NULL,
    sport text NOT NULL,  -- '축구', '농구', '배구', '야구', '전체'

    -- 예측 카운트
    total_predictions int DEFAULT 0,
    correct_predictions int DEFAULT 0,
    wrong_predictions int DEFAULT 0,
    cancelled_predictions int DEFAULT 0,

    -- 적중률
    accuracy numeric(5,2) DEFAULT 0,  -- correct / (correct + wrong) * 100

    -- 수익 (1볼 단위 기준)
    total_wagered int DEFAULT 0,         -- 총 베팅 볼 수 (= total - cancelled)
    total_returns numeric(10,2) DEFAULT 0, -- 총 반환금 (적중 배당률 합계)
    net_profit numeric(10,2) DEFAULT 0,    -- 순수익 (returns - wagered)
    profit_rate numeric(7,2) DEFAULT 0,    -- 수익률 % ((returns - wagered) / wagered * 100)

    -- 연승/연패
    current_streak int DEFAULT 0,      -- 양수: 연승, 음수: 연패
    best_win_streak int DEFAULT 0,
    worst_lose_streak int DEFAULT 0,

    -- 타임스탬프
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),

    -- 유니크 제약: 유저 + 종목 조합
    UNIQUE(user_id, sport),

    -- 종목 제약
    CHECK (sport IN ('축구', '농구', '배구', '야구', '전체'))
  );

  -- 인덱스
  CREATE INDEX idx_buss_user ON betman_user_sport_stats(user_id);
  CREATE INDEX idx_buss_sport ON betman_user_sport_stats(sport);
  CREATE INDEX idx_buss_profit_rate ON betman_user_sport_stats(sport, profit_rate DESC);
  CREATE INDEX idx_buss_accuracy ON betman_user_sport_stats(sport, accuracy DESC);
  CREATE INDEX idx_buss_net_profit ON betman_user_sport_stats(sport, net_profit DESC);

  -- RLS
  ALTER TABLE betman_user_sport_stats ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Anyone can read stats" ON betman_user_sport_stats FOR SELECT USING (true);
  CREATE POLICY "Service role can manage stats" ON betman_user_sport_stats FOR ALL USING (true);
  ```

### 3.2 통계 갱신 로직

- [ ] **정산 시 자동 통계 업데이트**
  - 정산 API (`/api/betman/settle`)에서 정산 완료 후 호출
  - 처리 흐름:
    1. 정산된 예측들을 `user_id + sport` 별로 그룹핑
    2. 각 `(user_id, sport)` 조합에 대해:
       - 해당 유저+종목의 전체 정산된 예측을 DB에서 집계
       - `total_predictions`, `correct_predictions`, `wrong_predictions` 계산
       - `accuracy` = correct / (correct + wrong) * 100
       - `total_wagered` = correct + wrong (취소 제외)
       - `total_returns` = SUM(points_earned) where is_correct = true
       - `net_profit` = total_returns - total_wagered
       - `profit_rate` = (net_profit / total_wagered) * 100
       - 연승/연패: 최근 정산 순서대로 streak 계산
    3. `betman_user_sport_stats`에 UPSERT (user_id, sport)
    4. `sport='전체'` 행도 별도로 집계하여 UPSERT

- [ ] **통계 재계산 API (관리자용)**
  - `POST /api/betman/stats/recalculate`
  - 전체 유저의 통계를 처음부터 다시 계산 (데이터 정합성 보정용)
  - 모든 settled 예측을 기반으로 재집계

### 3.3 기존 `user_prediction_stats` 테이블 처리

- [ ] **기존 테이블은 그대로 두고, 새 테이블과 병행 운영**
  - `user_prediction_stats`: 기존 코드에서 참조하는 곳이 있을 수 있으므로 유지
  - `betman_user_sport_stats`: 종목별 통계 전용 (랭킹, 마이페이지 등에서 사용)
  - 향후 기존 테이블의 참조가 모두 새 테이블로 전환되면 제거 가능

---

## Phase 4: 랭킹 시스템

> 목표: 전체 + 종목별 랭킹을 빠르게 조회 가능하게 만든다

### 4.1 랭킹 조회 API

- [ ] **`GET /api/betman/rankings` 엔드포인트 생성**
  - 쿼리 파라미터:
    - `sport`: `전체` / `축구` / `농구` / `배구` / `야구` (기본: `전체`)
    - `sort`: `profit_rate` / `accuracy` / `net_profit` (기본: `profit_rate`)
    - `limit`: 결과 수 (기본: 50)
    - `offset`: 페이지네이션
    - `min_predictions`: 최소 예측 수 필터 (기본: 10, 소수 예측으로 인한 왜곡 방지)
  - 응답:
    ```json
    {
      "rankings": [
        {
          "rank": 1,
          "user_id": "...",
          "nickname": "...",
          "avatar_url": "...",
          "sport": "축구",
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
      "my_rank": { "rank": 15, ... }
    }
    ```
  - 쿼리: `betman_user_sport_stats` JOIN `profiles` (닉네임, 아바타)
  - 본인 순위도 함께 반환

### 4.2 랭킹 UI 업데이트

- [ ] **기존 랭킹 탭 개선** (`components/betman-prediction-content.tsx`)
  - 종목 필터 탭 추가: 전체 / 축구 / 농구
  - 정렬 기준 선택: 수익률 / 적중률 / 수익금
  - 컬럼 표시: 순위, 닉네임, 적중률, 수익률, 수익금, 연승
  - 현재 Top 5 → 더 많은 유저 표시 (페이지네이션 또는 무한스크롤)

### 4.3 마이페이지 통계 개선

- [ ] **내 통계 카드 업데이트**
  - 현재: 레벨, 포인트, 적중률, 연승 (user_stats 기반)
  - 변경: `betman_user_sport_stats`에서 데이터 가져오기
  - 표시 항목:
    - 전체 적중률 / 수익률 / 수익금
    - 종목별 적중률 / 수익률 (미니 차트 또는 탭)
    - 최근 예측 히스토리 (적중/미적중 표시)

---

## Phase 5: 최신 회차(gmTs) 자동 감지

> 목표: 현재 진행 중인 최신 gmTs를 자동으로 파악

### 5.1 최신 gmTs 감지

- [ ] **방법 A: betman.co.kr 메인 페이지에서 추출**
  - Playwright로 betman.co.kr 접속 → 현재 판매 중인 회차 번호 파싱
  - 또는 gameSlip.do를 gmTs 없이 호출 시 리다이렉트되는 URL에서 추출

- [ ] **방법 B: 순차 증가 방식**
  - DB에서 가장 최근 `gm_ts` 조회 (현재 260019)
  - 다음 회차 = 260020으로 시도 → 데이터가 있으면 성공, 없으면 현재 회차 유지

- [ ] **자동 감지 스크립트 작성**
  - `scripts/betman-detect-round.ts`
  - GitHub Actions에서 주기적으로 실행 → 새 회차 감지 시 자동 수집 트리거

---

## 수익 계산 공식 정리

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

## 우선순위 및 진행 순서

| 순서 | Phase | 태스크 | 우선순위 | 상태 |
|------|-------|--------|----------|------|
| 1 | 1.1 | winrstDetl.do 페이지 구조 분석 | 🔴 최우선 | ✅ 완료 |
| 2 | 1.1 | 결과 크롤링 스크립트 작성 | 🔴 최우선 | ✅ 완료 |
| 3 | 1.2 | 결과 저장 API | 🔴 최우선 | ✅ 완료 |
| 4 | 1.3 | JSON 파일 통합 저장 | 🟠 높음 | ✅ 완료 |
| 5 | 2.1 | 정산 API 구현 | 🔴 최우선 | ✅ 완료 |
| 6 | 2.2 | 자동 정산 트리거 | 🟠 높음 | ✅ 완료 |
| 7 | 3.1 | betman_user_sport_stats 테이블 생성 | 🔴 최우선 | ✅ 완료 |
| 8 | 3.2 | 통계 갱신 로직 (정산 시 자동) | 🔴 최우선 | ✅ 완료 |
| 9 | 4.1 | 랭킹 조회 API | 🟠 높음 | ✅ 완료 |
| 10 | 4.2 | 랭킹 UI 업데이트 (종목필터, 내순위, 연승) | 🟠 높음 | ✅ 완료 |
| 11 | 4.3 | 마이페이지 통계 개선 | 🟡 중간 | ✅ 완료 |
| — | — | 팔로우/언팔로우 API + UI | 🟠 높음 | ✅ 완료 |
| 12 | 1.4 | GitHub Actions (결과 수집) | 🟡 중간 | ⬜ 대기 |
| 13 | 3.3 | 통계 재계산 API (관리자용) | 🟡 중간 | ✅ 완료 |
| 14 | 5.1 | 최신 gmTs 자동 감지 | 🟡 중간 | ⬜ 대기 |

---

## 기술 스택

- Frontend: Next.js 15, React, TailwindCSS, Radix UI
- Backend: Next.js API Routes (App Router)
- Database: Supabase (PostgreSQL)
- Auth: Clerk
- Scraping: Playwright
- CI/CD: GitHub Actions, Vercel

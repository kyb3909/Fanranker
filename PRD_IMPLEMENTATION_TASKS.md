# PRD 구현 Task To-Do 리스트

> **기준일**: 2026-01-15  
> **분석 방법**: Context-7 Reasoning + Sequential Thinking  
> **PRD 버전**: prd.md (Core Features 기반)

---

## 📊 현재 구현 상태 분석

### ✅ 완료된 기능 (Community 기반)
- ✅ 게시글 작성/조회 (posts 테이블 + API)
- ✅ 댓글 시스템 (comments 테이블 + API)
- ✅ 투표 시스템 (post_votes 테이블 + API)
- ✅ 검색 기능 (닉네임/ID/제목/제목+내용)
- ✅ 알림 시스템 (notifications + user_follows)
- ✅ 이미지 업로드 (Supabase Storage)
- ✅ Clerk 인증 통합

### 🔄 부분 구현 (Prediction 시스템)
- ✅ `/api/prediction` POST/GET (예측 생성/조회)
- ✅ `predictions` 테이블 존재
- ✅ `user_prediction_stats` 테이블 존재
- ✅ `app/prediction/page.tsx` (서버 컴포넌트)
- ⚠️ `components/betting-page.tsx` (mock 데이터 사용)
- ⚠️ 예측 결과 정산 로직 미확인
- ⚠️ 수익률 계산 로직 미확인

### ❌ 미구현 (PRD Core Features)
- ❌ **사이버 토큰 시스템** (일일 리셋, 잔액 관리)
- ❌ **종목별 조합 제약** (락인 로직)
- ❌ **수익률 기반 랭킹** (profit, ROI 계산)
- ❌ **전문가 인증 시스템**
- ❌ **분석 기반 콘텐츠 생성** (예측 + 분석 코멘트)
- ❌ **정보 구독 시스템** (결제, 접근 제어)

---

## 🎯 Task Breakdown (우선순위별)

### 🔴 P0 - MVP Core (필수)

#### **PRED-001: 사이버 토큰 시스템 DB 스키마 설계 및 마이그레이션**
**목표**: 일일 사이버 토큰 리셋 및 잔액 관리를 위한 테이블 구조 설계

**세부 작업**:
1. `user_tokens` 테이블 생성
   - `user_id` (text, FK → profiles.user_id)
   - `token_balance` (integer, 기본값: 일일 할당량)
   - `last_reset_at` (timestamptz, 마지막 리셋 시간)
   - `total_tokens_earned` (integer, 누적 획득)
   - `created_at`, `updated_at`
2. `token_transactions` 테이블 생성 (선택, 감사용)
   - `id` (uuid)
   - `user_id` (text)
   - `transaction_type` (enum: 'daily_reset', 'prediction_spent', 'reward_earned')
   - `amount` (integer, 양수=획득, 음수=소모)
   - `balance_after` (integer, 거래 후 잔액)
   - `created_at`
3. RLS 정책 설정 (사용자는 자신의 토큰만 조회/업데이트)
4. 인덱스 생성 (`user_id`, `last_reset_at`)

**파일**: `supabase/migrations/007_create_user_tokens.sql`

**의존성**: `001_create_profiles.sql`

**예상 시간**: 2시간

---

#### **PRED-002: 일일 토큰 리셋 로직 구현 (서버 함수)**
**목표**: 매일 정오(12:00 KST)에 모든 사용자 토큰 잔액을 리셋

**세부 작업**:
1. Supabase Edge Function 또는 Next.js API Route 생성
   - 경로: `/api/cron/daily-token-reset` (또는 Edge Function)
2. 로직:
   - `last_reset_at < 오늘 00:00 KST` 인 사용자 조회
   - `token_balance = 일일 할당량` (예: 1000)
   - `last_reset_at = now()`
   - 배치 업데이트 실행
3. Cron 스케줄러 설정 (Vercel Cron 또는 외부 서비스)
   - 매일 12:00 KST 실행
4. 테스트용 수동 트리거 엔드포인트 (개발용)

**파일**: 
- `app/api/cron/daily-token-reset/route.ts` (또는 `supabase/functions/daily-token-reset/index.ts`)
- `vercel.json` (Cron 설정)

**의존성**: PRED-001

**예상 시간**: 3시간

---

#### **PRED-003: 토큰 잔액 조회 API 및 UI 연동**
**목표**: 사용자가 현재 토큰 잔액을 확인하고 예측 시 소모 로직 구현

**세부 작업**:
1. `GET /api/tokens/balance` API 구현
   - 현재 사용자 토큰 잔액 반환
   - `last_reset_at` 확인하여 필요 시 리셋 (자동 보정)
2. `POST /api/tokens/spend` API 구현 (또는 `/api/prediction`에 통합)
   - 예측 생성 시 토큰 소모
   - 잔액 부족 시 400 에러
   - 트랜잭션 처리 (원자성 보장)
3. `components/prediction-content.tsx` 수정
   - 토큰 잔액 표시 (헤더 또는 사이드바)
   - 예측 제출 시 잔액 실시간 업데이트
4. `components/betting-page.tsx` 연동
   - 토큰 잔액 표시
   - 토큰 부족 시 경고 메시지

**파일**: 
- `app/api/tokens/balance/route.ts`
- `app/api/tokens/spend/route.ts` (또는 `app/api/prediction/route.ts` 수정)
- `components/prediction-content.tsx` (수정)

**의존성**: PRED-001, PRED-002

**예상 시간**: 4시간

---

#### **PRED-004: 종목별 조합 제약 로직 구현**
**목표**: 첫 경기 선택 시 해당 종목에 락인, 동일 종목 내에서만 조합 가능

**세부 작업**:
1. 클라이언트 로직 (`components/betting-page.tsx`)
   - `selectedBets` 상태에서 첫 경기의 `sport` 추출
   - 추가 선택 시 `sport` 검증 (`selectedBets[0].sport === newBet.sport`)
   - 다른 종목 선택 시 경고 메시지 + 선택 차단
   - 베팅 슬립 UI에 "락인된 종목" 표시
2. 서버 검증 (`POST /api/prediction`)
   - 요청 본문에 `sport_type` 배열 포함 시 검증
   - 클라이언트 우회 방지
3. 예측 조합 저장 로직 수정
   - 단일 예측: `predictions` 테이블 1개 레코드
   - 조합 예측: `prediction_combinations` 테이블 생성 (선택)
   - 또는 `predictions` 테이블에 `combination_id` 필드 추가

**파일**: 
- `components/betting-page.tsx` (수정)
- `app/api/prediction/route.ts` (수정)
- `supabase/migrations/008_add_prediction_combinations.sql` (선택)

**의존성**: PRED-003

**예상 시간**: 3시간

---

#### **PRED-005: 예측 결과 정산 시스템 구현**
**목표**: 경기 종료 후 예측 결과를 자동/수동으로 정산하여 `is_correct` 업데이트

**세부 작업**:
1. `matches` 테이블에 결과 필드 확인/추가
   - `score_home`, `score_away`, `time_status` (이미 존재)
   - `is_settled` (boolean, 정산 완료 여부)
2. 정산 로직 구현 (`POST /api/predictions/settle` 또는 Edge Function)
   - `matches.time_status = 3` (종료) 이고 `is_settled = false` 인 경기 조회
   - `predictions` 테이블에서 해당 `match_id`의 모든 예측 조회
   - `prediction_type`과 실제 결과 비교
     - `full_time_result`: `score_home` vs `score_away` 비교
     - `goals_over_under`: 총 골수 vs `predicted_value` 비교
     - `both_teams_to_score`: 양팀 모두 득점 여부 비교
   - `is_correct` 필드 업데이트 (true/false)
   - `points_earned` 계산 (정확 시 배당률 * 투입 토큰)
   - `matches.is_settled = true` 업데이트
3. 수동 정산 관리자 API (선택)
   - `/api/admin/predictions/settle?match_id=xxx`
4. 자동 정산 스케줄러 (선택)
   - 경기 종료 후 1시간 후 자동 정산 (Edge Function/Cron)

**파일**: 
- `supabase/migrations/009_add_settlement_fields.sql`
- `app/api/predictions/settle/route.ts` (또는 `supabase/functions/settle-predictions/index.ts`)
- `app/api/admin/predictions/settle/route.ts` (선택)

**의존성**: PRED-004, 기존 `predictions` 테이블

**예상 시간**: 5시간

---

#### **PRED-006: 수익률 기반 랭킹 계산 로직 구현**
**목표**: `user_prediction_stats` 테이블의 수익률(profit, ROI) 자동 계산 및 랭킹 집계

**세부 작업**:
1. 통계 계산 로직 (`POST /api/predictions/settle` 또는 별도 함수)
   - `is_correct = true` 인 예측들의 `points_earned` 합산 = `total_profit`
   - `total_predictions` (전체 예측 수)
   - `correct_predictions` (정확한 예측 수)
   - `accuracy = correct_predictions / total_predictions * 100`
   - `roi = (total_profit - total_tokens_spent) / total_tokens_spent * 100`
   - `user_prediction_stats` 테이블 업데이트 (또는 생성)
2. 종목별 통계 계산 (선택)
   - `user_prediction_stats_by_sport` 테이블 생성
   - 종목별 `profit`, `accuracy`, `roi` 집계
3. 랭킹 조회 API (`GET /api/rankings`)
   - 전체 랭킹: `ORDER BY total_profit DESC`
   - 종목별 랭킹: `WHERE sport_type = ? ORDER BY profit DESC`
   - 필터링: `profit`, `accuracy`, `roi` 선택 가능
4. `app/prediction/page.tsx` 랭킹 데이터 연동
   - `fetchRankings()` 함수 수정 (DB 조회)
   - `components/prediction-content.tsx` 랭킹 탭 연동

**파일**: 
- `app/api/predictions/settle/route.ts` (수정)
- `app/api/rankings/route.ts` (신규)
- `supabase/migrations/010_create_user_prediction_stats_by_sport.sql` (선택)
- `app/prediction/page.tsx` (수정)

**의존성**: PRED-005

**예상 시간**: 6시간

---

### 🟡 P1 - High Priority (단기 필요)

#### **PRED-007: 전문가 인증 시스템 구현**
**목표**: 일정 랭킹 이상 사용자에게 '전문가' 등급 부여 및 관리자 승인 기능

**세부 작업**:
1. `profiles` 테이블에 필드 추가
   - `is_expert` (boolean, 기본값: false)
   - `expert_certified_at` (timestamptz, 인증 일시)
   - `expert_rank_threshold` (integer, 인증 기준 랭킹)
2. 전문가 자동 승인 로직 (선택)
   - `user_prediction_stats.total_profit >= 임계값` 또는 `accuracy >= 70%` 일 때
   - 자동으로 `is_expert = true` 설정 (배치 작업)
3. 관리자 수동 승인 API (`POST /api/admin/users/certify-expert`)
   - `user_id` 파라미터
   - `is_expert = true` 업데이트
4. 전문가 목록 조회 (`GET /api/users/experts`)
   - `WHERE is_expert = true ORDER BY total_profit DESC`
5. UI 표시
   - 전문가 프로필에 "전문가" 뱃지 표시
   - 랭킹 페이지에 전문가 필터 추가

**파일**: 
- `supabase/migrations/011_add_expert_fields.sql`
- `app/api/admin/users/certify-expert/route.ts`
- `app/api/users/experts/route.ts`
- `components/user-profile-badge.tsx` (신규)

**의존성**: PRED-006

**예상 시간**: 4시간

---

#### **PRED-008: 분석 기반 콘텐츠 생성 기능**
**목표**: 예측 등록 시 분석 코멘트를 필수로 작성하고 콘텐츠로 저장

**세부 작업**:
1. `predictions` 테이블에 필드 추가
   - `analysis_text` (text, 분석 코멘트)
   - `is_premium` (boolean, 유료 콘텐츠 여부, 기본값: false)
   - `price` (integer, 건별 구매 가격, 선택)
2. `POST /api/prediction` API 수정
   - `analysis_text` 필드 필수 검증
   - 최소 길이 제한 (예: 50자 이상)
3. `components/prediction-content.tsx` 수정
   - 예측 제출 폼에 "분석 코멘트" 텍스트 영역 추가 (TipTap 에디터 선택)
   - 필수 표시 및 검증
4. 예측 피드에 분석 코멘트 표시
   - 구독 피드 (`components/betting-page.tsx`)에서 `analysis_text` 렌더링
   - 유료 콘텐츠는 "구매하기" 버튼 표시

**파일**: 
- `supabase/migrations/012_add_prediction_analysis.sql`
- `app/api/prediction/route.ts` (수정)
- `components/prediction-content.tsx` (수정)
- `components/betting-page.tsx` (수정)

**의존성**: PRED-004

**예상 시간**: 3시간

---

#### **PRED-009: 사용자 프로필 페이지 구현 (`/profile/[id]`)**
**목표**: 사용자 프로필 조회 페이지 (예측 통계, 작성 글 목록, 팔로우 버튼)

**세부 작업**:
1. `app/profile/[id]/page.tsx` 생성
   - Server Component로 구현
   - `user_id` 파라미터로 프로필 조회
2. 데이터 조회 로직
   - `profiles` 테이블: 닉네임, 아바타, 온도
   - `user_prediction_stats`: 수익률, 적중률, 랭킹
   - `posts`: 작성한 글 목록 (최근 10개)
   - `predictions`: 최근 예측 내역 (최근 5개)
3. UI 구성
   - 프로필 헤더 (아바타, 닉네임, 전문가 뱃지)
   - 통계 카드 (수익률, 적중률, 총 예측 수)
   - 탭: "작성한 글", "예측 내역", "팔로워/팔로잉"
4. 팔로우 버튼 (이미 `user_follows` 테이블 존재)
   - `POST /api/users/[id]/follow` API 호출
   - `user-menu.tsx`의 `/profile` 링크 수정

**파일**: 
- `app/profile/[id]/page.tsx` (신규)
- `components/user-profile-header.tsx` (신규)
- `components/user-stats-card.tsx` (신규)
- `app/api/users/[id]/follow/route.ts` (신규 또는 기존 수정)

**의존성**: PRED-006, 기존 `user_follows` 테이블

**예상 시간**: 5시간

---

### 🟢 P2 - Medium Priority (중기)

#### **PRED-010: 정보 구독 시스템 (월간 구독 + 건별 구매)**
**목표**: 전문가의 분석 콘텐츠를 월간 구독하거나 건별로 구매할 수 있는 시스템

**세부 작업**:
1. `subscriptions` 테이블 생성
   - `id` (uuid)
   - `subscriber_id` (text, FK → profiles.user_id)
   - `expert_id` (text, FK → profiles.user_id)
   - `subscription_type` (enum: 'monthly', 'one_time')
   - `status` (enum: 'active', 'expired', 'cancelled')
   - `started_at`, `expires_at`
   - `amount_paid` (integer, 결제 금액)
2. `purchased_content` 테이블 생성 (건별 구매)
   - `id` (uuid)
   - `user_id` (text)
   - `prediction_id` (uuid, FK → predictions.id)
   - `purchase_price` (integer)
   - `purchased_at`
3. Stripe 결제 연동 (또는 다른 결제 게이트웨이)
   - `/api/payments/subscribe` (월간 구독)
   - `/api/payments/purchase` (건별 구매)
   - Webhook 처리 (`/api/webhooks/stripe`)
4. 콘텐츠 접근 제어 로직
   - `GET /api/predictions/[id]` 에서 `is_premium = true` 인 경우
   - 구독 또는 구매 여부 확인
   - 미인증 시 403 에러 또는 구매 페이지 리다이렉트
5. UI 구현
   - 전문가 프로필에 "구독하기" 버튼
   - 유료 콘텐츠에 "구매하기" 버튼
   - 구독 상태 표시

**파일**: 
- `supabase/migrations/013_create_subscriptions.sql`
- `supabase/migrations/014_create_purchased_content.sql`
- `app/api/payments/subscribe/route.ts`
- `app/api/payments/purchase/route.ts`
- `app/api/webhooks/stripe/route.ts`
- `components/subscribe-button.tsx` (신규)

**의존성**: PRED-007, PRED-008, Stripe 계정 설정

**예상 시간**: 8시간 (Stripe 연동 포함)

---

#### **PRED-011: 24시간 이내 경기 필터링 로직**
**목표**: 사이버 토큰은 24시간 이내 경기 예측에만 사용 가능

**세부 작업**:
1. `POST /api/prediction` API 수정
   - `matches.match_time` 확인
   - `match_time - now() <= 24시간` 검증
   - 24시간 초과 시 400 에러 반환
2. `components/prediction-content.tsx` 수정
   - 경기 목록에서 24시간 이내 경기만 표시 (또는 비활성화)
   - "24시간 이내 경기에만 예측 가능" 안내 문구
3. 토큰 잔액 조회 시 만료 경기 필터링 (선택)

**파일**: 
- `app/api/prediction/route.ts` (수정)
- `components/prediction-content.tsx` (수정)

**의존성**: PRED-003

**예상 시간**: 2시간

---

#### **PRED-012: 베팅 페이지 DB 연동 (mock 데이터 제거)**
**목표**: `components/betting-page.tsx`의 mock 데이터를 실제 DB 데이터로 교체

**세부 작업**:
1. `app/prediction/page.tsx`에서 데이터 전달 확인
   - `matches`, `userPredictions`, `userStats`, `rankings` 이미 전달 중
2. `components/betting-page.tsx` 수정
   - `mockPosts` → API 호출로 교체 (`GET /api/predictions/feed`)
   - `rankingData` → `rankings` prop 사용
   - `predictionHistory` → `userPredictions` prop 사용
3. `GET /api/predictions/feed` API 구현 (선택)
   - 팔로우한 전문가의 예측 콘텐츠 조회
   - 정렬: 최신순, 인기순
   - 페이지네이션 지원

**파일**: 
- `components/betting-page.tsx` (수정)
- `app/api/predictions/feed/route.ts` (선택)

**의존성**: PRED-008, PRED-009

**예상 시간**: 4시간

---

### 🔵 P3 - Low Priority (장기)

#### **PRED-013: 관리자 대시보드 구현**
**목표**: 경기 관리, 전문가 승인, 정산 처리 등 관리 기능 제공

**세부 작업**:
1. `app/admin/page.tsx` 생성 (접근 제어 필요)
2. 관리자 인증 로직
   - `profiles.is_admin` 필드 추가
   - Middleware에서 `/admin/*` 경로 보호
3. 주요 기능:
   - 경기 목록 조회/수정 (`/admin/matches`)
   - 예측 정산 수동 처리 (`/admin/settlements`)
   - 전문가 승인/해제 (`/admin/experts`)
   - 토큰 시스템 모니터링 (`/admin/tokens`)
4. UI: 데이터 테이블, 필터링, 검색, 페이지네이션

**파일**: 
- `supabase/migrations/015_add_admin_field.sql`
- `app/admin/page.tsx`
- `app/admin/matches/page.tsx`
- `app/admin/experts/page.tsx`
- `middleware.ts` (수정)

**의존성**: PRED-005, PRED-007

**예상 시간**: 10시간

---

#### **PRED-014: 실시간 알림 시스템 (전문가 피드)**
**목표**: 팔로우한 전문가가 새 예측을 올리면 실시간 알림 (Supabase Realtime)

**세부 작업**:
1. `notifications` 테이블에 `type = 'expert_prediction'` 추가
2. `POST /api/prediction` API 수정
   - 전문가가 예측 생성 시 팔로워들에게 알림 생성
3. Supabase Realtime 구독 (선택)
   - 클라이언트에서 `notifications` 테이블 변경 사항 구독
   - 실시간 알림 표시 (토스트 또는 드롭다운)

**파일**: 
- `supabase/migrations/006_create_notifications.sql` (확장)
- `app/api/prediction/route.ts` (수정)
- `components/notification-dropdown.tsx` (수정, Realtime 구독 추가)

**의존성**: 기존 알림 시스템 (DONE-046)

**예상 시간**: 3시간

---

## 📅 권장 구현 순서 (Phase별)

### **Phase 1: 토큰 시스템 기반 구축** (Week 1)
```
PRED-001 → PRED-002 → PRED-003 → PRED-004
```
**목표**: 사이버 토큰 시스템 완전 구축, 예측 제출 시 토큰 소모, 종목 락인 로직

---

### **Phase 2: 예측 정산 및 통계** (Week 2)
```
PRED-005 → PRED-006
```
**목표**: 예측 결과 정산, 수익률 계산, 랭킹 시스템 완성

---

### **Phase 3: 전문가 시스템 및 콘텐츠** (Week 3)
```
PRED-007 → PRED-008 → PRED-009
```
**목표**: 전문가 인증, 분석 콘텐츠 생성, 프로필 페이지

---

### **Phase 4: 구독 시스템 및 완성** (Week 4)
```
PRED-010 → PRED-011 → PRED-012
```
**목표**: 결제 연동, 24시간 필터링, mock 데이터 제거

---

### **Phase 5: 관리자 및 부가 기능** (Week 5+)
```
PRED-013 → PRED-014
```
**목표**: 관리자 대시보드, 실시간 알림

---

## 📋 마이그레이션 파일 체크리스트

현재 존재하는 마이그레이션:
- ✅ `001_create_profiles.sql`
- ✅ `002_create_categories_posts.sql`
- ✅ `003_create_comments.sql`
- ✅ `004_create_post_votes.sql`
- ✅ `005_create_user_follows.sql`
- ✅ `006_create_notifications.sql`

**추가 필요**:
- [ ] `007_create_user_tokens.sql` (PRED-001)
- [ ] `008_add_prediction_combinations.sql` (PRED-004, 선택)
- [ ] `009_add_settlement_fields.sql` (PRED-005)
- [ ] `010_create_user_prediction_stats_by_sport.sql` (PRED-006, 선택)
- [ ] `011_add_expert_fields.sql` (PRED-007)
- [ ] `012_add_prediction_analysis.sql` (PRED-008)
- [ ] `013_create_subscriptions.sql` (PRED-010)
- [ ] `014_create_purchased_content.sql` (PRED-010)
- [ ] `015_add_admin_field.sql` (PRED-013)

---

## ⚠️ 주요 고려사항

1. **성능**: 랭킹 집계는 실시간 계산보다는 주기적 배치 업데이트 권장 (Edge Function/Cron)
2. **보안**: 결제 API는 Stripe Webhook 서명 검증 필수
3. **확장성**: 종목별 통계는 별도 테이블로 분리하여 쿼리 성능 최적화
4. **데이터 일관성**: 토큰 소모와 예측 생성은 트랜잭션으로 처리 (PostgreSQL 트랜잭션 사용)

---

## 📊 예상 총 소요 시간

- **P0 (필수)**: ~23시간 (6개 태스크)
- **P1 (High)**: ~12시간 (3개 태스크)
- **P2 (Medium)**: ~14시간 (3개 태스크)
- **P3 (Low)**: ~13시간 (2개 태스크)

**총 예상**: ~62시간 (약 8일, 1일 8시간 기준)

---

*이 문서는 PRD.md를 기반으로 작성되었으며, 구현 진행에 따라 업데이트됩니다.*

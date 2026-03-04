# ADMIN-PRD: Live Ops Control Panel

## Research Findings Summary

**7개 SaaS 플랫폼 분석** (Supabase Studio, Vercel, Stripe/Radar, Discord, Firebase, Linear, GitHub)에서 도출된 **Enterprise-Grade 공통 패턴**:

| # | Pattern | 출현률 | 적용 우선도 |
|---|---------|--------|------------|
| 1 | RBAC (Role-Based Access Control) | 7/7 | Critical |
| 2 | Centralized Logging | 7/7 | Critical |
| 3 | Real-time Monitoring Dashboard | 7/7 | Critical |
| 4 | API Key / Token Management | 7/7 | Critical |
| 5 | Audit Log | 6/7 | Critical |
| 6 | Webhook / Event System | 6/7 | High |
| 7 | Environment Separation | 5/7 | High |
| 8 | Content Moderation / Rule Engine | 4/7 | High |
| 9 | Feature Flags / Remote Config | 4/7 | Medium |

**현재 서비스 DB 구조**: 48개 테이블, 6개 도메인 (Community, Betman Prediction, Commission/Art, Entertainment, News Ticker, Economy)

---

## ADMIN-IA (Information Architecture)

```
Admin Console (admin.fanranker.com)
├── 🏠 Dashboard (Single Pane of Glass)
│   ├── KPI Cards (DAU, Revenue, Predictions, Content)
│   ├── Live Activity Feed
│   ├── System Health Indicators
│   └── Alert Banner (critical issues)
│
├── 👥 User Ops [MOD-001]
│   ├── User Directory
│   ├── User Detail / Profile Editor
│   ├── Risk & Trust Scoring
│   ├── Economy Adjustments (Token / Gold)
│   └── Ban / Sanction Management
│
├── 📝 Content Ops [MOD-002]
│   ├── Post Management
│   ├── Comment Management
│   ├── Report Queue
│   ├── News Ticker Control
│   └── Community Board Config
│
├── 🎮 Game Economy [MOD-003]
│   ├── Betman Round Management
│   ├── Daily Round Control
│   ├── Prediction Audit
│   ├── Token / Gold Ledger
│   ├── Commission & Escrow
│   └── Quiz & Casting Management
│
├── 🛡️ Moderation [MOD-004]
│   ├── AutoMod Rule Engine
│   ├── ML Flag Review Queue
│   ├── Ban / Shadowban Panel
│   ├── Appeal Workflow
│   └── Allow / Block Lists
│
├── 📊 Analytics [MOD-005]
│   ├── User Metrics (DAU/WAU/MAU, Retention)
│   ├── Content Metrics (Post volume, Temperature)
│   ├── Economy Metrics (Token flow, Gold circulation)
│   ├── Prediction Metrics (Accuracy, Volume, Revenue)
│   └── Funnel & Engagement
│
├── ⚡ System Health [MOD-006]
│   ├── API Performance
│   ├── Sync Status (Betman, Crawler)
│   ├── Job Monitor (Cron, Queue)
│   ├── Database Metrics
│   └── Error Tracker
│
├── 🤖 AI Control [MOD-007]
│   ├── Crawler Configuration
│   ├── AI Summarizer Control
│   ├── Prompt Versioning
│   ├── Token Usage Tracker
│   └── Model Toggle
│
└── 🔒 Security & RBAC [MOD-008]
    ├── Admin User Management
    ├── Role & Permission Editor
    ├── Audit Log Viewer
    ├── Session Management
    └── API Key Control
```

---

## ADMIN-MODULES

---

### MOD-001: User Ops

**목적**: 유저 라이프사이클 전체를 관리하고 이상 행위를 탐지/대응하는 중앙 허브. Stripe의 Customer Detail + Discord의 Member Management 패턴 적용.

**실제 Admin 화면 구성**:

#### 1-1. User Directory

| 구성요소 | 설명 |
|---------|------|
| **검색바** | user_id, nickname, email (Clerk) 통합 검색 |
| **필터 패널** | role (admin/moderator/user), is_artist, is_expert, commission_status, 가입일 범위, temperature 범위 |
| **유저 테이블** | nickname, role, temperature, total_points, gold_balance, token_balance, prediction accuracy, 가입일, 최종활동일 |
| **Bulk Actions** | 다중 선택 → 역할 변경, 경고 발송, ban 처리 |
| **Quick Stats Bar** | 전체 유저 수, 오늘 신규, 활성 유저, ban 상태 유저 수 |

**DB 연동**: `profiles` JOIN `user_prediction_stats` JOIN `user_tokens` JOIN `user_gold`

#### 1-2. User Detail Page

```
User Detail Layout:
├── Header: Avatar + Nickname + Role Badge + Status Indicator
├── Tab: Overview
│   ├── Profile Info (from profiles table)
│   ├── Clerk Auth Info (external API)
│   ├── Temperature Gauge (36.5 기본, 실시간)
│   ├── Account Timeline (가입 → 첫 글 → 첫 예측 → ...)
│   └── Risk Score Card
├── Tab: Economy
│   ├── Token Balance + Transaction History (token_transactions)
│   ├── Gold Balance + Transaction History (gold_transactions)
│   ├── Manual Adjustment Form (+ admin_adjustment reason 필수)
│   └── Prediction Stats (betman_user_sport_stats)
├── Tab: Content
│   ├── Posts by User (posts WHERE user_id = ?)
│   ├── Comments by User (comments WHERE user_id = ?)
│   └── Reports Against User
├── Tab: Activity
│   ├── Login History (Clerk sessions)
│   ├── Prediction History (betman_predictions)
│   └── Commission Orders (commission_orders)
├── Tab: Sanctions
│   ├── Active Sanctions (ban, shadowban, timeout)
│   ├── Sanction History
│   └── New Sanction Form
└── Sidebar: Quick Actions
    ├── Send Notification
    ├── Adjust Token/Gold
    ├── Change Role
    ├── Shadowban Toggle
    └── Full Ban
```

#### 1-3. Risk & Trust Scoring

**Stripe Radar 패턴 적용** — ML 기반 risk score 0-100

| Signal | Weight | Source |
|--------|--------|--------|
| 계정 나이 | 15% | `profiles.created_at` |
| 예측 패턴 이상 (동일 선택 반복) | 20% | `betman_predictions` 분석 |
| 신고 접수 횟수 | 20% | reports (신규 테이블) |
| 투표 조작 의심 (동일 IP 다수 계정) | 15% | `post_views.ip_hash` 패턴 |
| Token/Gold 비정상 패턴 | 15% | `token_transactions`, `gold_transactions` |
| 콘텐츠 삭제 빈도 | 15% | `posts.deleted_at`, `comments.deleted_at` |

**운영 시나리오**:
- 신규 유저가 24시간 내 50건 이상 예측 → Risk Score 급상승 → 자동 flag → Review Queue 진입
- Admin이 Gold 수동 조정 시 → `admin_audit_logs`에 기록 + `gold_transactions.transaction_type = 'admin_adjustment'`
- Shadowban 유저: 본인은 정상 사용 가능하나 다른 유저에게 콘텐츠 비노출

**위험 요소**:
- Clerk와 Supabase profiles 간 동기화 누락 시 유령 계정 발생
- Gold 수동 조정 남용 → 반드시 사유 입력 + 이중 승인(moderator+admin) 필요
- Temperature 조작 → scoring_config 변경 시 전체 재계산 트리거 필요

**Supabase 연동**:
- `profiles` 테이블 role 컬럼 이미 `admin/moderator/user` check constraint 존재
- `admin_audit_logs` 테이블 이미 생성됨 → 모든 User Ops 액션 기록
- `user_tokens`, `user_gold` FK로 profiles 연결 완료

**확장 아이디어**:
- 유저 세그먼트 태그 시스템 (whale, content_creator, prediction_expert)
- 자동 등급 승격 (예측 적중률 70%+ 유지 100경기 → expert 자동 인증)
- 유저 간 관계 그래프 (팔로우 네트워크 시각화, 조직적 어뷰징 탐지)

---

### MOD-002: Content Ops

**목적**: 커뮤니티 콘텐츠의 생산-유통-소비 전 과정을 관리. Discord AutoMod + GitHub Moderation 패턴 적용.

**실제 Admin 화면 구성**:

#### 2-1. Post Management

| 구성요소 | 설명 |
|---------|------|
| **게시글 테이블** | title, author, category, community_slug, temperature, view_count, vote_count, comment_count, created_at, status |
| **필터** | category_id (9개 카테고리), community_slug, is_notice, date range, temperature range, deleted 여부 |
| **정렬** | temperature DESC, created_at DESC, view_count DESC |
| **행 액션** | 삭제, 공지 설정/해제, 카테고리 변경, 작성자 페이지 이동 |
| **Bulk Actions** | 다중 삭제, 카테고리 일괄 변경 |

**DB 연동**: `posts` JOIN `categories` + `profiles`

#### 2-2. Report Queue (신규 필요)

```
Report Queue Layout:
├── Priority View (High → Medium → Low)
│   ├── Report Card
│   │   ├── 신고 대상 (post/comment 미리보기)
│   │   ├── 신고 사유 (spam, hate, misinformation, etc.)
│   │   ├── 신고자 정보 + 신뢰도
│   │   ├── 대상자 Risk Score
│   │   └── 이전 신고 이력
│   └── Action Buttons
│       ├── Dismiss (허위 신고)
│       ├── Warn Author
│       ├── Delete Content
│       ├── Timeout Author (1h / 24h / 7d / 30d)
│       └── Ban Author
├── SLA Tracker (응답 시간 목표: Critical 1h, High 4h, Medium 24h)
└── Stats: 미처리 건수, 오늘 처리 건수, 평균 처리 시간
```

**신규 테이블 필요**: `content_reports` (reporter_id, target_type, target_id, reason, status, assigned_to, resolved_at, resolution)

#### 2-3. News Ticker Control

| 구성요소 | 설명 |
|---------|------|
| **Ticker Items 테이블** | headline_kr, community_slug, source_id, importance, ticker_tag, category, posted_at |
| **Crawler Status** | `crawler_run_log` 최근 실행 상태, items_fetched/saved, error_message |
| **수동 등록 폼** | headline_kr, summary_kr, link_url, community_slug, importance, ticker_tag |
| **편집/삭제** | 인라인 편집, 긴급 삭제 (부적절 뉴스) |
| **Importance 조정** | 1-5 스케일 드래그 조정 |

**DB 연동**: `news_ticker_items` + `crawler_run_log`

#### 2-4. Community Board Config

| 구성요소 | 설명 |
|---------|------|
| **카테고리 관리** | name, slug, icon, sort_order, is_active, description 편집 |
| **순서 변경** | Drag-and-drop 정렬 |
| **활성화 토글** | is_active 즉시 반영 |
| **새 카테고리 생성** | slug 중복 검사 + 아이콘 선택기 |

**DB 연동**: `categories` 테이블 (현재 9개 row)

**운영 시나리오**:
- 특정 커뮤니티에서 스팸 급증 → Report Queue에서 패턴 확인 → AutoMod 룰 추가 → 해당 community_slug 필터링 강화
- 크롤러 장애 시 → Crawler Status에서 에러 확인 → 수동으로 중요 뉴스 등록 → 크롤러 복구 후 자동 재개
- 부적절 뉴스 유입 시 → Ticker Control에서 즉시 삭제 + 해당 source_id 블랙리스트 추가

**위험 요소**:
- Soft delete (deleted_at)와 실제 삭제 혼용 → 정책 일관성 필요
- Temperature 점수 조작 (scoring_config 변경 시 전체 게시글 영향)
- 크롤러 장기 장애 시 뉴스 공백 → 수동 운영 프로세스 필요

**Supabase 연동**:
- `posts.deleted_at` → soft delete 패턴 이미 구현
- `categories.is_active` → 보드 활성화/비활성화 지원
- `scoring_config` → temperature 공식 파라미터 실시간 변경 가능

**확장 아이디어**:
- AI 기반 콘텐츠 품질 점수 (자동 추천/비추천 후보)
- 자동 번역 파이프라인 (영문 뉴스 → 한국어 요약, 현재 부분 구현)
- 콘텐츠 트렌드 히트맵 (시간대별/카테고리별 활동량)

---

### MOD-003: Game Economy

**목적**: 이중 통화 시스템(Token/Gold) + 예측 게임 + 커미션 마켓의 경제 무결성 보장. Stripe Payments/Disputes 패턴 적용.

**실제 Admin 화면 구성**:

#### 3-1. Betman Round Management

```
Round Control Panel:
├── Active Rounds Table
│   ├── betman_rounds: year, round, deadline, status (open/closed/settled)
│   ├── betman_daily_rounds: daily_id, status, bet_open_at, bet_close_at, game_count
│   └── Each Round → 하위 Games 펼치기
├── Sync Status Card
│   ├── betman_sync_state: latest_gm_ts, last_checked_at, last_sync_action
│   ├── last_sync_games_count
│   ├── last_error (빨간 배지)
│   └── Manual Sync Trigger 버튼
├── Round Actions
│   ├── Force Close Round (마감 시간 전 강제 종료)
│   ├── Reopen Round (오류 시 재개방)
│   ├── Settle Round (결과 확정 + 포인트 정산)
│   └── Create Daily Round (수동 생성)
└── Settlement Queue
    ├── Unsettled games list
    ├── Result 입력/수정 폼 (home/draw/away/over/under/cancelled)
    └── Bulk Settlement (결과 일괄 확정)
```

**DB 연동**: `betman_rounds` + `betman_daily_rounds` + `betman_games` + `betman_sync_state`

#### 3-2. Prediction Audit

| 구성요소 | 설명 |
|---------|------|
| **Predictions 테이블** | user_id, game_id, prediction, is_correct, points_earned, status, round_id |
| **필터** | round, sport, status (pending/settled/cancelled), user_id |
| **이상 탐지 뷰** | 동일 유저 과다 예측, 마감 직전 몰아치기, 적중률 비정상 패턴 |
| **Settlement Override** | 오류 정산 수동 교정 (is_correct 변경 + points 재계산) |
| **Sport Stats** | `betman_user_sport_stats` 종목별 통계 조회 |

**DB 연동**: `betman_predictions` + `betman_user_sport_stats` + `prediction_activities`

#### 3-3. Token / Gold Ledger

```
Economy Dashboard:
├── Summary Cards
│   ├── Total Token Supply (SUM of user_tokens.token_balance)
│   ├── Total Gold Supply (SUM of user_gold.gold_balance)
│   ├── Today's Token Resets (daily_reset transactions)
│   ├── Today's Gold Movement (purchases + rewards)
│   └── Escrow Locked Gold (SUM from commission_escrow WHERE action='hold')
├── Token Transaction Log
│   ├── Table: user, type, amount, balance_after, description, created_at
│   ├── Filter: transaction_type (daily_reset, prediction_spent, reward_earned, admin_adjustment, refund)
│   └── Trend Chart: 일별 Token 발행/소비량
├── Gold Transaction Log
│   ├── Table: user, type, amount, balance_after, description, created_at
│   ├── Filter: transaction_type (purchase, prediction_purchase, reward, admin_adjustment, commission_*)
│   └── Trend Chart: 일별 Gold 유통량
└── Economy Health Indicators
    ├── Token Inflation Rate (발행 vs 소비 비율)
    ├── Gold Velocity (거래 회전율)
    ├── Gini Coefficient (Gold 편중도)
    └── Top 10 Holders (whale 모니터링)
```

**DB 연동**: `user_tokens` + `token_transactions` + `user_gold` + `gold_transactions` + `commission_escrow`

#### 3-4. Commission & Escrow

| 구성요소 | 설명 |
|---------|------|
| **Orders 테이블** | order_number, client/artist, status, price_gold, escrow_held, deadline |
| **필터** | status (pending→accepted→in_progress→review→completed/cancelled) |
| **Order Detail** | 전체 milestone 진행, messages, escrow 트랜잭션 히스토리 |
| **Dispute Resolution** | 분쟁 시 Admin 강제 결정 (escrow release/refund) |
| **Artist Dashboard** | commission_packages 관리, 슬롯 현황, 수익 통계 |

**DB 연동**: `commission_orders` + `commission_packages` + `commission_milestones` + `commission_messages` + `commission_escrow`

#### 3-5. Quiz & Casting Management

| 구성요소 | 설명 |
|---------|------|
| **Quiz Editor** | movie_quizzes CRUD, difficulty/category/points 설정, is_active 토글 |
| **Quiz Stats** | movie_quiz_results 정답률, 평균 소요시간 |
| **Casting Manager** | virtual_castings 목록, 제안/투표 현황 |
| **Bulk Import** | Quiz CSV 일괄 등록 |

**DB 연동**: `movie_quizzes` + `movie_quiz_results` + `virtual_castings` + `virtual_casting_suggestions` + `virtual_casting_votes`

**운영 시나리오**:
- Betman VPS 동기화 실패 → Sync Status 빨간 알림 → 에러 로그 확인 → Manual Sync 또는 VPS SSH
- 유저가 결과 오류 항의 → Prediction Audit에서 해당 game 조회 → Result Override → 포인트 재정산
- Gold 인플레이션 감지 → Economy Dashboard에서 발행량 확인 → Token/Gold 파라미터 조정
- Commission 분쟁 → Order Detail에서 양측 메시지 확인 → Admin 최종 결정 (escrow release 또는 refund)

**위험 요소**:
- Settlement 오류 시 포인트 재계산 cascade 복잡성 (betman_predictions → betman_user_sport_stats → user_prediction_stats)
- Escrow 잠금 Gold가 유통에서 빠지면서 유동성 부족 가능
- Betman sync 장애 시 5일 데이터 공백 (과거 이력 참조)
- 23:00 KST daily round reset 시스템과 수동 라운드 관리 충돌 가능

**Supabase 연동**:
- `betman_sync_state` — 동기화 상태 실시간 조회
- `gold_transactions.transaction_type` — commission_escrow_hold/release/refund 이미 enum 포함
- `betman_games.status` — scheduled/in_progress/completed/cancelled/postponed 상태 전이

**확장 아이디어**:
- 경제 시뮬레이터 (파라미터 변경 시 Token/Gold 흐름 예측)
- 자동 Settlement 파이프라인 (경기 종료 → 결과 확정 → 포인트 자동 정산)
- Season/League 기반 이벤트 경제 (prediction_seasons 활용)
- Commission marketplace analytics (인기 패키지, 가격대 분석, 아티스트 수익 순위)

---

### MOD-004: Moderation

**목적**: 콘텐츠 및 유저 행위에 대한 사전 예방 + 사후 대응 체계. Discord AutoMod + Stripe Radar Rule Engine 패턴 적용.

**실제 Admin 화면 구성**:

#### 4-1. AutoMod Rule Engine

```
Rule Engine Architecture:
├── Rule List (우선순위 순)
│   ├── Rule Card
│   │   ├── Name + Description
│   │   ├── Status Toggle (active/inactive)
│   │   ├── Trigger: IF [condition]
│   │   │   ├── Keyword match (정규식 지원)
│   │   │   ├── Spam pattern (동일 내용 반복)
│   │   │   ├── Link spam (외부 링크 과다)
│   │   │   ├── User risk score > threshold
│   │   │   ├── Account age < threshold
│   │   │   └── Prediction pattern anomaly
│   │   ├── Action: THEN [consequence]
│   │   │   ├── Block content (즉시 숨김)
│   │   │   ├── Flag for review (Review Queue 진입)
│   │   │   ├── Alert moderator (Slack/Discord webhook)
│   │   │   ├── Timeout user (duration 설정)
│   │   │   ├── Reduce temperature (콘텐츠 노출 감소)
│   │   │   └── Shadowban
│   │   └── Stats: 지난 7일 발동 횟수
│   └── Rule Priority (drag-and-drop 순서 변경)
├── Rule Builder (IF-THEN visual editor)
│   ├── Condition Groups (AND/OR 조합)
│   ├── Action Chain (다중 액션)
│   └── Test Mode (시뮬레이션)
└── Preset Rules
    ├── Anti-Spam (기본 제공)
    ├── Profanity Filter (한국어/영어)
    ├── Link Whitelist (허용 도메인만)
    └── New Account Restriction (가입 후 N시간 제한)
```

**신규 테이블 필요**: `automod_rules` (name, conditions JSON, actions JSON, priority, is_active, trigger_count, created_by)

#### 4-2. ML Flag Review Queue

| 구성요소 | 설명 |
|---------|------|
| **Queue View** | AutoMod/ML에 의해 flag된 항목 목록 |
| **Priority Sorting** | risk_score DESC, report_count DESC |
| **Review Card** | 원본 콘텐츠 + 매칭된 룰 + 유저 히스토리 + Risk Score |
| **Actions** | Approve (오탐 해제), Confirm (제재 확정), Escalate (상위 관리자) |
| **Bulk Review** | 유사 패턴 일괄 처리 |
| **SLA Dashboard** | 처리 대기 시간, 처리율, 오탐률 |

#### 4-3. Ban / Shadowban Panel

```
Ban Management:
├── Active Bans Table
│   ├── User, Ban Type, Reason, Issued By, Expires At
│   ├── Type: full_ban | shadowban | timeout | content_restrict
│   └── Actions: Lift Ban, Extend, Convert Type
├── Ban Form
│   ├── Target User (search)
│   ├── Ban Type selector
│   ├── Duration (1h, 24h, 7d, 30d, permanent)
│   ├── Reason (필수)
│   ├── Evidence Links
│   └── Internal Note
└── Ban History (all time)
    ├── Filter by user, type, issuer, date
    └── Export CSV
```

**신규 테이블 필요**: `user_sanctions` (user_id, type, reason, issued_by, evidence, starts_at, expires_at, lifted_at, lifted_by)

#### 4-4. Appeal Workflow

| 단계 | 설명 |
|------|------|
| 1. 유저 이의 제기 | 제재 사유 확인 + 이의 폼 제출 |
| 2. 자동 접수 | appeal_tickets 생성, 담당자 자동 배정 |
| 3. 검토 | 원본 증거 + 유저 이력 + 제재 사유 종합 검토 |
| 4. 결정 | 유지 / 감경 / 해제 + 사유 기록 |
| 5. 통보 | 유저에게 결과 notification 발송 |

**운영 시나리오**:
- 스팸봇 대량 가입 → AutoMod "Account age < 1h + 3건 이상 동일 내용" 룰 발동 → 자동 Block + Alert
- 유저 간 욕설 분쟁 → Report Queue → Review Card에서 대화 맥락 확인 → 양측 Timeout
- Shadowban 유저가 활동 지속하되 영향력 없음 → 일정 기간 후 행동 개선 시 자동 해제

**위험 요소**:
- 오탐(false positive)으로 선의의 유저 피해 → Review Queue 응답 SLA 필수
- Shadowban 감지 시 커뮤니티 신뢰도 하락 → 투명한 정책 문서 필요
- 한국어 비속어 변형 (초성, 숫자 치환) 필터링 난이도 높음

**Supabase 연동**:
- `admin_audit_logs` — 모든 제재 액션 기록
- `profiles.role` — moderator가 기본 모더레이션 수행
- `comment_cooldowns` — 이미 구현된 코멘트 쿨다운 활용 가능

**확장 아이디어**:
- AI 기반 한국어 독성 탐지 모델 (KoBERT fine-tuning)
- 커뮤니티 자치 시스템 (신뢰도 높은 유저에게 제한적 모더레이션 권한)
- 신고 신뢰도 점수 (신고 적중률 높은 유저의 신고 우선 처리)

---

### MOD-005: Analytics

**목적**: 서비스 전체 지표를 실시간으로 파악하고 의사결정을 지원. Vercel Analytics + Firebase Analytics + Stripe Sigma 패턴 적용.

**실제 Admin 화면 구성**:

#### 5-1. User Metrics

```
User Analytics Dashboard:
├── KPI Cards
│   ├── DAU / WAU / MAU (with trend arrow %)
│   ├── New Signups (today / 7d / 30d)
│   ├── Retention Rate (D1, D7, D30)
│   └── Churn Rate
├── Charts
│   ├── User Growth (time-series, stacked: new vs returning)
│   ├── Cohort Retention Heatmap
│   ├── User Segmentation Pie (by role, activity level)
│   └── Geographic Distribution (if available)
└── Tables
    ├── Top Active Users (by posts + predictions + comments)
    ├── At-Risk Users (activity declining)
    └── New User Conversion Funnel (signup → first action → retained)
```

#### 5-2. Content Metrics

| 지표 | 소스 | 설명 |
|------|------|------|
| Daily Post Volume | `posts.created_at` | 일별 게시글 수 |
| Avg Temperature | `posts.temperature` | 평균 온도 트렌드 |
| Comment Ratio | `posts.comment_count / post count` | 참여율 |
| Top Categories | `categories` + post count | 인기 게시판 |
| View Unique Rate | `posts.view_count_unique / view_count` | 실질 노출 |
| Ticker Engagement | `news_ticker_items` click-through | 뉴스 관심도 |

#### 5-3. Economy Metrics

```
Economy Dashboard:
├── Token Economy
│   ├── Daily Token Issue (daily_reset count × 10)
│   ├── Daily Token Burn (prediction_spent)
│   ├── Net Token Flow (issue - burn)
│   └── Token Velocity (transactions / supply)
├── Gold Economy
│   ├── Gold Circulation (total supply trend)
│   ├── Gold Concentration (Gini coefficient)
│   ├── Revenue Streams (prediction_purchase, commission_fee)
│   └── Escrow Lock Rate (locked / total)
├── Prediction Economy
│   ├── Daily Prediction Volume
│   ├── Avg Accuracy (전체, 종목별)
│   ├── Popular Sports (축구, 농구, 야구, 배구, 하키)
│   └── Odds Distribution (home/draw/away 선택 비율)
└── Commission Economy
    ├── Active Orders
    ├── Avg Order Value
    ├── Completion Rate
    └── Dispute Rate
```

#### 5-4. Funnel & Engagement

| Funnel Stage | Metric | Target |
|-------------|--------|--------|
| Visit → Signup | Conversion Rate | > 15% |
| Signup → First Post | Activation Rate | > 30% |
| Signup → First Prediction | Game Activation | > 40% |
| D1 → D7 Return | Short Retention | > 50% |
| D7 → D30 Return | Long Retention | > 25% |
| Free → Gold Purchase | Monetization | > 5% |

**운영 시나리오**:
- DAU 급감 감지 → User Metrics에서 이탈 세그먼트 확인 → Content Metrics에서 콘텐츠 공백 확인 → 원인 파악 (크롤러 장애? 이벤트 종료?)
- Gold 인플레이션 → Economy Dashboard에서 발행/소각 비율 확인 → Token 파라미터 조정

**위험 요소**:
- Supabase 무료 티어 Analytics 쿼리 부하 → Materialized View 또는 별도 analytics 스키마 필요
- 실시간 집계 vs 배치 집계 트레이드오프

**Supabase 연동**:
- 대부분 기존 테이블에서 집계 쿼리로 도출 가능
- `betman_user_sport_stats` — 종목별 통계 이미 집계됨
- `user_prediction_stats` — 유저별 예측 통계 이미 집계됨

**확장 아이디어**:
- SQL 에디터 (Stripe Sigma 패턴) — Admin이 직접 ad-hoc 쿼리 실행
- 자동 리포트 생성 (주간/월간 PDF 리포트 이메일 발송)
- A/B 테스트 대시보드 (Feature Flag와 연동)
- 실시간 알림 (DAU 20% 이상 감소 시 Slack alert)

---

### MOD-006: System Health

**목적**: 인프라 및 외부 연동 시스템의 상태를 실시간 모니터링하고 장애에 선제 대응. Vercel Logs + Firebase Crashlytics + Supabase Advisors 패턴 적용.

**실제 Admin 화면 구성**:

#### 6-1. System Overview

```
Health Dashboard:
├── Status Cards (Green/Yellow/Red)
│   ├── Vercel App: deployment status, response time
│   ├── Supabase DB: connection count, disk usage, cache hit ratio
│   ├── Betman Sync: last_checked_at, last_error
│   ├── News Crawler: crawler_run_log 최근 상태
│   ├── Clerk Auth: API health
│   └── bet365 API: 연동 상태
├── Response Time Chart
│   ├── API endpoint별 latency (p50, p95, p99)
│   ├── DB query time
│   └── External API call time
└── Error Rate Chart
    ├── 4xx errors (client errors)
    ├── 5xx errors (server errors)
    └── Trend comparison (today vs 7d avg)
```

#### 6-2. Sync Status Monitor

| 시스템 | 상태 소스 | 모니터링 항목 |
|--------|----------|-------------|
| **Betman Sync** | `betman_sync_state` | latest_gm_ts, last_error, games_count |
| **News Crawler** | `crawler_run_log` | status, items_fetched/saved, error_message |
| **Daily Round Reset** | `betman_daily_rounds` | 23:00 KST 리셋 실행 여부 |
| **Temperature Queue** | `temperature_update_queue` | 미처리 건수, 처리 지연 |

```
Sync Detail View:
├── Betman Sync Timeline
│   ├── 최근 24시간 sync 이력 (2시간 간격)
│   ├── 성공/실패 indicator
│   ├── Games synced per run
│   └── VPS Connection Status
├── Crawler Run History
│   ├── source_id별 실행 이력
│   ├── items_fetched vs items_saved ratio
│   └── 평균 실행 시간
└── Alert Rules
    ├── Sync 2회 연속 실패 → Critical Alert
    ├── Crawler 4시간 이상 미실행 → Warning
    └── Temperature Queue > 100 미처리 → Warning
```

#### 6-3. Job Monitor

| 구성요소 | 설명 |
|---------|------|
| **Cron Jobs Table** | Job name, schedule, last_run, next_run, status, duration |
| **Job History** | 실행 이력, 성공/실패율, 평균 실행 시간 |
| **Manual Trigger** | 개별 job 수동 실행 버튼 |
| **Error Detail** | 실패 시 stack trace, context 정보 |

**운영 시나리오**:
- Betman sync 5일 중단 (과거 장애 이력 참조) → Sync Status 빨간색 → 즉시 Alert → VPS SSH 접속 → 수동 복구
- Temperature Queue 적체 → 게시글 정렬 이상 → Queue 모니터에서 감지 → 원인 파악 (DB 부하? 함수 오류?)
- API latency 급증 → Response Time Chart에서 특정 endpoint 식별 → 쿼리 최적화 또는 캐시 적용

**위험 요소**:
- Vultr VPS 접근 불가 시 Betman sync 완전 중단 → VPS 이중화 또는 알림 필수
- Supabase free tier rate limit → 모니터링 쿼리 자체가 부하 원인 될 수 있음
- 외부 API (bet365, Clerk) 장애 시 자체 서비스 영향 범위 파악 어려움

**Supabase 연동**:
- `betman_sync_state` — 1개 row, 실시간 상태 반영
- `crawler_run_log` — 60건 이력 존재, 상태 추적 가능
- `temperature_update_queue` — processed_at NULL인 건수로 적체 판단
- Supabase Advisors API — security/performance 자동 감사

**확장 아이디어**:
- Uptime Status Page (공개용 서비스 상태 페이지)
- Incident Management (장애 발생 → 타임라인 기록 → 사후 분석 → Postmortem)
- Alert Escalation (Warning → Slack, Critical → SMS/Phone)
- Health Score 종합 지수 (0-100, 가중 합산)

---

### MOD-007: AI Control

**목적**: AI/봇 파이프라인의 품질과 비용을 관리. Firebase Remote Config + Vercel Feature Flags 패턴 적용.

**실제 Admin 화면 구성**:

#### 7-1. Crawler Configuration

```
Crawler Config Panel:
├── Source Management
│   ├── Source List (reddit subreddits per community_slug)
│   ├── Source Config: subreddit, fetch_limit, schedule, is_active
│   ├── Add New Source
│   └── Disable/Enable Source
├── Summarizer Config
│   ├── Active Model (GPT-4o-mini, etc.)
│   ├── Prompt Template (versioned)
│   ├── Max Token per Summary
│   ├── Temperature (LLM param)
│   └── Language Target (ko)
├── Quality Checks
│   ├── Recent Summaries Review (original → summary 비교)
│   ├── Quality Score (자동 평가)
│   └── Flag Bad Summaries
└── Run Control
    ├── Manual Crawl Trigger (source별)
    ├── Pause All Crawlers
    └── Schedule Editor (cron expression)
```

**DB 연동**: `news_ticker_items` (output), `crawler_run_log` (execution log)

#### 7-2. Prompt Versioning

| 구성요소 | 설명 |
|---------|------|
| **Prompt Registry** | 시스템 내 모든 AI prompt 목록 (뉴스 요약, 퀴즈 생성, etc.) |
| **Version History** | 각 prompt의 버전 이력, diff 비교 |
| **Active Version** | 현재 운영 중인 버전 표시 |
| **A/B Test** | 두 버전 동시 운영, 결과 비교 |
| **Rollback** | 이전 버전으로 즉시 복원 |

**신규 테이블 필요**: `ai_prompts` (name, version, content, is_active, created_by, created_at)

#### 7-3. Token Usage Tracker

```
AI Cost Dashboard:
├── Monthly Cost Trend (API 호출 비용)
├── Per-Feature Breakdown
│   ├── News Summarizer: calls, tokens_in, tokens_out, cost
│   ├── Quiz Generator: calls, tokens, cost
│   └── Other AI features
├── Daily Usage Chart
├── Budget Alert Settings (threshold → alert)
└── Cost Optimization Suggestions
```

**신규 테이블 필요**: `ai_usage_logs` (feature, model, tokens_input, tokens_output, cost_usd, created_at)

#### 7-4. Model Toggle

| 기능 | 설명 |
|------|------|
| **Model Selector** | 기능별 사용 모델 변경 (GPT-4o → GPT-4o-mini 등) |
| **Fallback Chain** | Primary model 실패 시 fallback 순서 설정 |
| **Rate Limiting** | 분당 최대 호출 수 설정 |
| **Kill Switch** | 전체 AI 기능 즉시 중단 (비용 폭주 시) |

**운영 시나리오**:
- AI 요약 품질 저하 → Prompt 버전 비교 → 이전 버전 rollback
- API 비용 급증 알림 → Token Usage에서 원인 feature 식별 → Model downgrade 또는 Kill Switch
- 새 subreddit 크롤링 추가 → Source Management에서 등록 → 테스트 크롤링 → 품질 확인 후 활성화

**위험 요소**:
- Prompt 변경이 전체 뉴스 품질에 즉시 영향 → Canary 배포 필요
- AI API key 노출 시 비용 폭주 → Rate Limiting + Budget Alert 필수
- 크롤러 VPS와 AI API 호출 위치 불일치 → 네트워크 비용

**Supabase 연동**:
- 신규 테이블로 확장 (ai_prompts, ai_usage_logs)
- `news_ticker_items.summary_kr` — 요약 결과 저장 위치
- Edge Function으로 AI 호출 래핑 가능

**확장 아이디어**:
- AI 품질 자동 평가 파이프라인 (요약 정확도, 환각 탐지)
- 유저 피드백 루프 (나쁜 요약 신고 → 프롬프트 개선 데이터로 활용)
- Multi-model comparison dashboard (동일 입력 → 다수 모델 결과 비교)

---

### MOD-008: Security & RBAC

**목적**: Admin 시스템 자체의 보안과 접근 제어. GitHub Organization Settings + Stripe Team/Roles + Linear Security 패턴 적용.

**실제 Admin 화면 구성**:

#### 8-1. Admin User Management

```
Admin Users Panel:
├── Admin List
│   ├── User, Role, Last Active, Permissions, Status
│   ├── Roles: super_admin, admin, moderator, analyst (read-only)
│   └── Status: active, suspended, invited
├── Invite Admin
│   ├── Email (Clerk ID 연동)
│   ├── Role Assignment
│   ├── Module Access Selection (체크박스)
│   └── Expiration (초대 유효기간)
├── Admin Detail
│   ├── Activity Summary (최근 액션)
│   ├── Permission Matrix
│   ├── Session History
│   └── Assigned Moderation Queue
└── Quick Actions
    ├── Suspend Admin
    ├── Change Role
    └── Revoke All Sessions
```

#### 8-2. Role & Permission Editor

```
RBAC Matrix:
                        super_admin  admin  moderator  analyst
User Ops: View              ✅        ✅      ✅        ✅
User Ops: Edit              ✅        ✅      ✅        ❌
User Ops: Ban               ✅        ✅      ✅        ❌
User Ops: Gold Adjust       ✅        ✅      ❌        ❌
Content Ops: View           ✅        ✅      ✅        ✅
Content Ops: Delete         ✅        ✅      ✅        ❌
Content Ops: Config         ✅        ✅      ❌        ❌
Game Economy: View          ✅        ✅      ✅        ✅
Game Economy: Settlement    ✅        ✅      ❌        ❌
Game Economy: Override      ✅        ❌      ❌        ❌
Moderation: Review          ✅        ✅      ✅        ❌
Moderation: Rules           ✅        ✅      ❌        ❌
Analytics: View             ✅        ✅      ✅        ✅
Analytics: Export           ✅        ✅      ❌        ✅
System Health: View         ✅        ✅      ❌        ✅
System Health: Control      ✅        ❌      ❌        ❌
AI Control: View            ✅        ✅      ❌        ✅
AI Control: Config          ✅        ❌      ❌        ❌
Security: View              ✅        ✅      ❌        ❌
Security: Manage            ✅        ❌      ❌        ❌
```

#### 8-3. Audit Log Viewer

```
Audit Log (admin_audit_logs 확장):
├── Log Table
│   ├── timestamp, admin_user_id, action, target_type, target_id, details, ip_address
│   ├── 필터: action type, admin, target type, date range
│   ├── 검색: target_id, description keyword
│   └── 정렬: created_at DESC (기본)
├── Log Detail
│   ├── Before/After Diff (JSON diff for changes)
│   ├── Related Audit Entries (same session)
│   └── Admin Context (role at time of action)
├── Export
│   ├── CSV Download
│   ├── JSON Download
│   └── Date Range Filter
└── Retention Policy
    ├── 90일 기본 보관
    ├── Critical actions 1년 보관
    └── Auto-archive 설정
```

**DB 연동**: `admin_audit_logs` 이미 존재 (id, admin_user_id, action, target_type, target_id, details JSONB, ip_address, created_at)

#### 8-4. Session Management

| 기능 | 설명 |
|------|------|
| **Active Sessions** | 현재 로그인 중인 Admin 세션 목록 |
| **Session Detail** | IP, User-Agent, Login Time, Last Activity |
| **Force Logout** | 특정 세션 강제 종료 |
| **Kill All** | 특정 Admin의 전체 세션 종료 |
| **Login History** | 로그인 이력 (성공/실패, IP, 시간) |

#### 8-5. API Key Control

| 기능 | 설명 |
|------|------|
| **Key List** | 서비스 내 사용 중인 API Key 목록 (Supabase, Clerk, bet365, OpenAI) |
| **Key Health** | 각 key의 마지막 사용 시간, 에러율 |
| **Rotation Reminder** | Key 만료 예정 알림 |
| **Usage Quota** | Key별 사용량/한도 모니터링 |

**운영 시나리오**:
- 의심스러운 Admin 활동 감지 → Audit Log에서 해당 Admin 액션 필터링 → 세션 강제 종료 → 역할 변경
- 새 운영자 온보딩 → Invite → Role 할당 → Module Access 설정 → 첫 활동 모니터링
- API Key 노출 의심 → Key Control에서 해당 키 확인 → 즉시 rotation → 관련 서비스 재배포

**위험 요소**:
- Admin 계정 탈취 시 전체 시스템 위험 → 2FA 필수, IP whitelist 권장
- Audit Log 삭제/변조 방지 → append-only, Admin도 삭제 불가
- RBAC 설정 오류 시 권한 상승 가능 → 변경 시 이중 승인 필요

**Supabase 연동**:
- `admin_audit_logs` — 이미 존재, details JSONB로 before/after diff 저장 가능
- `profiles.role` — admin/moderator/user 3단계 이미 존재, 확장 필요 (analyst 추가)
- Supabase RLS — Admin 전용 정책으로 테이블별 접근 제어
- Clerk Sessions API — Admin 세션 관리 연동

**확장 아이디어**:
- IP Geofencing (특정 국가/IP 대역만 Admin 접근 허용)
- Login Anomaly Detection (평소와 다른 위치/시간 접속 시 2차 인증)
- Permission Change Audit (역할/권한 변경 이력 별도 추적)
- Break-Glass Protocol (긴급 상황 시 임시 super_admin 권한 부여 → 자동 만료)

---

## ADMIN-WORKFLOWS

### WF-001: Daily Operations Routine

```
09:00 KST — Morning Check
├── Dashboard KPI 확인 (DAU, 신규 가입, 활성 콘텐츠)
├── System Health 확인 (모든 sync 정상?)
├── Betman Sync Status (어젯밤 23:00 리셋 성공?)
├── Report Queue 미처리 건수 확인
└── AI Token Usage 확인 (비용 이상?)

Ongoing — Throughout Day
├── Report Queue 처리 (SLA: Critical 1h, High 4h)
├── AutoMod flag 리뷰
├── 유저 이의 제기 처리
└── 긴급 콘텐츠 삭제 (부적절 뉴스 등)

23:00 KST — Daily Round Reset
├── 자동: Daily Round 생성 + 이전 라운드 마감
├── 확인: Settlement 완료 여부
├── 확인: Token 리셋 정상 실행
└── 확인: Tomorrow's games synced
```

### WF-002: Incident Response

```
Level 1 — Warning (자동 감지)
├── Alert 수신 (Slack/Email)
├── System Health 확인
├── Root Cause 1차 분석
└── 자동 복구 확인 또는 수동 개입

Level 2 — Critical (즉시 대응)
├── Alert 수신 (SMS/Phone)
├── Sync/Crawler Kill Switch 가능
├── VPS SSH 접속 (Betman 관련)
├── Supabase Dashboard 직접 확인
└── Postmortem 작성

Level 3 — Data Integrity (최고 우선도)
├── 경제 시스템 이상 (Gold/Token 무한 생성 등)
├── 모든 관련 기능 즉시 비활성화
├── Transaction Log 분석
├── Manual Correction + Audit Log
└── 유저 공지 + 보상 처리
```

### WF-003: User Sanction Lifecycle

```
Trigger → Investigate → Decide → Execute → Monitor → Appeal
│         │              │         │          │         │
│         ├─ AutoMod     ├─ Warn   ├─ Record  ├─ Track  ├─ Review
│         ├─ Report      ├─ Timeout├─ Notify  ├─ Check  ├─ Decide
│         └─ Risk Score  ├─ Ban    ├─ Audit   └─ Auto   └─ Notify
│                        └─ Shadow    Log        Expire
└─ All actions logged in admin_audit_logs
```

### WF-004: Economy Balancing

```
Monitor → Detect → Analyze → Decide → Execute → Verify
│          │         │          │         │         │
├─ Daily   ├─ Inflation├─ Token  ├─ Param  ├─ Apply  ├─ Economy
│  metrics │  rate     │  flow   │  adjust │  config │  metrics
├─ Whale   ├─ Gini    ├─ User   ├─ Event  ├─ Audit  ├─ User
│  tracking│  shift   │  segments│  plan   │  log    │  feedback
└─ Escrow  └─ Anomaly └─ Compare└─ Team   └─ Notify └─ Rollback
   balance    pattern    history   approve    users     plan
```

---

## 신규 테이블 요약 (Admin 구현 시 필요)

| 테이블 | 용도 | 핵심 컬럼 |
|--------|------|----------|
| `content_reports` | 유저 신고 시스템 | reporter_id, target_type, target_id, reason, status, assigned_to, resolved_at |
| `user_sanctions` | 제재 이력 관리 | user_id, type, reason, issued_by, evidence, starts_at, expires_at |
| `automod_rules` | 자동 모더레이션 룰 | name, conditions (JSONB), actions (JSONB), priority, is_active |
| `ai_prompts` | AI 프롬프트 버전 관리 | name, version, content, is_active, created_by |
| `ai_usage_logs` | AI API 비용 추적 | feature, model, tokens_input, tokens_output, cost_usd |
| `admin_roles` | 확장된 RBAC | role_name, permissions (JSONB), description |
| `alert_rules` | 시스템 알림 규칙 | name, condition, threshold, channels, is_active |

기존 `admin_audit_logs` 테이블은 이미 존재하며 확장 없이 사용 가능 (details JSONB 활용).

---

## 기술 스택 권장

| Layer | 선택 | 근거 |
|-------|------|------|
| **Framework** | Next.js App Router (기존 서비스와 동일) | 코드 공유, 통합 배포 |
| **Admin Route** | `/admin/*` (같은 앱 내) | 별도 앱 불필요, RLS + Clerk role로 접근 제어 |
| **UI** | 기존 컴포넌트 + shadcn/ui data-table | 일관성 유지 |
| **Real-time** | Supabase Realtime (postgres_changes) | Sync status, Queue 업데이트 |
| **Charts** | Recharts (이미 사용 중일 가능성) | 경량, React 네이티브 |
| **Auth Guard** | Clerk middleware + profiles.role check | 이중 인증 |
| **Audit** | DB trigger + `admin_audit_logs` | 누락 방지 |

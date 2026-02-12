# Betman 승부예측 기능 로드맵

> 마지막 업데이트: 2026-02-12

## 현재 완료된 기능
- [x] 경기 데이터 크롤링 (betman-fetch-games.ts)
- [x] 경기 목록 표시 및 예측 등록
- [x] 핸디캡/언오버 기준선 표시
- [x] 베팅 슬립 회차별 그룹화
- [x] GitHub Actions 워크플로우 (경기 수집)

---

## Phase 1: 경기 결과 수집 및 정산 시스템

### 1.1 결과 크롤링 스크립트
- [ ] `scripts/betman-fetch-results.ts` 스크립트 작성
  - [ ] winrstDetl.do 페이지 파싱 (URL: `https://www.betman.co.kr/main/mainPage/gamebuy/winrstDetl.do?gmId=G101&gmTs={gmTs}`)
  - [ ] 경기별 결과(홈스코어, 원정스코어, 승/무/패) 추출
- [ ] `POST /api/betman/results` 엔드포인트 생성
  - [ ] betman_games 테이블 업데이트 (home_score, away_score, result, status='completed')
- [ ] GitHub Actions 워크플로우 추가 (결과 수집용)

### 1.2 예측 정산 로직
- [ ] `/api/betman/settle` 엔드포인트 생성
  - [ ] 완료된 경기의 예측 조회
  - [ ] 예측 vs 실제 결과 비교 로직
    - [ ] 일반: home/draw/away 판정
    - [ ] 핸디캡: 핸디캡 적용 후 판정
    - [ ] 언더오버: 총점 vs 기준선 비교
    - [ ] 홀짝: 총점 홀/짝 판정
  - [ ] betman_predictions.is_correct 업데이트
  - [ ] 포인트 지급 (배당률 * 베팅볼)
- [ ] 자동 정산 트리거 (결과 수집 후 자동 실행)

---

## Phase 2: 사용자 통계 및 랭킹 시스템

### 2.1 통계 계산
- [ ] user_prediction_stats 테이블 생성/업데이트
  - [ ] total_predictions: 총 예측 수
  - [ ] correct_predictions: 적중 수
  - [ ] accuracy: 적중률 (correct / total * 100)
  - [ ] total_wagered: 총 베팅 볼
  - [ ] total_won: 총 획득 볼
  - [ ] profit: 순수익 (won - wagered)
  - [ ] roi: 수익률 ((won - wagered) / wagered * 100)
- [ ] 정산 시 자동 통계 업데이트 트리거
- [ ] `/api/stats/me` 엔드포인트 (내 통계 조회)

### 2.2 랭킹 시스템
- [ ] `/api/rankings` 엔드포인트 개선
  - [ ] 정렬 기준: profit, accuracy, roi
  - [ ] 기간 필터: 전체, 월간, 주간
  - [ ] 종목 필터: 전체, 축구, 농구 등
- [ ] 랭킹 캐싱 (materialized view 또는 Redis)
- [ ] 랭킹 페이지 UI 개선

---

## Phase 3: 전문가 시스템

### 3.1 전문가 등급 부여
- [ ] profiles 테이블에 expert_level 컬럼 추가
  - null: 일반 유저
  - 'bronze': 브론즈 전문가
  - 'silver': 실버 전문가
  - 'gold': 골드 전문가
  - 'diamond': 다이아몬드 전문가
- [ ] 전문가 등급 기준 설정
  - [ ] 최소 예측 수, 적중률, 수익률 기준
- [ ] `/api/admin/experts` 엔드포인트 (관리자용)
  - [ ] 수동 전문가 지정/해제
- [ ] 자동 전문가 승급/강등 로직 (선택사항)

### 3.2 팔로우/언팔로우 시스템
- [ ] user_follows 테이블 확인/수정
  - follower_id, following_id, created_at
- [ ] `/api/follow` 엔드포인트
  - [ ] POST: 팔로우
  - [ ] DELETE: 언팔로우
  - [ ] GET: 팔로우 상태 확인
- [ ] `/api/following` 엔드포인트 (내가 팔로우한 유저 목록)
- [ ] `/api/followers` 엔드포인트 (나를 팔로우한 유저 목록)
- [ ] 전문가 프로필 페이지에 팔로우 버튼 추가

---

## Phase 4: 피드 및 알림 시스템

### 4.1 팔로잉 피드
- [ ] `/api/feed/following` 엔드포인트
  - [ ] 팔로우한 유저의 게시글 조회
  - [ ] 팔로우한 유저의 예측 슬립 조회
  - [ ] 시간순 정렬, 페이지네이션
- [ ] 피드 페이지 UI
  - [ ] 전체 피드 / 팔로잉 피드 탭
- [ ] 실시간 업데이트 (선택사항: Supabase Realtime)

### 4.2 알림 시스템
- [ ] notifications 테이블 확인/수정
  - type: 'new_post', 'new_prediction', 'follow', 'result'
- [ ] 알림 생성 트리거
  - [ ] 팔로우한 전문가가 글 작성 시
  - [ ] 팔로우한 전문가가 예측 등록 시
  - [ ] 내 예측 결과 확정 시
- [ ] `/api/notifications` 엔드포인트
- [ ] 알림 UI (헤더 벨 아이콘)

---

## Phase 5: 결제 및 유료 콘텐츠 시스템

### 5.1 유료 콘텐츠 설정
- [ ] posts 테이블에 is_premium, price 컬럼 추가
- [ ] 전문가 전용: 유료 글 작성 기능
  - [ ] 미리보기 영역 / 유료 영역 구분
- [ ] purchased_content 테이블 확인
  - user_id, content_type, content_id, purchased_at
- [ ] 콘텐츠 잠금 UI (블러 + 구매 버튼)

### 5.2 결제 시스템
- [ ] 골드(인앱 화폐) 충전 시스템
  - [ ] 결제 연동 (토스페이먼츠/카카오페이 등)
  - [ ] token_transactions 테이블 활용
- [ ] `/api/purchase` 엔드포인트
  - [ ] 골드로 콘텐츠 구매
  - [ ] 잔액 차감 + purchased_content 기록
- [ ] 전문가 수익 정산
  - [ ] 판매 수익의 일정 % 전문가에게 지급
- [ ] 구매 내역 페이지

---

## 우선순위 및 예상 작업량

| Phase | 기능 | 우선순위 | 복잡도 | 상태 |
|-------|------|----------|--------|------|
| 1.1 | 결과 크롤링 | 🔴 최우선 | ⭐⭐ | ⬜ 대기 |
| 1.2 | 예측 정산 | 🔴 최우선 | ⭐⭐⭐ | ⬜ 대기 |
| 2.1 | 통계 계산 | 🔴 최우선 | ⭐⭐ | ⬜ 대기 |
| 2.2 | 랭킹 시스템 | 🟠 높음 | ⭐⭐ | ⬜ 대기 |
| 3.1 | 전문가 등급 | 🟠 높음 | ⭐⭐ | ⬜ 대기 |
| 3.2 | 팔로우 시스템 | 🟡 중간 | ⭐⭐ | ⬜ 대기 |
| 4.1 | 팔로잉 피드 | 🟡 중간 | ⭐⭐ | ⬜ 대기 |
| 4.2 | 알림 시스템 | 🟡 중간 | ⭐⭐⭐ | ⬜ 대기 |
| 5.1 | 유료 콘텐츠 | 🟢 낮음 | ⭐⭐ | ⬜ 대기 |
| 5.2 | 결제 시스템 | 🟢 낮음 | ⭐⭐⭐⭐ | ⬜ 대기 |

---

## 참고 URL

- 경기 목록: `https://www.betman.co.kr/main/mainPage/gamebuy/gameSlip.do?gmId=G101&gmTs={gmTs}`
- 경기 결과: `https://www.betman.co.kr/main/mainPage/gamebuy/winrstDetl.do?gmId=G101&gmTs={gmTs}`

## 기술 스택

- Frontend: Next.js 14, React, TailwindCSS
- Backend: Next.js API Routes
- Database: Supabase (PostgreSQL)
- Auth: Clerk
- Scraping: Playwright
- CI/CD: GitHub Actions, Vercel

# 공놀이 운영 매뉴얼

> 최종 업데이트: 2026-03-04

---

## 목차

1. [서비스 개요](#1-서비스-개요)
2. [관리 도구 접속 정보](#2-관리-도구-접속-정보)
3. [관리자 페이지 가이드](#3-관리자-페이지-가이드)
4. [일상 운영 루틴](#4-일상-운영-루틴)
5. [유저 관리](#5-유저-관리)
6. [콘텐츠 관리](#6-콘텐츠-관리)
7. [신고 처리](#7-신고-처리)
8. [승부예측 & 경기 관리](#8-승부예측--경기-관리)
9. [토큰 & 골드 경제](#9-토큰--골드-경제)
10. [커미션 시스템](#10-커미션-시스템)
11. [뉴스 & 티커 관리](#11-뉴스--티커-관리)
12. [장애 대응 가이드](#12-장애-대응-가이드)
13. [자주 하는 작업](#13-자주-하는-작업)
14. [DB 백업 전략](#14-db-백업-전략)
15. [Reddit 시드봇](#15-reddit-시드봇)

---

## 1. 서비스 개요

### 공놀이란?
스포츠 & 문화 커뮤니티 + 승부예측 플랫폼. 유저들이 게시판에서 소통하고, 실제 경기 결과를 예측하며, 전문가 분석을 공유하는 서비스.

### 게시판 구성

| 카테고리 | 슬러그 | 설명 |
|----------|--------|------|
| 축구 | `football` | K리그, EPL, 라리가 등 |
| 야구 | `baseball` | KBO, MLB |
| 농구 | `basketball` | NBA, KBL |
| 배구 | `volleyball` | V리그 |
| 게임 | `game` | PC, 모바일, e스포츠 |
| 영화 | `movies` | 리뷰, 박스오피스 |
| 음악 | `music` | K-POP, 힙합, 인디 |
| 아이돌 | `idol` | 컴백, 팬 콘텐츠 |
| 애니 | `anime` | 애니메이션, 만화 |
| 자유 | `free-board` | 자유 토론, 유머 |

### 사이트 모드

환경변수 `NEXT_PUBLIC_SITE_MODE`로 전환:

| 기능 | Sports 모드 | Culture 모드 |
|------|-------------|-------------|
| 승부예측 (betman) | O | X |
| 토큰(볼) 시스템 | O | X |
| 아트 갤러리 | X | O |
| 커미션 마켓 | X | O |
| 커뮤니티 게시판 | O | O |

### 유저 등급 체계

| 등급 | 설명 | 부여 방법 |
|------|------|-----------|
| **일반 유저** (user) | 기본 등급. 게시글/댓글/예측 가능 | 회원가입 시 자동 |
| **모더레이터** (moderator) | 콘텐츠 관리 권한 | 관리자가 부여 |
| **관리자** (admin) | 전체 관리 기능 접근 | 관리자가 부여 |

| 특수 뱃지 | 설명 | 부여 방법 |
|-----------|------|-----------|
| **전문가** (expert) | 승부예측 전문가. 유료 콘텐츠 작성 가능 | 관리자 수동 부여 또는 자동 인증 |
| **기자** (journalist) | 분석글 작성 가능. 팔로우 대상 | 관리자 수동 부여 |
| **아티스트** (artist) | 커미션 패키지 등록 가능 | 관리자 수동 부여 |

---

## 2. 관리 도구 접속 정보

### 내부 관리자 페이지
- **URL**: `https://[사이트주소]/admin`
- **접근 조건**: Clerk 로그인 + profiles.role = 'admin'
- **기능**: 유저 관리, 콘텐츠 관리, 신고 처리, 경기 관리, 시스템 상태

### 외부 대시보드

| 서비스 | URL | 용도 |
|--------|-----|------|
| **Clerk** | https://dashboard.clerk.com | 유저 인증 관리, 소셜 로그인 설정, 세션 관리 |
| **Supabase** | https://supabase.com/dashboard (ekysrlhdrapmsnrkytif) | DB 직접 조회/수정, 테이블 편집기, RLS 정책 |
| **Vercel** | https://vercel.com | 배포 관리, 크론잡 로그, 환경변수, 함수 로그 |
| **Sentry** | 설정된 경우 | 에러 모니터링, 성능 추적 |

### 자동 작업 (크론잡)

| 작업 | 실행 시간 | 설명 |
|------|-----------|------|
| 일일 토큰 리셋 | 매일 23:00 KST | 모든 유저 토큰을 10볼로 리셋 |
| Betman 싱크 감시 | 매 시간 | VPS 크롤링 상태 확인, 이상 시 경고 |
| 커미션 자동 완료 | 6시간마다 | 검수 기한 지난 주문 자동 완료 처리 |
| Reddit 시드 게시글 | 6시간마다 | r/soccer, r/nba 인기글 → 한국어 번역 후 게시판에 자동 등록 |

> Vultr VPS에서 별도로 2시간마다 betman.co.kr 크롤링 실행 중

---

## 3. 관리자 페이지 가이드

`/admin` 접속 시 표시되는 메뉴 설명:

### 대시보드 (`/admin`)
전체 현황을 한눈에 파악:
- **총 유저 수** / **총 게시글 수** / **총 예측 수**
- **활성 경기 수** (예측 가능한 경기)
- **미처리 신고 수** — 이 숫자가 0이 아니면 신고 처리 필요
- **시스템 상태** — Betman 싱크가 3시간 이상 지연되면 경고 표시

### 사용자 관리 (`/admin/users`)
- 닉네임 검색, 역할별 필터
- 유저 클릭 시 상세 페이지:
  - **개요**: 토큰/골드 잔액, 활동 통계
  - **경제**: 토큰/골드 수동 지급/차감
  - **활동**: 최근 게시글, 예측 수
  - **제재**: 제재 이력 확인

### 게시글 관리 (`/admin/content/posts`)
- 게시판별 필터, 제목 검색
- 삭제된 글 보기/숨기기
- 작업: 삭제, 복구, 공지 고정/해제

### 댓글 관리 (`/admin/content/comments`)
- 내용 검색, 삭제된 댓글 보기
- 작업: 삭제, 복구

### 신고 관리 (`/admin/content/reports`)
- 상태별 필터: 대기/검토중/처리완료/기각
- 처리 방법은 [7. 신고 처리](#7-신고-처리) 참조

### 뉴스 티커 (`/admin/content/ticker`)
- 게시판별 뉴스 목록
- 중요도(1~5) 조정, 삭제

### 카테고리 관리 (`/admin/content/boards`)
- 게시판 이름, 설명, 아이콘, 정렬 순서 수정
- 게시판 활성/비활성 토글

### 경기 관리 (`/admin/matches`)
- 진행 중인 경기 목록, 예측 참여 수 확인

### 전문가 승인 (`/admin/experts`)
- 전문가 인증 부여/취소

### 정산 처리 (`/admin/settlements`)
- 종료된 미정산 경기 목록
- 수동 정산 실행 (예측 결과 반영)

### 토큰 모니터링 (`/admin/tokens`)
- 전체 유저 토큰 잔액 확인 (잔액 높은 순)

### 시스템 상태 (`/admin/system`)
- Betman 싱크: 마지막 동기화 시간, 상태
- 크롤러: 최근 실행 이력
- 일일 라운드: 현재 라운드 번호, 리셋 시간
- 티커 아이템 수

---

## 4. 일상 운영 루틴

### 매일 확인 사항

| 시간 | 작업 | 방법 |
|------|------|------|
| 오전 | 미처리 신고 확인 | `/admin` 대시보드 → 미처리 신고 수 확인 |
| 오전 | 시스템 상태 확인 | `/admin/system` → Betman 싱크 정상 여부 |
| 경기 후 | 정산 처리 | `/admin/settlements` → 종료된 경기 정산 |
| 수시 | 커뮤니티 모니터링 | 각 게시판 최근 글 확인, 도배/부적절 콘텐츠 점검 |

### 주간 확인 사항

| 작업 | 방법 |
|------|------|
| 유저 성장 추이 | `/admin` 대시보드 총 유저 수 기록 |
| 토큰 경제 확인 | `/admin/tokens` → 비정상 잔액 유저 점검 |
| 전문가/기자 신청 검토 | 신청이 있는 경우 `/admin/experts`에서 처리 |
| Vercel 크론잡 로그 확인 | Vercel 대시보드 → Cron 탭 → 실패한 작업 확인 |

---

## 5. 유저 관리

### 유저 역할 변경

1. `/admin/users` 접속
2. 대상 유저 검색 (닉네임)
3. 유저 클릭 → 상세 페이지
4. 역할 변경 버튼 클릭: `user` / `moderator` / `admin`

> 모든 역할 변경은 감사 로그(`admin_audit_logs`)에 기록됩니다.

### 전문가 인증 부여

전문가는 유료 예측 콘텐츠를 작성할 수 있습니다.

**수동 부여:**
1. `/admin/experts` 접속
2. 대상 유저의 인증 토글 ON

**자동 인증 조건** (DB 함수 `auto_certify_experts`):
- 총 예측 10회 이상
- 적중률 70% 이상 **또는** 수익 10,000 이상

### 기자 인증 부여

기자는 분석글을 작성할 수 있고, 다른 유저가 팔로우할 수 있습니다.

1. Clerk 대시보드에서 대상 유저의 `user_id` 확인
2. `/api/admin/users/certify-journalist` API 호출:
   ```
   POST /api/admin/users/certify-journalist
   Body: { "user_id": "user_xxx..." }
   ```
   > 현재 관리자 UI에 기자 인증 메뉴가 없어 API 직접 호출 필요

### 유저 제재

유저 제재는 **신고 처리 시 자동**으로 적용됩니다:
- 신고 "처리완료" 시 카드가 발급됨 (아래 [신고 처리](#7-신고-처리) 참조)
- 옐로카드 2장 누적 → 자동 정지

수동으로 토큰/골드를 차감하려면:
1. `/admin/users` → 대상 유저 → 경제 탭
2. 음수 금액 입력 + 사유 작성 → 차감 실행

---

## 6. 콘텐츠 관리

### 게시글 삭제/복구

1. `/admin/content/posts` 접속
2. 게시판 필터 또는 제목 검색으로 대상 글 찾기
3. **삭제**: 삭제 버튼 클릭 (소프트 삭제 — DB에서 완전 삭제되지 않음)
4. **복구**: "삭제된 글 보기" 체크 → 대상 글의 복구 버튼 클릭

### 공지 게시글 설정

1. `/admin/content/posts`에서 대상 글 찾기
2. 공지 고정/해제 버튼 클릭
3. 고정된 글은 해당 게시판 상단에 고정 표시

### 댓글 삭제/복구

1. `/admin/content/comments` 접속
2. 내용 검색으로 대상 댓글 찾기
3. 삭제 또는 복구 실행

> 모든 콘텐츠 관리 작업은 감사 로그에 기록됩니다.

---

## 7. 신고 처리

### 신고 상태 흐름

```
대기(pending) → 검토중(reviewing) → 처리완료(resolved) 또는 기각(dismissed)
```

### 처리 절차

1. `/admin/content/reports` 접속
2. "대기" 상태 신고 확인
3. **검토 시작**: "검토중"으로 변경 (다른 관리자와 중복 처리 방지)
4. 신고 내용과 대상 콘텐츠 확인
5. 판단:
   - **처리완료 (resolve)**: 신고가 정당한 경우 → 카드 자동 발급
   - **기각 (dismiss)**: 부당 신고인 경우

### 카드 시스템

신고를 "처리완료"하면 신고 사유에 따라 카드가 자동 발급됩니다:

| 신고 사유 | 카드 종류 | 유효 기간 |
|-----------|-----------|-----------|
| 차별/혐오 (discrimination) | 레드카드 | 영구 |
| 광고/홍보 (advertising) | 레드카드 | 영구 |
| 욕설/비속어 (profanity) | 옐로카드 | 1년 |
| 인신공격 (abuse) | 옐로카드 | 1년 |
| 정치 관련 (political) | 옐로카드 | 1년 |

### 자동 정지 규칙

- **옐로카드 2장 이상 누적** → 유저 자동 정지 (`user_suspensions` 테이블에 기록)
- 정지된 유저는 서비스 이용이 제한됩니다
- 레드카드는 자동 정지를 발동하지 않지만 기록에 남습니다

---

## 8. 승부예측 & 경기 관리

### 데이터 흐름

```
betman.co.kr (한국 스포츠토토)
    ↓ (Vultr VPS에서 2시간마다 크롤링)
Supabase (betman_rounds, betman_games)
    ↓
유저가 예측 참여 (1볼 소모)
    ↓
경기 종료 → 결과 크롤링
    ↓
관리자가 정산 실행
    ↓
유저 통계 업데이트
```

### 경기 유형

| 유형 | 설명 | 예측 선택지 |
|------|------|-------------|
| 일반 | 승무패 | 홈승 / 무 / 원정승 |
| 핸디캡 | 핸디캡 적용 | 홈 / 원정 |
| 언더오버 | 총 득점 기준 | 오버 / 언더 |

### 정산 처리

경기가 종료되면 관리자가 수동으로 정산합니다:

1. `/admin/settlements` 접속
2. "종료됨 & 미정산" 경기 목록 확인
3. 대상 경기의 **정산** 버튼 클릭
4. 시스템이 자동으로:
   - 각 예측의 정답 여부 판정
   - 적중 시 배당률만큼 포인트 지급
   - `betman_user_sport_stats` 통계 업데이트

### Betman 싱크 상태 확인

1. `/admin/system` 접속
2. **Betman 싱크** 카드 확인:
   - "정상" = 3시간 이내 동기화됨
   - "지연" = 3시간 이상 경과 → [장애 대응](#12-장애-대응-가이드) 참조

---

## 9. 토큰 & 골드 경제

### 토큰 (볼)

| 항목 | 내용 |
|------|------|
| **기본 지급** | 매일 23:00 KST에 10볼로 리셋 |
| **사용처** | 승부예측 참여 (1볼/건), 유료 예측 콘텐츠 구매 |
| **획득 방법** | 일일 리셋 (자동) |

### 골드

| 항목 | 내용 |
|------|------|
| **사용처** | 커미션 주문, 예측 활동 구매 (500골드) |
| **에스크로** | 커미션 주문 시 골드가 에스크로에 보관 → 완료 시 아티스트에게 지급 |

### 수동 지급/차감

관리자가 유저의 토큰 또는 골드를 직접 조정할 수 있습니다:

1. `/admin/users` → 대상 유저 클릭
2. **경제** 탭 선택
3. 유형 선택 (토큰 / 골드)
4. 금액 입력 (양수 = 지급, 음수 = 차감)
5. 사유 작성 → 실행

> 모든 수동 조정은 `token_transactions` / `gold_transactions`에 `admin_grant` 또는 `admin_deduct`로 기록됩니다.

### 비정상 감지

`/admin/tokens`에서 전체 유저 토큰 잔액을 확인할 수 있습니다.
- 비정상적으로 높은 잔액이 있다면 해당 유저의 거래 내역을 Supabase에서 확인

---

## 10. 커미션 시스템

> Culture 모드에서만 활성화됩니다.

### 개요

아티스트(is_artist)가 커미션 패키지를 등록하면, 일반 유저가 골드로 주문할 수 있습니다.

### 주문 흐름

```
1. 주문 생성 (pending) — 골드가 에스크로에 보관됨
2. 아티스트 수락 (accepted)
3. 작업 진행 (in_progress) — 마일스톤별 제출/승인
4. 검수 (review) — 클라이언트가 결과물 확인
5. 완료 (completed) — 에스크로 골드가 아티스트에게 지급
```

### 자동 완료

`/api/cron/commission-auto-release` 크론이 6시간마다 실행:
- `review` 상태에서 `auto_release_at` 시간이 지난 주문 자동 완료
- 에스크로 골드 자동 해제

### 주문 분쟁

현재 분쟁 해결은 자동화되어 있지 않습니다. 분쟁 발생 시:
1. Supabase에서 해당 `commission_orders` 레코드 확인
2. `commission_messages`에서 대화 내역 확인
3. 필요 시 Supabase에서 직접 주문 상태 변경 또는 에스크로 수동 처리

---

## 11. 뉴스 & 티커 관리

### 뉴스 소스

뉴스는 자동 크롤링으로 수집됩니다:
- **해외 뉴스**: Reddit 20개 서브레딧
- **국내 뉴스**: Naver News API 7개 검색어

### 티커 관리

1. `/admin/content/ticker` 접속
2. 게시판별 필터로 뉴스 확인
3. **중요도 조정** (1~5): 높을수록 티커에서 우선 노출
4. **삭제**: 부적절하거나 오래된 뉴스 제거

---

## 12. 장애 대응 가이드

### Betman 싱크 지연/중단

**증상**: `/admin/system`에서 "지연" 표시 또는 경기 데이터 업데이트 안 됨

**대응 순서**:
1. `/admin/system`에서 마지막 싱크 시간 확인
2. Vultr VPS SSH 접속: `ssh root@[Vultr IP]`
3. 로그 확인: `tail -20 /opt/betman/sync.log`
4. 에러 확인: `ERROR:` 가 포함된 줄 찾기
5. 수동 실행: `bash /opt/betman/sync.sh; echo "종료코드: $?"`
6. cron 상태 확인: `systemctl status cron`
7. cron 로그: `tail -50 /opt/betman/cron.log`

> 참고: Vultr 비밀번호는 Vultr 대시보드 Overview에서 확인

### 유저 로그인 불가

**대응 순서**:
1. Clerk 대시보드에서 해당 유저 검색 (이메일)
2. 세션 상태, 계정 상태(banned/locked) 확인
3. 필요 시 Supabase `profiles` 테이블에서 해당 유저의 `onboarding_completed` 확인

### 크론잡 실패

**대응 순서**:
1. Vercel 대시보드 → Cron 탭에서 실패한 작업 확인
2. Function Logs에서 에러 메시지 확인
3. 일반적 원인:
   - `CRON_SECRET` 환경변수 불일치 → Vercel 환경변수 확인
   - Supabase 연결 오류 → Supabase 상태 페이지 확인
   - 타임아웃 → 함수 실행 시간 확인

### 사이트 접속 불가

**대응 순서**:
1. Vercel 대시보드에서 배포 상태 확인
2. 최근 배포에 빌드 에러가 있는지 확인
3. 이전 배포로 롤백 가능 (Vercel 대시보드 → Deployments → 이전 버전 Promote)

---

## 13. 자주 하는 작업

### 특정 유저의 Clerk ID 찾기

1. Clerk 대시보드 접속
2. Users 메뉴에서 이메일 또는 이름으로 검색
3. User ID (`user_xxx...`) 복사

### 특정 유저의 게시글/댓글 전체 삭제

1. `/admin/content/posts` → 검색 또는 Supabase에서 해당 user_id로 필터
2. 각 글 개별 삭제 처리
3. 댓글도 같은 방식으로 `/admin/content/comments`에서 처리

### 전체 유저에게 토큰 보너스 지급

현재 일괄 지급 기능은 없습니다. 필요 시:
1. Supabase SQL Editor 접속
2. SQL 실행:
   ```sql
   UPDATE user_tokens SET token_balance = token_balance + [지급량];
   INSERT INTO token_transactions (user_id, amount, type, description)
   SELECT user_id, [지급량], 'admin_grant', '이벤트 보너스'
   FROM user_tokens;
   ```

### 게시판 추가/수정

1. `/admin/content/boards` 접속
2. 기존 게시판 수정: 이름, 설명, 아이콘, 정렬, 활성 상태 변경
3. 새 게시판 추가: 현재 관리자 UI에서는 불가 → Supabase `categories` 테이블에 직접 추가 필요

### 경기 결과 수동 입력

Betman 크롤링이 실패한 경우:
1. Supabase `betman_games` 테이블에서 해당 경기 찾기
2. `result` 컬럼에 결과 입력, `status`를 `completed`로 변경
3. `/admin/settlements`에서 정산 실행

### DB 직접 조회 (Supabase)

Supabase 대시보드 → Table Editor 또는 SQL Editor에서 직접 조회 가능.

자주 쓰는 쿼리:
```sql
-- 최근 7일간 가입자 수
SELECT COUNT(*) FROM profiles
WHERE created_at > NOW() - INTERVAL '7 days';

-- 특정 유저의 예측 이력
SELECT * FROM betman_predictions
WHERE user_id = 'user_xxx...'
ORDER BY created_at DESC LIMIT 20;

-- 미처리 신고 목록
SELECT r.*, p.nickname as reporter
FROM content_reports r
JOIN profiles p ON r.user_id = p.user_id
WHERE r.status = 'pending'
ORDER BY r.created_at;

-- 오늘 활성 유저 수 (게시글 또는 댓글 작성)
SELECT COUNT(DISTINCT user_id) FROM (
  SELECT user_id FROM posts WHERE created_at::date = CURRENT_DATE
  UNION
  SELECT user_id FROM comments WHERE created_at::date = CURRENT_DATE
) t;
```

---

## 14. DB 백업 전략

### 현재 상태 (Supabase Pro 플랜)

| 항목 | 내용 |
|------|------|
| **자동 백업** | 매일 1회, 7일간 보관 |
| **복원** | Supabase 대시보드 → Database → Backups에서 특정 날짜로 복원 가능 |
| **PITR** | 미활성화 (필요 시 $100/mo 추가로 초 단위 복원 가능) |

### 백업 확인 방법

1. Supabase 대시보드 접속
2. Database → Backups 메뉴
3. 최근 7일간의 백업 목록 확인
4. 필요 시 Download 버튼으로 `.sql` 다운로드

### 수동 백업이 필요한 시점

- **마이그레이션 실행 전**: 큰 스키마 변경 전에 반드시 수동 백업 다운로드
- **대량 데이터 수정 전**: DELETE, UPDATE 대량 실행 전
- **주간 점검 시**: 로컬에 `.sql` 파일 보관 권장

### 향후 고려사항

| 시점 | 조치 |
|------|------|
| **현재** | Pro 기본 일일 백업으로 충분 |
| **오픈 후 유저 유입** | PITR 활성화 검토 (초 단위 복원 필요 시) |
| **데이터 규모 증가** | pg_dump 자동화 스크립트 + 외부 스토리지(S3 등) 백업 고려 |

---

## 15. Reddit 시드봇

### 개요

AdSense 승인 및 초기 콘텐츠 확보를 위해 Reddit 인기글을 한국어로 번역하여 자동 게시하는 시스템.

### 동작 방식

```
r/soccer, r/nba (Reddit RSS)
    ↓ (6시간마다 cron)
GPT-4o로 한국어 커뮤니티 게시글 생성
    ↓
posts 테이블에 봇 유저로 등록
    ↓
seeded_reddit_posts 테이블에 추적 기록 (중복 방지)
```

### 봇 유저

| 봇 ID | 닉네임 | 게시판 |
|--------|--------|--------|
| `user_bot_soccer_kr` | 풋볼매니아_kr | football |
| `user_bot_nba_kr` | 후프드림즈 | basketball |

### 비용

- GPT-4o: 회당 ~$0.01, 하루 최대 20개 → 월 ~$6

### 수동 실행

```bash
curl -H "Authorization: Bearer [CRON_SECRET]" https://community-app-brown.vercel.app/api/cron/reddit-seed-posts
```

### 트러블슈팅

| 증상 | 원인 | 대응 |
|------|------|------|
| `translate_fail` 에러 | OPENAI_API_KEY 문제 | Vercel 환경변수 확인 후 재배포 |
| `post_insert` 에러 | 봇 프로필 미등록 | migration 035 실행 확인 |
| FUNCTION_INVOCATION_TIMEOUT | 응답 시간 초과 | 정상적으로는 병렬 처리로 ~15초 내 완료. 반복되면 MAX_NEW_PER_SOURCE 줄이기 |
| inserted: 0, skipped 다수 | 이미 시딩된 글 | 정상. 새 인기글이 올라오면 다음 실행에서 등록됨 |

---

## 부록: 감사 로그

모든 관리자 작업은 `admin_audit_logs` 테이블에 자동 기록됩니다.

| 필드 | 설명 |
|------|------|
| `admin_user_id` | 작업 수행한 관리자 |
| `action` | 작업 종류 (change_role, delete_post, resolve_report 등) |
| `target_type` | 대상 유형 (user, post, comment, report 등) |
| `target_id` | 대상 ID |
| `details` | 상세 내용 (JSON) |
| `created_at` | 작업 시간 |

Supabase에서 조회:
```sql
SELECT * FROM admin_audit_logs
ORDER BY created_at DESC LIMIT 50;
```

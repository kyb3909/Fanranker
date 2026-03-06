# 승부예측 시스템 QA 전략

> 베팅 시스템은 한 건의 오판정도 허용할 수 없다.
> 이 문서는 지속적 무결성 검증을 위한 전략을 정의한다.

## 1. 자동 검증 크론 (Vultr)

### 1-1. 정산 정합성 검증 (매일 06:00 KST)

정산된 예측의 `is_correct`가 실제 경기 결과와 일치하는지 교차 검증.

```sql
-- 불일치 탐지 쿼리
SELECT bp.id, bp.prediction, bp.is_correct, bg.result, bg.status
FROM betman_predictions bp
JOIN betman_games bg ON bp.game_id = bg.id
WHERE bp.status = 'settled'
  AND bg.status = 'completed'
  AND bp.is_correct != (bp.prediction = bg.result);
```

**불일치 발견 시**: Sentry alert + Slack 알림 → 즉시 수동 확인.

### 1-2. 통계 정합성 검증 (매일 07:00 KST)

`betman_user_sport_stats`의 값이 raw 데이터에서 재계산한 값과 일치하는지 확인.

검증 항목:
- `correct_predictions` = settled 예측 중 is_correct=true 수
- `wrong_predictions` = settled 예측 중 is_correct=false 수
- `total_wagered` = 해당 유저의 won+lost 슬립 stake 합계
- `total_returns` = won 슬립의 (stake × total_odds) 합계
- `accuracy` = correct / (correct + wrong) × 100

**허용 오차**: 반올림으로 인한 0.01 이내 차이만 허용.

### 1-3. 볼 잔액 검증 (매일 08:00 KST)

`user_tokens.token_balance`가 트랜잭션 이력과 일치하는지 확인.

```sql
-- 잔액 불일치 탐지
SELECT ut.user_id, ut.token_balance,
  COALESCE(SUM(CASE WHEN tt.transaction_type IN ('daily_reset','purchase','refund','admin')
    THEN tt.amount ELSE -tt.amount END), 0) AS calculated_balance
FROM user_tokens ut
LEFT JOIN token_transactions tt ON ut.user_id = tt.user_id
GROUP BY ut.user_id, ut.token_balance
HAVING ut.token_balance != COALESCE(SUM(...), 0);
```

추가 확인:
- `pending_refunds` 테이블에 미처리 건 존재 여부
- 24시간 이상 pending 상태인 환불 건 알림

### 1-4. 만료 예측 정리 (6시간마다)

```bash
curl -s -X POST "$APP_URL/api/betman/expire-pending" \
  -H "Authorization: Bearer $CRON_SECRET"
```

48시간 경과한 pending 예측/슬립 자동 만료 + 환불.

## 2. 실시간 모니터링

### 2-1. Sentry 알림 설정

| 이벤트 | 심각도 | 알림 |
|--------|--------|------|
| 환불 3회 retry 실패 | fatal | 즉시 |
| 자동 정산 예외 발생 | error | 즉시 |
| 결과 업데이트 대상 미발견 | warning | 1시간 집계 |
| spend_tokens RPC 실패 | error | 즉시 |

### 2-2. 핵심 지표 대시보드

일일 모니터링 항목:
- 오늘 베팅 수 / 정산 수 / 미정산 수
- 환불 대기 건수 (pending_refunds)
- 정산 정합성 불일치 건수
- 평균 정산 소요 시간

## 3. 수동 QA 체크리스트 (주 1회)

### 3-1. 베팅 플로우

- [ ] 새 계정으로 가입 → 10볼 지급 확인
- [ ] 경기 선택 → 베팅 → 볼 차감 확인
- [ ] 같은 경기 재베팅 시도 → 에러 확인
- [ ] 경기 시작 후 베팅 시도 → 차단 확인
- [ ] 볼 0일 때 베팅 시도 → 에러 확인

### 3-2. 정산 플로우

- [ ] 결과 반영 후 예측 상태 변경 확인 (pending → settled)
- [ ] 적중/오답 판정 정확성 확인
- [ ] 슬립 상태 변경 확인 (pending → won/lost)
- [ ] 부분 취소 슬립의 배당률 재계산 확인
- [ ] 전체 취소 슬립의 환불 확인

### 3-3. 랭킹 플로우

- [ ] 정산 후 통계 업데이트 확인
- [ ] 정확도 계산 정확성 (취소 제외)
- [ ] 수익률 계산 정확성
- [ ] 내 순위 표시 정확성
- [ ] 종목별 랭킹 필터 동작 확인

## 4. 엣지 케이스 정기 점검 (월 1회)

### 4-1. 동시성 테스트

- 2개 브라우저 탭에서 동시 베팅 → 1건만 성공하는지
- 정산 중 새 베팅 → 정상 처리되는지

### 4-2. 경계값 테스트

- 1볼 베팅 (최소)
- 10볼 베팅 (최대)
- 10경기 조합 베팅 (최대 조합)
- 1경기 단일 베팅

### 4-3. 타이밍 테스트

- 경기 시작 1분 전 베팅
- 자정(KST) 전후 베팅 (일일 리셋 경계)
- 결과 반영 직후 랭킹 조회

## 5. 데이터 무결성 제약조건 현황

### DB 레벨 방어 (migration 047)

| 제약조건 | 대상 | 효과 |
|----------|------|------|
| `idx_unique_user_game_active_prediction` | betman_predictions | 같은 경기 중복 베팅 차단 |
| `chk_slip_total_odds_positive` | prediction_slips | 배당률 0배 슬립 차단 |
| `chk_slip_stake_positive` | prediction_slips | 0볼 베팅 차단 |
| `chk_prediction_locked_odds_non_negative` | betman_predictions | 음수 배당률 차단 |

### 코드 레벨 방어

| 검증 | 파일 | 효과 |
|------|------|------|
| 게임 status 검증 | prediction/route.ts | 진행중/완료 경기 베팅 차단 |
| 배당률 null/0 검증 | prediction/route.ts | 배당 없는 경기 베팅 차단 |
| idempotency key | prediction/route.ts | 중복 제출 방지 |
| 환불 3회 retry | settle.ts | 환불 실패 복구 |
| 정산 status 가드 | settle.ts | 이중 정산 방지 |

## 6. 장애 대응 절차

### 정산 오류 발생 시

1. 즉시 정산 크론 중지 (`crontab -e`에서 fetch-results 비활성화)
2. 오판정 범위 파악: `SELECT * FROM betman_predictions WHERE settled_at > '문제시점'`
3. 오판정 예측 롤백: status → pending, is_correct → null
4. 슬립 상태 롤백: status → pending
5. 원인 수정 후 재정산: `POST /api/betman/stats/recalculate`
6. 정합성 검증 크론 수동 실행

### 볼 누락 발생 시

1. `pending_refunds` 테이블 확인
2. 수동 환불: `SELECT refund_tokens(user_id, amount, '수동 환불')`
3. `token_transactions` 이력 확인으로 정합성 검증

## 7. 향후 강화 계획

### 단기 (런칭 후 1개월)

- [ ] 정산 정합성 검증 API 구현 + Vultr cron 등록
- [ ] pending_refunds 관리자 페이지 (미처리 환불 확인/처리)
- [ ] 정산 이력 관리자 조회 페이지

### 중기 (3개월)

- [ ] 자동화 E2E 테스트 (Playwright): 베팅→정산→랭킹 전체 플로우
- [ ] 정산 결과 변경/롤백 관리자 API
- [ ] 분산 Rate Limiting (Redis 기반, Vercel 다중 인스턴스 대응)

### 장기 (6개월)

- [ ] 실시간 이상 탐지 (비정상 베팅 패턴 감지)
- [ ] 정산 감사 로그 (변경 이력 추적)
- [ ] 부하 테스트 자동화 (k6/Artillery)

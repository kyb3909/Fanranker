/**
 * 벽돌 단가 — 활동 점수 10점 = 벽돌 1개 ("글 하나 = 벽돌 하나").
 *
 * ⚠️ DB 의 buy_stadium_bricks() 안에 같은 상수(v_price)가 있다. 바꿀 땐 둘 다:
 *    supabase/migrations/20260827_stadium_bricks.sql 의 함수를 재정의(+REVOKE 재첨부)하고
 *    이 값을 맞춘다. 화면 표기용이므로 어긋나면 가격표가 거짓말을 한다.
 */
export const BRICK_PRICE = 10

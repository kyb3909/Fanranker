-- 일일 토큰 이중 리셋 버그 수정
--
-- 증상: 하루에 daily_reset 이 2번 발생하는 유저 → 하루 10볼 제한 누수.
-- 원인: 리셋 경로가 둘인데 "하루" 경계가 어긋남.
--   1) 배치 크론: 14:00 UTC = 23:00 KST 에 무조건 reset_user_daily_tokens() 호출
--   2) lazy: /api/tokens/balance → ensure_daily_token_reset() 가 KST 달력날짜
--      (00:00 KST) 경계로 리셋 판정
--   배치가 KST 자정 1시간 전(23:00)에 리셋 도장을 찍으니, 00:00 KST 가 지나면
--   lazy 입장에선 "어제 리셋됨 → 오늘 또 리셋"이 되어 같은 24h 안에 두 번 리셋됨.
--
-- 수정:
--   (A) vercel.json 크론을 0 15 * * * (15:00 UTC = 00:00 KST) 로 이동 → 배치 경계를
--       lazy 의 KST 자정 경계에 정렬. (vercel.json 에서 별도 변경)
--   (B) reset_user_daily_tokens() 에 "오늘(KST) 이미 리셋됐으면 no-op" 멱등 가드 추가
--       → 자정에 배치·lazy 가 동시에 쳐도 KST 하루당 1회만 리셋(레이스 방어).
CREATE OR REPLACE FUNCTION "public"."reset_user_daily_tokens"("target_user_id" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    daily_allocation integer := 10;
    current_balance integer;
    last_reset timestamptz;
    reset_amount integer;
    kst_today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
    SELECT token_balance, last_reset_at
    INTO current_balance, last_reset
    FROM user_tokens
    WHERE user_id = target_user_id;

    -- 신규 유저: 레코드 생성
    IF current_balance IS NULL THEN
        INSERT INTO user_tokens (user_id, token_balance, last_reset_at, total_tokens_earned)
        VALUES (target_user_id, daily_allocation, now(), daily_allocation)
        ON CONFLICT (user_id) DO NOTHING;
        RETURN;
    END IF;

    -- 멱등 가드: 이미 오늘(KST) 리셋됐으면 아무것도 안 함 → 이중 리셋 방지
    IF last_reset IS NOT NULL
       AND (last_reset AT TIME ZONE 'Asia/Seoul')::date >= kst_today THEN
        RETURN;
    END IF;

    reset_amount := GREATEST(0, daily_allocation - current_balance);

    UPDATE user_tokens
    SET token_balance = daily_allocation,
        last_reset_at = now(),
        total_tokens_earned = total_tokens_earned + reset_amount,
        updated_at = now()
    WHERE user_id = target_user_id;

    IF reset_amount > 0 THEN
        INSERT INTO token_transactions (
            user_id, transaction_type, amount, balance_after, description
        ) VALUES (
            target_user_id, 'daily_reset', reset_amount, daily_allocation,
            'Daily token reset at ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
        );
    END IF;
END;
$$;

-- 일일 볼 리셋 경계를 "경기 목록 회차 경계(밤 11시 KST)"에 정렬
--
-- 배경: 앞선 20260630_fix_double_daily_token_reset.sql 은 리셋 경계를 KST 달력
--       자정(00:00)으로 통일했으나, 실제 베팅 회차(경기 목록)는 매일 밤 11시(23:00 KST)에
--       바뀐다. 23:00 에 목록이 바뀌고 볼을 받은 뒤, 같은 회차인데 00:00 이 지났다고
--       또 충전되는 문제가 남는다(같은 경기들에 두 번 베팅 가능).
--
-- 수정: "베팅 회차일"을 KST + 1시간의 날짜로 정의 → 경계가 정확히 23:00 KST 에서 넘어간다.
--       (22:59 → 당일, 23:00 → 다음날). 두 리셋 경로(배치 cron, lazy on-access)가 모두
--       이 회차 경계를 기준으로 1회차당 1회만 충전하도록 통일. 배치 cron 은 23:00 KST
--       (vercel.json 0 14 * * *)로 되돌려 회차 시작과 정렬.

-- (1) 배치/공통 리셋 — 같은 회차에 이미 리셋됐으면 no-op (23:00 KST 경계)
CREATE OR REPLACE FUNCTION "public"."reset_user_daily_tokens"("target_user_id" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    daily_allocation integer := 10;
    current_balance integer;
    last_reset timestamptz;
    reset_amount integer;
    betting_today date := ((now() AT TIME ZONE 'Asia/Seoul') + interval '1 hour')::date;
BEGIN
    SELECT token_balance, last_reset_at
    INTO current_balance, last_reset
    FROM user_tokens
    WHERE user_id = target_user_id;

    IF current_balance IS NULL THEN
        INSERT INTO user_tokens (user_id, token_balance, last_reset_at, total_tokens_earned)
        VALUES (target_user_id, daily_allocation, now(), daily_allocation)
        ON CONFLICT (user_id) DO NOTHING;
        RETURN;
    END IF;

    -- 같은 베팅 회차(23:00 KST 경계)에 이미 리셋됐으면 아무것도 안 함 → 회차당 1회
    IF last_reset IS NOT NULL
       AND ((last_reset AT TIME ZONE 'Asia/Seoul') + interval '1 hour')::date >= betting_today THEN
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

-- (2) lazy on-access 리셋 — 회차일 비교도 23:00 KST 경계로
CREATE OR REPLACE FUNCTION "public"."ensure_daily_token_reset"("target_user_id" "text") RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    daily_allocation integer := 10;
    last_betting_day date;
    betting_today date := ((now() AT TIME ZONE 'Asia/Seoul') + interval '1 hour')::date;
    current_balance integer;
BEGIN
    SELECT ((last_reset_at AT TIME ZONE 'Asia/Seoul') + interval '1 hour')::date, token_balance
    INTO last_betting_day, current_balance
    FROM user_tokens
    WHERE user_id = target_user_id;

    IF last_betting_day IS NULL THEN
        INSERT INTO user_tokens (user_id, token_balance, last_reset_at, total_tokens_earned)
        VALUES (target_user_id, daily_allocation, now(), daily_allocation)
        ON CONFLICT (user_id) DO UPDATE
        SET
            token_balance = daily_allocation,
            last_reset_at = now(),
            total_tokens_earned = COALESCE(user_tokens.total_tokens_earned, 0) + daily_allocation,
            updated_at = now();

        RETURN daily_allocation;
    END IF;

    IF last_betting_day < betting_today THEN
        PERFORM reset_user_daily_tokens(target_user_id);
        SELECT token_balance INTO current_balance FROM user_tokens WHERE user_id = target_user_id;
        RETURN current_balance;
    END IF;

    RETURN COALESCE(current_balance, daily_allocation);
END;
$$;

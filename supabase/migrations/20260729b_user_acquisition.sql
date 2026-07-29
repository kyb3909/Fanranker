-- 유입 채널 귀속 + 온보딩 퍼널 계측 (시즌 오픈 이벤트 P0)
--
-- 배경
--   시즌 개막 이벤트는 유튜버 3채널에서 트래픽을 받는다. 그런데 지금은
--   "어느 채널에서 온 사람이 가입까지 갔는지"를 볼 방법이 없다:
--     · UTM 을 읽는 코드가 저장소에 한 줄도 없었다.
--     · GA4 의 signup_complete 는 채널 정보 없이 method 만 실었다.
--     · first_prediction / board_view 는 타입만 정의되고 발사되지 않았다(死).
--   유튜버에게 "당신 채널에서 N명이 왔고 M명이 정착했다"를 못 주면 협업이 1회로 끝난다.
--
-- 왜 GA4 만으로 안 되는가
--   채널별 잔존(D7 재방문)·팬덤별 분리 집계는 우리 DB 의 활동 데이터와 조인해야 나온다.
--   GA4 는 실시간 확인용, 이 테이블이 리포트의 원장이다.
--
-- 귀속 원칙: **최초 터치 고정(first touch)**
--   클라이언트가 첫 방문 때 localStorage 에 UTM 을 박아두고, 나중에 가입이 일어나면
--   그때 이 테이블에 올린다. 이후 방문에서 다른 UTM 이 와도 덮어쓰지 않는다 —
--   "누가 데려왔나"를 묻는 것이지 "마지막에 뭘 클릭했나"가 아니기 때문.

CREATE TABLE IF NOT EXISTS public.user_acquisition (
  user_id           text PRIMARY KEY,     -- Clerk user id
  utm_source        text,                 -- 채널 식별자 (유튜버별로 다르게 발급)
  utm_medium        text,
  utm_campaign      text,
  utm_content       text,
  utm_term          text,
  referrer_host     text,                 -- UTM 없이 온 경우의 차선책
  landing_path      text,                 -- 첫 착지 경로 — 랜딩별 전환 비교용
  first_seen_at     timestamptz,          -- 가입 전 첫 방문 시각 (클라 기록)
  signup_at         timestamptz,
  first_slip_at     timestamptz,
  first_post_at     timestamptz,
  first_comment_at  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_acquisition_source ON public.user_acquisition (utm_source);
CREATE INDEX IF NOT EXISTS idx_user_acquisition_signup ON public.user_acquisition (signup_at);

-- 정책을 하나도 만들지 않음 = anon/authenticated 는 읽기도 쓰기도 불가.
-- 쓰기는 서버 라우트(service_role)와 아래 RPC 로만 들어온다.
ALTER TABLE public.user_acquisition ENABLE ROW LEVEL SECURITY;

-- 퍼널 단계 기록. "이번이 처음이었나"를 돌려주므로 호출부가 GA4 이벤트를
-- 최초 1회만 쏠 수 있다. 이미 기록된 단계는 갱신하지 않는다(시각이 밀리면 안 됨).
CREATE OR REPLACE FUNCTION public.record_funnel_milestone(p_user_id text, p_step text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows int;
BEGIN
  IF p_user_id IS NULL OR p_user_id = '' THEN
    RETURN false;
  END IF;

  -- 이 테이블 도입 전에 가입한 유저에게도 단계는 남겨야 하므로 행을 먼저 확보한다.
  -- (그런 유저는 utm_* 이 전부 NULL 인 "귀속 불명"으로 집계된다)
  INSERT INTO user_acquisition (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  IF p_step = 'first_slip' THEN
    UPDATE user_acquisition SET first_slip_at = now()
     WHERE user_id = p_user_id AND first_slip_at IS NULL;
  ELSIF p_step = 'first_post' THEN
    UPDATE user_acquisition SET first_post_at = now()
     WHERE user_id = p_user_id AND first_post_at IS NULL;
  ELSIF p_step = 'first_comment' THEN
    UPDATE user_acquisition SET first_comment_at = now()
     WHERE user_id = p_user_id AND first_comment_at IS NULL;
  ELSE
    RAISE EXCEPTION 'unknown funnel step: %', p_step;
  END IF;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

-- ⚠️ 회수는 **PUBLIC 과 anon/authenticated 를 모두** 해야 한다. 실측(2026-07-29):
--    PUBLIC 만 회수한 직후 has_function_privilege('anon', ...) 가 여전히 true 였다.
--    Supabase 는 public 스키마 신규 함수에 anon/authenticated EXECUTE 를 기본 부여하므로
--    (ALTER DEFAULT PRIVILEGES) 명시적 회수가 별도로 필요하다.
REVOKE ALL ON FUNCTION public.record_funnel_milestone(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_funnel_milestone(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_funnel_milestone(text, text) TO service_role;

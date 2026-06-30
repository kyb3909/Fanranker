-- 설문조사(폴) 기능 — 메인 사이드바 위젯 + 어드민 생성.
-- 예측하러 온 유저의 콘텐츠 소비/반응을 끌어내는 원탭 투표 장치.
-- options 는 jsonb 배열 [{"key":"o1","label":"..."}]. 결과는 poll_votes 집계.

CREATE TABLE IF NOT EXISTS public.polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  options jsonb NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  allow_reason boolean NOT NULL DEFAULT true,  -- "왜?" 한 줄 입력 노출 여부
  created_by text,                              -- 생성 admin user_id
  created_at timestamptz NOT NULL DEFAULT now(),
  closes_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  option_key text NOT NULL,
  reason text,                                  -- 선택적 "왜?" 한 줄 (글쓰기 온램프)
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT poll_votes_unique_user UNIQUE (poll_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON public.poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_polls_active ON public.polls(is_active, created_at DESC);

-- RLS: 폴 질문은 공개 읽기, 투표/집계는 service role(API)만. anon 직접 쓰기 차단.
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "polls_public_read" ON public.polls FOR SELECT USING (true);
-- poll_votes 는 공개 정책 없음 → service role 로만 접근(결과 집계는 API가 수행).

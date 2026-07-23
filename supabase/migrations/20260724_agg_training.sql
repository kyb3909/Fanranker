-- 페르소나 글 학습 하니스 검수 테이블 (F15)
-- 루프: 로컬 gen(agg-train.js)이 AI 초안을 insert → /admin/agg-training 에서 통과/교정/반려 →
-- 로컬 learn 이 corrected/rejected 를 config/agg-corrections.json 으로 회수(learned_at 마킹) →
-- 다음 gen 프롬프트에 few-shot 주입. 라이브 발행(posts)과 완전 분리.

CREATE TABLE IF NOT EXISTS public.agg_training_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round int NOT NULL,                       -- 학습 라운드 번호 (gen 1회 = 1라운드)
  source_title text NOT NULL,               -- 원본 소재 제목
  category text,
  body_excerpt text,                        -- 원본 발췌 (검수 판단 재료)
  media jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{type, url, rehosted_url?}]
  persona text NOT NULL,                    -- 페르소나 닉네임
  structure text NOT NULL,                  -- photo_blurb | one_point | short_read | number_hook
  angle text,
  ai_title text NOT NULL,
  ai_body text NOT NULL,                    -- 문단은 \n\n 구분
  fix_title text,                           -- 교정본 (corrected 일 때)
  fix_body text,
  reject_reason text,                       -- 반려 사유 (rejected 일 때)
  status text NOT NULL DEFAULT 'pending',   -- pending → passed | corrected | rejected
  reviewed_at timestamptz,
  learned_at timestamptz,                   -- learn 이 corrections.json 으로 회수한 시각
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agg_training_status_idx
  ON public.agg_training_entries (status, round);

-- RLS: 서비스 롤 전용 (클라이언트 접근 없음 — agg_reservoir 와 동일 패턴)
ALTER TABLE public.agg_training_entries ENABLE ROW LEVEL SECURITY;

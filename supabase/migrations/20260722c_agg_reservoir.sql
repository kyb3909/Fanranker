-- 커뮤니티 애그리게이터 (자유게시판 떡밥 파이프라인)
-- 더쿠/인스티즈/펨코/DC 인기글 수집 → 재작성 → 페르소나 발행.
-- news_reservoir 패턴 복제 (status 전이 + 멱등 + audit).
-- 출처 대응: source_url 보존 → 삭제 요청 시 해당 글 즉시 추적/삭제 가능.

CREATE TABLE IF NOT EXISTS public.agg_reservoir (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,                    -- 'theqoo' | 'instiz' | 'fmkorea' | 'dcinside'
  source_url text NOT NULL UNIQUE,         -- 원본 글 URL (멱등키 + 삭제 대응)
  source_title text NOT NULL,              -- 원본 제목
  category text,                           -- 원본 카테고리 (있으면)
  body_excerpt text,                       -- 본문 발췌 (재작성 재료, 발행 안 함)
  media jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{type:'image'|'youtube'|'x'|'instagram', url, rehosted_url?}]
  rewritten jsonb,                         -- {title, intro, persona_user_id}
  status text NOT NULL DEFAULT 'ingested', -- ingested → fetched → drafted → approved → published | rejected
  reject_reason text,
  post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  audit jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX IF NOT EXISTS agg_reservoir_status_idx ON public.agg_reservoir (status, created_at);

-- RLS: 서비스 롤 전용 (클라이언트 접근 없음)
ALTER TABLE public.agg_reservoir ENABLE ROW LEVEL SECURITY;

-- 페르소나 프로필 (기존 user_bot_* 패턴 동일 — Clerk 계정 아님, service role insert 전용)
-- 안전 원칙: 글만 작성, 댓글/베팅/랭킹 불참 (파이프라인이 posts insert만 수행)
INSERT INTO public.profiles (user_id, nickname, role, onboarding_completed)
VALUES
  ('user_persona_dawn',   '새벽두시반',   'user', false), -- 여돌 덕후 A: 4세대 위주, 음슴체, 심야형
  ('user_persona_light',  '요즘뭐봄',     'user', false), -- 여돌 라이트: "이거 뜨더라" 톤, 해요체, 낮형
  ('user_persona_meme',   '떡밥줍는사람', 'user', false), -- 잡덕밥: 유머/화제글, 반말체
  ('user_persona_gooner', '하이버리지박령','user', false), -- 아스날 팬 (스포츠 떡밥)
  ('user_persona_kbo',    '퇴근하고직관', 'user', false)  -- KBO 팬 (야구 단신)
ON CONFLICT (user_id) DO NOTHING;

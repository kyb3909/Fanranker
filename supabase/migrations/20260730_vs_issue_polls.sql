-- VS 쟁점 폴 — 뉴스 게시물에 붙는 찬반 대결 (2026-07-30)
--
-- 목적: 히어로/게시물에서 "읽기 → 1탭 투표 → 진영 방어 댓글"로 이어지는
-- 저마찰 참여 계단. 기존 polls/poll_votes 인프라를 그대로 재사용하고
-- 게시물 연결(post_id)과 3줄 요약(summary)만 얹는다.
--
-- 구분: post_id IS NULL = 기존 사이드바 일반 폴 / NOT NULL = 게시물 VS 폴.
-- 사이드바 활성 폴 조회(/api/polls/active)는 post_id IS NULL 로 한정한다.

ALTER TABLE public.polls
  ADD COLUMN IF NOT EXISTS post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS summary jsonb; -- 3줄 요약 ["...", "...", "..."] (게시물 상단 박스)

CREATE INDEX IF NOT EXISTS idx_polls_post ON public.polls (post_id) WHERE post_id IS NOT NULL;

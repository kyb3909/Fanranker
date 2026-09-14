BEGIN;
CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  user_id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_attempt_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text
);
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.account_deletion_requests TO service_role;

-- Erase authored text and profile details atomically; keep references required by
-- other users' replies and financial ledgers. Clerk deletion has a durable retry queue.
CREATE OR REPLACE FUNCTION public.request_account_deletion(p_user_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_user_id IS NULL OR btrim(p_user_id) = '' THEN RAISE EXCEPTION 'user required'; END IF;
  INSERT INTO public.profiles(user_id, nickname, deleted_at)
    VALUES (p_user_id, '[탈퇴한 사용자]', now()) ON CONFLICT (user_id) DO NOTHING;
  PERFORM 1 FROM public.profiles WHERE user_id = p_user_id FOR UPDATE;
  INSERT INTO public.account_deletion_requests(user_id) VALUES (p_user_id) ON CONFLICT DO NOTHING;
  UPDATE public.profiles SET deleted_at = coalesce(deleted_at, now()),
    nickname = '[탈퇴한 사용자]', avatar_url = NULL, bio = NULL,
    artist_bio = NULL, specialties = '{}', favorite_team = NULL, favorite_player = NULL,
    metaverse_avatar_key = NULL, equipped_pixel_art_id = NULL, display_title_id = NULL,
    role = 'user', is_artist = false, is_expert = false, is_journalist = false,
    onboarding_completed = false, updated_at = now()
    WHERE user_id = p_user_id;
  UPDATE public.posts SET title = '[삭제된 게시글]', content = '{"type":"doc","content":[]}'::jsonb,
    image = NULL, deleted_at = coalesce(deleted_at, now()), updated_at = now()
    WHERE user_id = p_user_id;
  UPDATE public.comments SET content = '[삭제된 댓글]', sticker_id = NULL,
    deleted_at = coalesce(deleted_at, now()), updated_at = now() WHERE user_id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.request_account_deletion(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_account_deletion(text) TO service_role;
COMMIT;

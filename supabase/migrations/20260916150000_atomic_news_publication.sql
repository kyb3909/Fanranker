-- Posts and the reservoir receipt commit together. No lease survives a failed transaction.
-- canonical_source_url is computed by lib/news/canonical-url.ts; preserve one normalizer.
CREATE INDEX news_reservoir_published_source_idx
  ON public.news_reservoir ((publish->>'canonical_source_url'))
  WHERE status='published';

CREATE FUNCTION public.publish_news_draft_atomic(
  p_reservoir_id text,
  p_post jsonb,
  p_draft jsonb,
  p_publish jsonb,
  p_source_key text,
  p_duplicate_post_id uuid DEFAULT NULL,
  p_expected_updated_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.news_reservoir%ROWTYPE; existing public.posts%ROWTYPE;
  new_post_id uuid; published_at timestamptz=clock_timestamp(); source_url text;
BEGIN
  IF p_reservoir_id IS NULL OR p_post IS NULL OR p_draft IS NULL OR p_publish IS NULL
    OR jsonb_typeof(p_post)<>'object' OR jsonb_typeof(p_draft)<>'object'
    OR jsonb_typeof(p_publish)<>'object'
    OR p_post->>'user_id' IS DISTINCT FROM 'user_bot_soccer_kr'
    OR length(btrim(COALESCE(p_post->>'title','')))=0 OR p_post->'content' IS NULL
    OR p_post->'content'='null'::jsonb THEN
    RAISE EXCEPTION 'invalid news publication' USING ERRCODE='22023';
  END IF;
  source_url=p_post->>'source_url';
  IF (source_url IS NOT NULL AND nullif(p_source_key,'') IS NULL)
    OR (source_url IS NULL AND p_source_key IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid source key' USING ERRCODE='22023';
  END IF;

  -- Different drafts of the same source serialize before reading their publication receipts.
  IF p_source_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('news-source:'||p_source_key,0));
  END IF;
  SELECT * INTO item FROM public.news_reservoir WHERE id=p_reservoir_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'draft missing' USING ERRCODE='P0002'; END IF;

  IF item.status='published' THEN
    SELECT * INTO existing FROM public.posts
      WHERE id::text=COALESCE(item.publish->>'post_id',item.publish->>'postId')
        AND user_id='user_bot_soccer_kr' AND deleted_at IS NULL;
    IF FOUND THEN
      RETURN jsonb_build_object('outcome','already_published','post_id',existing.id);
    END IF;
  END IF;
  IF item.status<>'drafted' OR item.urls->>'source' IS DISTINCT FROM source_url
    OR p_expected_updated_at IS NULL OR item.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'draft changed or already processed' USING ERRCODE='40001';
  END IF;

  -- Existing pre-migration posts are identified by the JS canonical-URL preflight.
  -- Revalidate the supplied post under the lock: a deleted/expired post does not block republishing.
  IF p_duplicate_post_id IS NOT NULL THEN
    SELECT * INTO existing FROM public.posts WHERE id=p_duplicate_post_id
      AND user_id='user_bot_soccer_kr' AND deleted_at IS NULL
      AND created_at>=published_at-interval '48 hours';
    IF FOUND THEN
      RETURN jsonb_build_object('outcome','duplicate','post_id',existing.id,'title',existing.title);
    END IF;
  END IF;
  IF p_source_key IS NOT NULL THEN
    SELECT p.* INTO existing FROM public.news_reservoir r
      JOIN public.posts p ON p.id::text=COALESCE(r.publish->>'post_id',r.publish->>'postId')
      WHERE r.status='published' AND r.publish->>'canonical_source_url'=p_source_key
        AND p.user_id='user_bot_soccer_kr' AND p.deleted_at IS NULL
        AND p.created_at>=published_at-interval '48 hours'
      ORDER BY p.created_at DESC LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('outcome','duplicate','post_id',existing.id,'title',existing.title);
    END IF;
  END IF;

  INSERT INTO public.posts(user_id,category_id,community_slug,title,content,image,source_url,flair_id)
    VALUES('user_bot_soccer_kr',(p_post->>'category_id')::uuid,p_post->>'community_slug',
      p_post->>'title',p_post->'content',p_post->>'image',source_url,(p_post->>'flair_id')::uuid)
    RETURNING id INTO new_post_id;
  UPDATE public.news_reservoir SET status='published',draft=p_draft,
    publish=p_publish||jsonb_build_object('post_id',new_post_id,'published_at',published_at,
      'canonical_source_url',p_source_key),updated_at=published_at WHERE id=p_reservoir_id;
  RETURN jsonb_build_object('outcome','published','post_id',new_post_id);
END $$;

REVOKE ALL ON FUNCTION public.publish_news_draft_atomic(text,jsonb,jsonb,jsonb,text,uuid,timestamptz)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.publish_news_draft_atomic(text,jsonb,jsonb,jsonb,text,uuid,timestamptz)
  TO service_role;

-- Roll back the application first. The additive RPC/index/receipt JSON can remain unchanged.
-- No data deletion or schema rollback is required for the previous application version.

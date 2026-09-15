-- A searchable archive and atomic edits of the actual article plus its learning record.
CREATE VIEW public.news_desk_catalog AS
WITH articles AS (
  SELECT CASE WHEN p.id IS NULL THEN 'draft' ELSE 'post' END AS kind,
    COALESCE(p.id::text,r.id) AS id, r.id AS source_id,
    COALESCE(p.title,r.draft->>'title',r.draft->>'headline','제목 없음') AS title,
    CASE WHEN p.deleted_at IS NOT NULL THEN 'deleted' WHEN p.id IS NOT NULL THEN 'published'
      WHEN r.status='published' THEN 'archived' ELSE r.status END AS status,
    r.created_at
  FROM public.news_reservoir r
  LEFT JOIN public.posts p ON p.id::text=COALESCE(r.publish->>'post_id',r.publish->>'postId')
    AND p.user_id='user_bot_soccer_kr'
  WHERE r.status IN ('drafted','published','rejected') AND r.draft IS NOT NULL
    AND (r.draft ? 'content' OR r.draft ? 'body')
  UNION ALL
  SELECT 'post',p.id::text,NULL,p.title,
    CASE WHEN p.deleted_at IS NULL THEN 'published' ELSE 'deleted' END,p.created_at
  FROM public.posts p WHERE p.user_id='user_bot_soccer_kr'
    AND NOT EXISTS(SELECT 1 FROM public.news_reservoir r
      WHERE COALESCE(r.publish->>'post_id',r.publish->>'postId')=p.id::text)
)
SELECT DISTINCT ON(kind,id) * FROM articles ORDER BY kind,id,created_at DESC;
REVOKE ALL ON public.news_desk_catalog FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.news_desk_catalog TO service_role;

ALTER TABLE public.news_desk_items ADD COLUMN origin_snapshot jsonb;

CREATE FUNCTION public.news_desk_plain_text(node jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE result text=''; child jsonb;
BEGIN
  IF jsonb_typeof(node)='string' THEN RETURN node#>>'{}'; END IF;
  IF node->>'type'='text' THEN RETURN COALESCE(node->>'text',''); END IF;
  IF node->>'type'='hardBreak' THEN RETURN E'\n'; END IF;
  FOR child IN SELECT value FROM jsonb_array_elements(COALESCE(node->'content','[]')) LOOP
    result=result||public.news_desk_plain_text(child);
  END LOOP;
  IF node->>'type' IN ('paragraph','heading','blockquote','listItem') THEN result=result||E'\n\n'; END IF;
  RETURN result;
END $$;

-- Retain non-prose nodes (including nested images/embeds) when rebuilding edited paragraphs.
CREATE FUNCTION public.news_desk_media(node jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE result jsonb='[]'; child jsonb;
BEGIN
  IF jsonb_typeof(node)<>'object' OR node IS NULL THEN RETURN result; END IF;
  IF NOT node ? 'content' AND node->>'type' NOT IN ('text','hardBreak','paragraph','heading')
    THEN RETURN jsonb_build_array(node); END IF;
  FOR child IN SELECT value FROM jsonb_array_elements(COALESCE(node->'content','[]')) LOOP
    result=result||public.news_desk_media(child);
  END LOOP;
  RETURN result;
END $$;

CREATE FUNCTION public.news_desk_content(previous jsonb,article text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE blocks jsonb='[]'; paragraph text; node jsonb; paragraphs jsonb='[]'; idx integer=0;
BEGIN
  IF btrim(public.news_desk_plain_text(previous),E' \n\r\t')=article THEN RETURN previous; END IF;
  FOREACH paragraph IN ARRAY regexp_split_to_array(article,E'\n[\t ]*\n') LOOP
    paragraphs=paragraphs||jsonb_build_array(jsonb_build_object('type','paragraph','content',
      jsonb_build_array(jsonb_build_object('type','text','text',paragraph))));
  END LOOP;
  FOR node IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(previous)='object' THEN COALESCE(previous->'content','[]') ELSE '[]' END) LOOP
    IF btrim(public.news_desk_plain_text(node),E' \n\r\t')<>'' AND idx<jsonb_array_length(paragraphs) THEN
      blocks=blocks||jsonb_build_array(paragraphs->idx); idx=idx+1;
    END IF;
    blocks=blocks||public.news_desk_media(node);
  END LOOP;
  WHILE idx<jsonb_array_length(paragraphs) LOOP
    blocks=blocks||jsonb_build_array(paragraphs->idx); idx=idx+1;
  END LOOP;
  RETURN jsonb_build_object('type','doc','content',blocks);
END $$;

CREATE FUNCTION public.news_desk_origin(p_kind text,p_origin_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF p_kind='post' THEN
    SELECT jsonb_build_object('title',title,'content',content,'deleted_at',deleted_at) INTO result
      FROM public.posts WHERE id::text=p_origin_id AND user_id='user_bot_soccer_kr' FOR UPDATE;
  ELSIF p_kind='draft' THEN
    SELECT jsonb_build_object('draft',draft,'status',status,'publish',publish) INTO result
      FROM public.news_reservoir WHERE id=p_origin_id AND status IN ('drafted','published','rejected') FOR UPDATE;
  ELSE RAISE EXCEPTION 'invalid origin' USING ERRCODE='22023'; END IF;
  IF result IS NULL THEN RAISE EXCEPTION 'article missing' USING ERRCODE='P0002'; END IF;
  RETURN result;
END $$;

CREATE FUNCTION public.open_news_desk_article(p_kind text,p_origin_id text,p_sources jsonb,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE snapshot jsonb; article jsonb; opened jsonb; item public.news_desk_items%ROWTYPE;
BEGIN
  -- Serialize opening and saving a particular article with the same lock order.
  PERFORM pg_advisory_xact_lock(hashtextextended('desk:'||p_kind||':'||p_origin_id,0));
  snapshot=public.news_desk_origin(p_kind,p_origin_id);
  article=CASE WHEN p_kind='post' THEN snapshot ELSE snapshot->'draft' END;
  article=jsonb_build_object('title',COALESCE(article->>'title',article->>'headline'),
    'article',btrim(public.news_desk_plain_text(COALESCE(article->'content',article->'body')),E' \n\r\t'));
  opened=public.import_news_desk_article(p_kind,p_origin_id,article,p_sources,p_actor);
  SELECT * INTO item FROM public.news_desk_items WHERE id=(opened->>'id')::uuid FOR UPDATE;
  -- An old private correction must be reviewed against today's live article before it can be applied.
  IF item.origin_snapshot IS DISTINCT FROM snapshot THEN
    UPDATE public.news_desk_items SET draft=article,version=version+1,origin_snapshot=snapshot,
      sources=p_sources,origin=origin||jsonb_build_object('status',CASE WHEN p_kind='post' THEN
        CASE WHEN snapshot->>'deleted_at' IS NULL THEN 'published' ELSE 'deleted' END ELSE snapshot->>'status' END),
      updated_at=now() WHERE id=item.id;
  END IF;
  RETURN opened;
END $$;

CREATE FUNCTION public.save_news_desk_article(p_id uuid,p_expected_version integer,p_title text,p_article text,p_reason text,p_editor text,p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.news_desk_items%ROWTYPE; snapshot jsonb; saved jsonb; new_content jsonb; final jsonb;
  kind text; origin_id text; linked public.news_reservoir%ROWTYPE;
BEGIN
  SELECT origin->>'kind',origin->>'id' INTO kind,origin_id FROM public.news_desk_items WHERE id=p_id;
  IF kind IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('desk:'||kind||':'||origin_id,0)); END IF;
  SELECT * INTO item FROM public.news_desk_items WHERE id=p_id FOR UPDATE;
  IF kind IS NOT NULL THEN
    snapshot=public.news_desk_origin(kind,origin_id);
    IF item.origin_snapshot IS NULL OR snapshot IS DISTINCT FROM item.origin_snapshot THEN
      RAISE EXCEPTION 'original article changed' USING ERRCODE='40001'; END IF;
  END IF;
  saved=public.save_news_desk_edit(p_id,p_expected_version,p_title,p_article,p_reason,p_editor,p_status);
  IF kind IS NOT NULL AND (saved->>'changed')::boolean THEN
    IF kind='post' THEN
      new_content=public.news_desk_content(snapshot->'content',btrim(p_article));
      UPDATE public.posts SET title=btrim(p_title),content=new_content,updated_at=now() WHERE id::text=origin_id;
      FOR linked IN SELECT * FROM public.news_reservoir
        WHERE COALESCE(publish->>'post_id',publish->>'postId')=origin_id FOR UPDATE LOOP
        final=COALESCE(linked.draft,'{}');
        IF NOT final ? 'original' THEN final=final||jsonb_build_object('original',COALESCE(linked.draft,snapshot)); END IF;
        UPDATE public.news_reservoir SET draft=final||jsonb_build_object('title',btrim(p_title),'content',new_content),updated_at=now() WHERE id=linked.id;
      END LOOP;
    ELSE
      final=snapshot->'draft';
      new_content=public.news_desk_content(COALESCE(final->'content',final->'body'),btrim(p_article));
      IF NOT final ? 'original' THEN final=final||jsonb_build_object('original',final); END IF;
      UPDATE public.news_reservoir SET draft=final||jsonb_build_object('title',btrim(p_title),'content',new_content),updated_at=now() WHERE id=origin_id;
    END IF;
    UPDATE public.news_desk_items SET origin_snapshot=public.news_desk_origin(kind,origin_id) WHERE id=p_id;
  END IF;
  RETURN saved||jsonb_build_object('applied_to_article',kind IS NOT NULL,'saved_at',now());
END $$;

REVOKE ALL ON FUNCTION public.news_desk_plain_text(jsonb),public.news_desk_media(jsonb),public.news_desk_content(jsonb,text),public.news_desk_origin(text,text),public.open_news_desk_article(text,text,jsonb,text),public.save_news_desk_article(uuid,integer,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.open_news_desk_article(text,text,jsonb,text),public.save_news_desk_article(uuid,integer,text,text,text,text,text) TO service_role;

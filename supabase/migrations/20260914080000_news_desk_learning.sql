-- Private editorial practice queue. Public news publishing does not read these tables.
CREATE TABLE public.news_desk_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT true,
  pending_target integer NOT NULL DEFAULT 6 CHECK (pending_target BETWEEN 1 AND 20),
  daily_limit integer NOT NULL DEFAULT 12 CHECK (daily_limit BETWEEN 1 AND 48),
  next_auto_at timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz,
  lease_until timestamptz,
  lease_token uuid,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.news_desk_settings(id) VALUES (true);

CREATE TABLE public.news_desk_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_reservoir_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'generating' CHECK (status IN ('generating','drafted','reviewed','rejected','failed')),
  generation_token uuid NOT NULL,
  sources jsonb NOT NULL CHECK (jsonb_typeof(sources)='array'),
  research jsonb,
  original jsonb,
  draft jsonb,
  quality jsonb,
  applied_lesson_ids uuid[] NOT NULL DEFAULT '{}',
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  generated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX news_desk_items_queue_idx ON public.news_desk_items(status, created_at DESC);

CREATE TABLE public.news_desk_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.news_desk_items(id) ON DELETE CASCADE,
  version integer NOT NULL,
  before_draft jsonb NOT NULL,
  after_draft jsonb NOT NULL,
  editor_reason text NOT NULL DEFAULT '',
  editor_id text NOT NULL,
  learning_state text NOT NULL DEFAULT 'pending' CHECK (learning_state IN ('pending','processing','ready','failed','skipped')),
  learning_attempts integer NOT NULL DEFAULT 0,
  learning_token uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  learning_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(item_id,version)
);
CREATE INDEX news_desk_learning_queue_idx ON public.news_desk_revisions(learning_state,next_attempt_at);

CREATE TABLE public.news_desk_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES public.news_desk_revisions(id) ON DELETE CASCADE,
  ordinal integer NOT NULL,
  category text NOT NULL CHECK (category IN ('fact','number','time','naming','attribution','certainty','quote','context','structure','style')),
  field text NOT NULL CHECK (field IN ('title','article')),
  wrong text NOT NULL,
  correct text NOT NULL,
  explanation text NOT NULL,
  instruction text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('general','case')),
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(revision_id,ordinal)
);
CREATE INDEX news_desk_lessons_active_idx ON public.news_desk_lessons(active,created_at DESC);

-- Reserve quota and source atomically before a paid request. A crashed run has a bounded lease.
CREATE FUNCTION public.claim_news_desk_item(p_source_id text, p_sources jsonb, p_token uuid, p_manual boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg public.news_desk_settings%ROWTYPE; item_id uuid; pending integer; daily integer;
BEGIN
  SELECT * INTO cfg FROM public.news_desk_settings WHERE id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'news desk settings missing'; END IF;
  IF cfg.lease_until > now() THEN RETURN jsonb_build_object('skipped','busy'); END IF;
  UPDATE public.news_desk_items SET status='failed',error='작성 시간이 초과됐습니다. 다른 소재로 다시 작성할 수 있습니다.',updated_at=now()
    WHERE status='generating' AND created_at < now()-interval '10 minutes';
  IF NOT p_manual AND NOT cfg.enabled THEN RETURN jsonb_build_object('skipped','paused'); END IF;
  IF NOT p_manual AND cfg.next_auto_at > now() THEN RETURN jsonb_build_object('skipped','not_due'); END IF;
  SELECT count(*) INTO pending FROM public.news_desk_items WHERE status IN ('generating','drafted');
  IF pending >= cfg.pending_target THEN RETURN jsonb_build_object('skipped','queue_full'); END IF;
  SELECT count(*) INTO daily FROM public.news_desk_items
    WHERE created_at >= ((now() AT TIME ZONE 'Asia/Seoul')::date::timestamp AT TIME ZONE 'Asia/Seoul');
  IF daily >= cfg.daily_limit THEN RETURN jsonb_build_object('skipped','daily_limit'); END IF;
  IF EXISTS(SELECT 1 FROM public.news_desk_items WHERE source_reservoir_id=p_source_id) THEN
    RETURN jsonb_build_object('skipped','duplicate_source');
  END IF;
  IF p_sources IS NULL OR jsonb_typeof(p_sources) <> 'array' OR jsonb_array_length(p_sources) NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION 'invalid sources' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.news_desk_items(source_reservoir_id,sources,generation_token)
    VALUES(p_source_id,p_sources,p_token) RETURNING id INTO item_id;
  UPDATE public.news_desk_settings SET lease_token=p_token,lease_until=now()+interval '10 minutes',
    last_run_at=now(),next_auto_at=now()+interval '1 hour',last_error=NULL,updated_at=now() WHERE id;
  RETURN jsonb_build_object('id',item_id,'token',p_token);
END $$;

-- A saved edit and its immutable teaching example are one transaction.
CREATE FUNCTION public.save_news_desk_edit(p_id uuid,p_expected_version integer,p_title text,p_article text,p_reason text,p_editor text,p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item public.news_desk_items%ROWTYPE; final_draft jsonb; changed boolean; rev_id uuid; next_version integer;
BEGIN
  IF p_id IS NULL OR p_expected_version IS NULL OR p_title IS NULL OR p_article IS NULL OR p_reason IS NULL OR p_editor IS NULL OR p_status IS NULL
    OR p_status NOT IN ('drafted','reviewed','rejected') OR length(trim(p_title)) NOT BETWEEN 2 AND 300
    OR length(trim(p_article)) NOT BETWEEN 20 AND 8000 OR length(p_reason)>2000 OR length(p_editor)<1 THEN
    RAISE EXCEPTION 'invalid edit' USING ERRCODE='22023';
  END IF;
  SELECT * INTO item FROM public.news_desk_items WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'item not found' USING ERRCODE='P0002'; END IF;
  IF item.version <> p_expected_version OR item.status NOT IN ('drafted','reviewed','rejected') THEN
    RAISE EXCEPTION 'edit conflict' USING ERRCODE='40001';
  END IF;
  final_draft=jsonb_build_object('title',trim(p_title),'article',trim(p_article));
  changed=item.draft IS DISTINCT FROM final_draft;
  IF NOT changed AND item.status=p_status AND p_reason='' THEN
    RETURN jsonb_build_object('version',item.version,'changed',false);
  END IF;
  next_version=item.version+1;
  UPDATE public.news_desk_items SET draft=final_draft,status=p_status,version=next_version,updated_at=now() WHERE id=p_id;
  INSERT INTO public.news_desk_revisions(item_id,version,before_draft,after_draft,editor_reason,editor_id,learning_state)
    VALUES(p_id,next_version,item.draft,final_draft,p_reason,p_editor,CASE WHEN changed THEN 'pending' ELSE 'skipped' END)
    RETURNING id INTO rev_id;
  RETURN jsonb_build_object('version',next_version,'revision_id',rev_id,'changed',changed);
END $$;

CREATE FUNCTION public.claim_news_desk_learning(p_token uuid,p_revision uuid DEFAULT NULL)
RETURNS SETOF public.news_desk_revisions LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid;
BEGIN
  UPDATE public.news_desk_revisions SET learning_state='failed',lease_until=NULL,learning_error='학습 작업 시간이 초과됐습니다. 수정 기록은 보관되어 있습니다.'
    WHERE learning_state='processing' AND lease_until<now() AND learning_attempts>=3;
  SELECT id INTO target FROM public.news_desk_revisions
    WHERE (p_revision IS NULL OR id=p_revision) AND learning_attempts<3
      AND ((learning_state IN ('pending','failed') AND next_attempt_at<=now())
        OR (learning_state='processing' AND lease_until<now()))
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF target IS NULL THEN RETURN; END IF;
  RETURN QUERY UPDATE public.news_desk_revisions SET learning_state='processing',learning_attempts=learning_attempts+1,
    learning_token=p_token,lease_until=now()+interval '3 minutes',learning_error=NULL WHERE id=target RETURNING *;
END $$;

CREATE FUNCTION public.complete_news_desk_learning(p_revision uuid,p_token uuid,p_lessons jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE revision public.news_desk_revisions%ROWTYPE; lesson jsonb; n integer=0; before_text text; after_text text;
BEGIN
  SELECT * INTO revision FROM public.news_desk_revisions WHERE id=p_revision FOR UPDATE;
  IF NOT FOUND OR revision.learning_state<>'processing' OR revision.learning_token IS DISTINCT FROM p_token THEN
    RAISE EXCEPTION 'learning lease lost' USING ERRCODE='40001';
  END IF;
  IF p_lessons IS NULL OR jsonb_typeof(p_lessons)<>'array' OR jsonb_array_length(p_lessons)>12 THEN
    RAISE EXCEPTION 'invalid lessons' USING ERRCODE='22023';
  END IF;
  FOR lesson IN SELECT * FROM jsonb_array_elements(p_lessons) LOOP
    before_text=revision.before_draft->>(lesson->>'field');
    after_text=revision.after_draft->>(lesson->>'field');
    IF before_text IS NULL OR after_text IS NULL OR before_text=after_text
      OR (lesson->>'wrong')=(lesson->>'correct')
      OR position(lesson->>'wrong' IN before_text)=0 OR position(lesson->>'correct' IN after_text)=0 THEN
      RAISE EXCEPTION 'lesson is not anchored in saved edit' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.news_desk_lessons(revision_id,ordinal,category,field,wrong,correct,explanation,instruction,scope)
      VALUES(p_revision,n,lesson->>'category',lesson->>'field',lesson->>'wrong',lesson->>'correct',
        lesson->>'explanation',lesson->>'instruction',lesson->>'scope');
    n=n+1;
  END LOOP;
  UPDATE public.news_desk_revisions SET learning_state='ready',lease_until=NULL,learning_error=NULL WHERE id=p_revision;
  RETURN n;
END $$;

ALTER TABLE public.news_desk_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_desk_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_desk_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_desk_lessons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.news_desk_settings,public.news_desk_items,public.news_desk_revisions,public.news_desk_lessons FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.news_desk_settings,public.news_desk_items,public.news_desk_revisions,public.news_desk_lessons TO service_role;
REVOKE ALL ON FUNCTION public.claim_news_desk_item(text,jsonb,uuid,boolean),public.save_news_desk_edit(uuid,integer,text,text,text,text,text),public.claim_news_desk_learning(uuid,uuid),public.complete_news_desk_learning(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_news_desk_item(text,jsonb,uuid,boolean),public.save_news_desk_edit(uuid,integer,text,text,text,text,text),public.claim_news_desk_learning(uuid,uuid),public.complete_news_desk_learning(uuid,uuid,jsonb) TO service_role;

-- Owner-operated dictionaries, permanent editorial rules and private training jobs.
-- Explicit person components; never infer surname or name order from an existing spelling.
ALTER TABLE public.news_alias_dictionary
  ADD COLUMN given_name_ko text NOT NULL DEFAULT '' CHECK (length(given_name_ko)<=100),
  ADD COLUMN family_name_ko text NOT NULL DEFAULT '' CHECK (length(family_name_ko)<=100),
  ADD COLUMN short_name_ko text NOT NULL DEFAULT '' CHECK (length(short_name_ko)<=100);
CREATE TABLE public.news_training_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  publish_enabled boolean,
  per_run_cap integer NOT NULL DEFAULT 2 CHECK (per_run_cap BETWEEN 1 AND 10),
  daily_job_limit integer NOT NULL DEFAULT 12 CHECK (daily_job_limit BETWEEN 1 AND 48),
  version integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.news_training_settings(id) VALUES(true);

CREATE TABLE public.news_editorial_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 100),
  category text NOT NULL CHECK (category IN ('fact','number','time','naming','attribution','certainty','quote','context','structure','style')),
  instruction text NOT NULL CHECK (length(trim(instruction)) BETWEEN 5 AND 1000),
  priority integer NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 100),
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.news_desk_lessons ADD COLUMN priority integer NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 100);
-- Previously saved learning remains usable; new AI interpretations wait for the editor.
ALTER TABLE public.news_desk_lessons ADD COLUMN review_status text NOT NULL DEFAULT 'legacy' CHECK (review_status IN ('pending','reviewed','legacy'));
ALTER TABLE public.news_desk_lessons ALTER COLUMN review_status SET DEFAULT 'pending';
ALTER TABLE public.news_desk_lessons ALTER COLUMN active SET DEFAULT false;
ALTER TABLE public.news_desk_items ADD COLUMN applied_rule_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.news_desk_items ADD COLUMN origin jsonb;

CREATE TABLE public.admin_training_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('news_evaluation','agg_generation')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed')),
  payload jsonb NOT NULL,
  result jsonb,
  error text,
  requested_by text NOT NULL,
  token uuid,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  review jsonb,
  review_version integer NOT NULL DEFAULT 0,
  reviewed_at timestamptz
);
CREATE INDEX admin_training_jobs_queue ON public.admin_training_jobs(status,created_at);
CREATE TABLE public.admin_training_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor text NOT NULL,
  kind text NOT NULL,
  target text NOT NULL,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agg_training_entries ADD COLUMN training_job_id uuid UNIQUE REFERENCES public.admin_training_jobs(id);
ALTER TABLE public.agg_training_entries ADD COLUMN applied_training_ids uuid[] NOT NULL DEFAULT '{}';

CREATE FUNCTION public.save_news_training_setting(p_version integer,p_enabled boolean,p_cap integer,p_limit integer,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old public.news_training_settings%ROWTYPE; next public.news_training_settings%ROWTYPE;
BEGIN
  SELECT * INTO old FROM public.news_training_settings WHERE id FOR UPDATE;
  IF old.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'settings changed' USING ERRCODE='40001'; END IF;
  UPDATE public.news_training_settings SET publish_enabled=p_enabled,per_run_cap=p_cap,daily_job_limit=p_limit,
    version=version+1,updated_at=now() WHERE id RETURNING * INTO next;
  INSERT INTO public.admin_training_audit(actor,kind,target,before_value,after_value)
    VALUES(p_actor,'settings','news',to_jsonb(old),to_jsonb(next));
  RETURN to_jsonb(next);
END $$;

CREATE FUNCTION public.save_news_editorial_rule(p_rule jsonb,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old public.news_editorial_rules%ROWTYPE; next public.news_editorial_rules%ROWTYPE; target uuid;
BEGIN
  -- Serialize rule updates so the active-rule budget cannot be exceeded concurrently.
  PERFORM 1 FROM public.news_training_settings WHERE id FOR UPDATE;
  target=COALESCE((p_rule->>'id')::uuid,gen_random_uuid());
  SELECT * INTO old FROM public.news_editorial_rules WHERE id=target FOR UPDATE;
  IF FOUND AND old.version IS DISTINCT FROM (p_rule->>'version')::integer THEN
    RAISE EXCEPTION 'rule changed' USING ERRCODE='40001';
  END IF;
  IF (p_rule->>'active')::boolean AND (SELECT count(*) FROM public.news_editorial_rules WHERE active AND id<>target)>=20 THEN
    RAISE EXCEPTION 'active rule limit is 20' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.news_editorial_rules(id,title,category,instruction,priority,active)
    VALUES(target,p_rule->>'title',p_rule->>'category',p_rule->>'instruction',(p_rule->>'priority')::integer,(p_rule->>'active')::boolean)
    ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,category=EXCLUDED.category,instruction=EXCLUDED.instruction,
      priority=EXCLUDED.priority,active=EXCLUDED.active,version=news_editorial_rules.version+1,updated_at=now()
    RETURNING * INTO next;
  INSERT INTO public.admin_training_audit(actor,kind,target,before_value,after_value)
    VALUES(p_actor,'rule',target::text,to_jsonb(old),to_jsonb(next));
  RETURN to_jsonb(next);
END $$;

CREATE FUNCTION public.save_news_notation_entry(p_entry jsonb,p_expected timestamptz,p_delete boolean,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old public.news_alias_dictionary%ROWTYPE; next public.news_alias_dictionary%ROWTYPE; target text; aliases text[]; other text;
BEGIN
  LOCK TABLE public.news_alias_dictionary IN SHARE ROW EXCLUSIVE MODE;
  target=COALESCE(p_entry->>'id','manual_'||gen_random_uuid()::text);
  SELECT * INTO old FROM public.news_alias_dictionary WHERE id=target;
  IF (FOUND AND old.updated_at IS DISTINCT FROM p_expected) OR (NOT FOUND AND p_expected IS NOT NULL) THEN
    RAISE EXCEPTION 'entry changed' USING ERRCODE='40001';
  END IF;
  IF p_delete THEN
    IF old.id IS NULL THEN RAISE EXCEPTION 'entry missing' USING ERRCODE='P0002'; END IF;
    DELETE FROM public.news_alias_dictionary WHERE id=target;
  ELSE
    IF length(trim(p_entry->>'preferred_ko')) NOT BETWEEN 1 AND 100 OR (p_entry->>'category') NOT IN ('player','coach','team','competition','media','term') THEN
      RAISE EXCEPTION 'invalid notation' USING ERRCODE='22023';
    END IF;
    SELECT COALESCE(array_agg(DISTINCT value),'{}') INTO aliases FROM jsonb_array_elements_text(p_entry->'surfaces');
    -- Prevent a new spelling from silently claiming another entity's existing name/alias.
    SELECT d.preferred_ko INTO other FROM public.news_alias_dictionary d
      WHERE d.id<>target AND (d.category=p_entry->>'category' OR (d.category IN ('player','coach') AND p_entry->>'category' IN ('player','coach')))
        AND EXISTS(SELECT 1 FROM unnest(aliases||ARRAY[p_entry->>'preferred_ko',p_entry->>'romanized']) proposed
          JOIN unnest(COALESCE(d.surfaces,'{}')||COALESCE(d.hangul_alts,'{}')||ARRAY[d.preferred_ko,d.romanized]) known ON lower(trim(proposed))=lower(trim(known))
          WHERE length(trim(proposed))>0
            AND NOT (old.id IS NOT NULL AND lower(trim(proposed)) IN
              (SELECT lower(trim(value)) FROM unnest(COALESCE(old.surfaces,'{}')||COALESCE(old.hangul_alts,'{}')||ARRAY[old.preferred_ko,old.romanized]) value)))
      LIMIT 1;
    IF other IS NOT NULL THEN RAISE EXCEPTION '별칭이 다른 항목과 겹칩니다: %',other USING ERRCODE='23505'; END IF;
    INSERT INTO public.news_alias_dictionary(id,category,preferred_ko,romanized,surfaces,hangul_alts,disambiguation,confidence,notes,given_name_ko,family_name_ko,short_name_ko)
      VALUES(target,p_entry->>'category',p_entry->>'preferred_ko',COALESCE(p_entry->>'romanized',''),aliases,
        ARRAY(SELECT value FROM unnest(aliases) value WHERE value ~ '[가-힣]'),p_entry->>'disambiguation',1,p_entry->>'notes',
        CASE WHEN p_entry->>'category' IN ('player','coach') THEN COALESCE(p_entry->>'given_name_ko','') ELSE '' END,
        CASE WHEN p_entry->>'category' IN ('player','coach') THEN COALESCE(p_entry->>'family_name_ko','') ELSE '' END,
        CASE WHEN p_entry->>'category' IN ('player','coach') THEN COALESCE(p_entry->>'short_name_ko','') ELSE '' END)
      ON CONFLICT(id) DO UPDATE SET category=EXCLUDED.category,preferred_ko=EXCLUDED.preferred_ko,romanized=EXCLUDED.romanized,
        surfaces=EXCLUDED.surfaces,hangul_alts=EXCLUDED.hangul_alts,disambiguation=EXCLUDED.disambiguation,confidence=1,notes=EXCLUDED.notes,
        given_name_ko=EXCLUDED.given_name_ko,family_name_ko=EXCLUDED.family_name_ko,short_name_ko=EXCLUDED.short_name_ko,updated_at=now()
      RETURNING * INTO next;
  END IF;
  INSERT INTO public.admin_training_audit(actor,kind,target,before_value,after_value)
    VALUES(p_actor,CASE WHEN p_delete THEN 'dictionary_delete' ELSE 'dictionary_save' END,target,to_jsonb(old),to_jsonb(next));
  RETURN jsonb_build_object('id',target);
END $$;

CREATE FUNCTION public.enqueue_admin_training(p_kind text,p_payload jsonb,p_actor text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg public.news_training_settings%ROWTYPE; target uuid;
BEGIN
  SELECT * INTO cfg FROM public.news_training_settings WHERE id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'training settings missing'; END IF;
  UPDATE public.admin_training_jobs SET status='failed',error='작업 시간이 초과됐습니다. 다시 실행해 주세요.',completed_at=now()
    WHERE (status='running' AND lease_until<now()) OR (status='queued' AND created_at<now()-interval '15 minutes');
  IF EXISTS(SELECT 1 FROM public.admin_training_jobs WHERE status IN ('queued','running')) THEN
    RAISE EXCEPTION '진행 중인 학습 작업이 있습니다.' USING ERRCODE='40001';
  END IF;
  IF (SELECT count(*) FROM public.admin_training_jobs WHERE created_at>=((now() AT TIME ZONE 'Asia/Seoul')::date::timestamp AT TIME ZONE 'Asia/Seoul'))>=cfg.daily_job_limit THEN
    RAISE EXCEPTION '오늘의 연습·평가 실행 한도에 도달했습니다.' USING ERRCODE='22023';
  END IF;
  IF p_kind='agg_generation' AND (SELECT count(*) FROM public.agg_training_entries WHERE status='pending')>=50 THEN
    RAISE EXCEPTION '커뮤니티 연습 대기 50건을 먼저 검수해 주세요.' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.admin_training_jobs(kind,payload,requested_by) VALUES(p_kind,p_payload,p_actor) RETURNING id INTO target;
  RETURN target;
END $$;
CREATE FUNCTION public.claim_admin_training(p_id uuid,p_token uuid)
RETURNS SETOF public.admin_training_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid;
BEGIN
  UPDATE public.admin_training_jobs SET status='failed',error='작업 시간이 초과됐습니다. 다시 실행해 주세요.',completed_at=now()
    WHERE status='running' AND lease_until<now();
  SELECT id INTO target FROM public.admin_training_jobs WHERE status='queued' AND (p_id IS NULL OR id=p_id)
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF target IS NULL THEN RETURN; END IF;
  RETURN QUERY UPDATE public.admin_training_jobs SET status='running',token=p_token,lease_until=now()+interval '5 minutes'
    WHERE id=target RETURNING *;
END $$;

ALTER TABLE public.news_training_settings ENABLE ROW LEVEL SECURITY;
-- Persist the generated community entry and successful job together, under the worker lease.
CREATE FUNCTION public.complete_admin_training(p_id uuid,p_token uuid,p_result jsonb,p_entry jsonb DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job public.admin_training_jobs%ROWTYPE; entry_id uuid; next_round integer;
BEGIN
  SELECT * INTO job FROM public.admin_training_jobs WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR job.status<>'running' OR job.token IS DISTINCT FROM p_token OR job.lease_until<=now() THEN RETURN false; END IF;
  IF job.kind='agg_generation' AND p_entry IS NOT NULL THEN
    LOCK TABLE public.agg_training_entries IN SHARE ROW EXCLUSIVE MODE;
    SELECT COALESCE(max(round),0)+1 INTO next_round FROM public.agg_training_entries;
    INSERT INTO public.agg_training_entries(round,source_title,category,body_excerpt,media,persona,structure,angle,ai_title,ai_body,training_job_id,applied_training_ids)
      VALUES(next_round,p_entry->>'source_title',p_entry->>'category',p_entry->>'body_excerpt',p_entry->'media',p_entry->>'persona',
        p_entry->>'structure',p_entry->>'angle',p_entry->>'ai_title',p_entry->>'ai_body',p_id,
        ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(p_entry->'applied_training_ids')))
      RETURNING id INTO entry_id;
    p_result=p_result||jsonb_build_object('entry_id',entry_id,'round',next_round);
  END IF;
  UPDATE public.admin_training_jobs SET status='completed',result=p_result,completed_at=now(),lease_until=NULL WHERE id=p_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.complete_admin_training(uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_admin_training(uuid,uuid,jsonb,jsonb) TO service_role;
ALTER TABLE public.news_editorial_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_training_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_training_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.news_training_settings,public.news_editorial_rules,public.admin_training_jobs,public.admin_training_audit FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.news_training_settings,public.news_editorial_rules,public.admin_training_jobs,public.admin_training_audit TO service_role;
REVOKE ALL ON FUNCTION public.save_news_training_setting(integer,boolean,integer,integer,text),public.save_news_editorial_rule(jsonb,text),public.save_news_notation_entry(jsonb,timestamptz,boolean,text),public.enqueue_admin_training(text,jsonb,text),public.claim_admin_training(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_news_training_setting(integer,boolean,integer,integer,text),public.save_news_editorial_rule(jsonb,text),public.save_news_notation_entry(jsonb,timestamptz,boolean,text),public.enqueue_admin_training(text,jsonb,text),public.claim_admin_training(uuid,uuid) TO service_role;

-- Open an actual article without regenerating it or modifying the public original.
CREATE FUNCTION public.import_news_desk_article(p_kind text,p_origin_id text,p_draft jsonb,p_sources jsonb,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid; origin_key text; inserted boolean;
BEGIN
  IF p_kind NOT IN ('post','draft') OR length(p_origin_id) NOT BETWEEN 1 AND 200
    OR length(trim(p_draft->>'title')) NOT BETWEEN 2 AND 300 OR length(trim(p_draft->>'article')) NOT BETWEEN 20 AND 8000
    OR jsonb_typeof(p_sources)<>'array' THEN RAISE EXCEPTION 'invalid article' USING ERRCODE='22023'; END IF;
  origin_key='live-'||p_kind||':'||p_origin_id;
  INSERT INTO public.news_desk_items(source_reservoir_id,status,generation_token,sources,original,draft,origin,generated_at)
    VALUES(origin_key,'drafted',gen_random_uuid(),p_sources,p_draft,p_draft,
      jsonb_build_object('kind',p_kind,'id',p_origin_id,'title',p_draft->>'title','imported_at',now()),now())
    ON CONFLICT(source_reservoir_id) DO NOTHING RETURNING id INTO target;
  inserted=FOUND;
  IF NOT inserted THEN UPDATE public.news_desk_items SET updated_at=now() WHERE source_reservoir_id=origin_key RETURNING id INTO target; END IF;
  IF inserted THEN
    INSERT INTO public.admin_training_audit(actor,kind,target,after_value) VALUES(p_actor,'article_import',target::text,jsonb_build_object('origin',origin_key));
  END IF;
  RETURN jsonb_build_object('id',target,'existing',NOT inserted);
END $$;

-- One row locks the roster spelling and article dictionary together. A failed row rolls back both.
CREATE FUNCTION public.save_player_naming_row(p_row jsonb,p_actor text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE squad public.team_squads%ROWTYPE; notation public.news_alias_dictionary%ROWTYPE;
  target text; matches integer; english text; team_context text; saved jsonb; aliases text[];
BEGIN
  LOCK TABLE public.news_alias_dictionary IN SHARE ROW EXCLUSIVE MODE;
  IF length(trim(p_row->>'name_kr')) NOT BETWEEN 1 AND 100 OR p_row->>'name_kr' !~ '[가-힣]' THEN
    RAISE EXCEPTION '한국어 이름을 입력해 주세요.' USING ERRCODE='22023';
  END IF;
  IF p_row->>'kind'='squad' THEN
    SELECT * INTO squad FROM public.team_squads WHERE soccerway_team_id=p_row->>'team_id' AND player_id=p_row->>'id' FOR UPDATE;
    IF NOT FOUND OR squad.status='left' THEN RAISE EXCEPTION '선수 정보를 다시 불러와 주세요.' USING ERRCODE='40001'; END IF;
    IF squad.updated_at IS DISTINCT FROM (p_row->>'expected')::timestamptz THEN RAISE EXCEPTION '다른 창에서 수정한 선수입니다. 입력을 보관하고 목록을 새로 불러와 주세요.' USING ERRCODE='40001'; END IF;
    english=squad.name_en;
    SELECT count(*),min(id) INTO matches,target FROM public.news_alias_dictionary
      WHERE category IN ('player','coach') AND (lower(trim(romanized))=lower(trim(english)) OR EXISTS(SELECT 1 FROM unnest(surfaces) surface WHERE lower(trim(surface))=lower(trim(english))));
    IF matches>1 THEN RAISE EXCEPTION '같은 원어 이름의 사전 항목이 여러 개입니다. 통합 사전에서 대상을 확인해 주세요.' USING ERRCODE='40001'; END IF;
    IF target IS NOT NULL THEN
      SELECT * INTO notation FROM public.news_alias_dictionary WHERE id=target;
      IF target IS DISTINCT FROM p_row->>'news_id' OR notation.updated_at IS DISTINCT FROM (p_row->>'news_expected')::timestamptz THEN
        RAISE EXCEPTION '기사 사전이 변경되었습니다. 입력을 보관하고 새 목록의 표기를 확인해 주세요.' USING ERRCODE='40001';
      END IF;
    ELSIF p_row->>'news_id' IS NOT NULL THEN
      RAISE EXCEPTION '연결된 기사 사전이 변경되었습니다. 목록을 다시 불러와 주세요.' USING ERRCODE='40001';
    END IF;
    SELECT concat_ws('|',name_en,name_kr) INTO team_context FROM public.team_dictionary WHERE soccerway_team_id=squad.soccerway_team_id;
  ELSIF p_row->>'kind'='dictionary' THEN
    SELECT * INTO notation FROM public.news_alias_dictionary WHERE id=p_row->>'id' AND category IN ('player','coach');
    IF NOT FOUND OR notation.updated_at IS DISTINCT FROM (p_row->>'expected')::timestamptz THEN RAISE EXCEPTION '다른 창에서 수정한 사전입니다. 입력을 보관하고 목록을 새로 불러와 주세요.' USING ERRCODE='40001'; END IF;
    target=notation.id; english=notation.romanized;
  ELSE RAISE EXCEPTION '잘못된 입력 대상입니다.' USING ERRCODE='22023'; END IF;
  SELECT array_agg(DISTINCT value) INTO aliases FROM unnest(COALESCE(notation.surfaces,'{}')||COALESCE(notation.hangul_alts,'{}')||ARRAY[english,trim(p_row->>'name_kr'),notation.preferred_ko]) value WHERE length(trim(value))>=2;
  saved=public.save_news_notation_entry(jsonb_strip_nulls(jsonb_build_object(
    'id',target,'category',COALESCE(notation.category,CASE WHEN squad.position='COACH' THEN 'coach' ELSE 'player' END),
    'preferred_ko',trim(p_row->>'name_kr'),'romanized',english,'surfaces',to_jsonb(aliases),
    'disambiguation',COALESCE(notation.disambiguation,team_context,''),'notes',COALESCE(notation.notes,'관리자 미완료 선수 작업표에서 확정'),
    'given_name_ko',COALESCE(p_row->>'given_name_ko',''),'family_name_ko',COALESCE(p_row->>'family_name_ko',''),'short_name_ko',COALESCE(p_row->>'short_name_ko',''))),
    notation.updated_at,false,p_actor);
  IF p_row->>'kind'='squad' THEN
    UPDATE public.team_squads SET name_kr=trim(p_row->>'name_kr'),status='confirmed',updated_at=now()
      WHERE soccerway_team_id=squad.soccerway_team_id AND player_id=squad.player_id;
    INSERT INTO public.admin_training_audit(actor,kind,target,before_value,after_value)
      VALUES(p_actor,'squad_name',squad.soccerway_team_id||':'||squad.player_id,to_jsonb(squad),jsonb_build_object('name_kr',trim(p_row->>'name_kr'),'news_id',saved->>'id'));
  END IF;
END $$;

CREATE FUNCTION public.save_player_naming_rows(p_rows jsonb,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb; saved jsonb='[]'; failed jsonb='[]';
BEGIN
  IF jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid rows' USING ERRCODE='22023'; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    BEGIN
      PERFORM public.save_player_naming_row(r,p_actor);
      saved=saved||jsonb_build_array(r->>'key');
    EXCEPTION WHEN OTHERS THEN
      failed=failed||jsonb_build_array(jsonb_build_object('key',r->>'key','error',CASE WHEN SQLSTATE IN ('40001','22023','23505') THEN SQLERRM ELSE '이 행을 저장하지 못했습니다. 입력을 유지하고 다시 시도해 주세요.' END));
    END;
  END LOOP;
  RETURN jsonb_build_object('saved',saved,'failed',failed);
END $$;

REVOKE ALL ON FUNCTION public.import_news_desk_article(text,text,jsonb,jsonb,text),public.save_player_naming_row(jsonb,text),public.save_player_naming_rows(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_news_desk_article(text,text,jsonb,jsonb,text),public.save_player_naming_row(jsonb,text),public.save_player_naming_rows(jsonb,text) TO service_role;

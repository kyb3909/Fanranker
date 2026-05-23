-- SECURITY DEFINER 함수 33개의 search_path 가 미고정 상태였다.
-- 미고정 시 호출 세션의 search_path 에 따라 함수가 의도치 않은 스키마의
-- 객체를 참조할 수 있다 (CVE-2018-1058 계열 search_path 하이재킹).
-- public, pg_temp 로 고정한다 (pg_temp 를 뒤에 둬 임시 객체 shadowing 차단).
--
-- 참고: 현재 anon/authenticated 롤에 public 스키마 CREATE 권한이 없어
-- 실제 악용은 불가능하나, Supabase 린터 권고에 따른 예방적 하드닝.

ALTER FUNCTION public.apply_flair_score(p_user_id text, p_flair_id uuid, p_delta integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.award_points(p_user_id text, p_board_slug text, p_amount integer, p_type text, p_description text, p_related_id text) SET search_path = public, pg_temp;
ALTER FUNCTION public.check_achievements(p_user_id text) SET search_path = public, pg_temp;
ALTER FUNCTION public.cleanup_expired_ticker_comments() SET search_path = public, pg_temp;
ALTER FUNCTION public.donate_flair_score_to_team(p_user_id text, p_flair_id uuid, p_amount integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_battle_participants(p_battle_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_battle_side_score(p_side_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_sticker_use(p_sticker_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_worldcup_win(p_candidate_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.metaverse_award_flair_karma(p_user_id text, p_team_id text, p_delta integer, p_source text) SET search_path = public, pg_temp;
ALTER FUNCTION public.metaverse_cleanup_empty_chat_rooms() SET search_path = public, pg_temp;
ALTER FUNCTION public.metaverse_create_chat_room(p_user_id text, p_plot_id uuid, p_sign_text text, p_cost integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.metaverse_equip_avatar(p_user_id text, p_avatar_key text) SET search_path = public, pg_temp;
ALTER FUNCTION public.metaverse_purchase_avatar(p_user_id text, p_avatar_key text) SET search_path = public, pg_temp;
ALTER FUNCTION public.metaverse_spend_activity_points(p_user_id text, p_amount integer, p_purpose text) SET search_path = public, pg_temp;
ALTER FUNCTION public.purchase_noun_title(p_user_id text, p_noun_title_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.purchase_sticker(p_user_id text, p_sticker_id uuid, p_board_slug text) SET search_path = public, pg_temp;
ALTER FUNCTION public.recalc_all_user_temperatures() SET search_path = public, pg_temp;
ALTER FUNCTION public.reset_expired_temperatures(days_old integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.reward_gold(p_user_id text, p_amount integer, p_description text, p_transaction_type text) SET search_path = public, pg_temp;
ALTER FUNCTION public.settle_predictions_by_round(p_gm_ts text) SET search_path = public, pg_temp;
ALTER FUNCTION public.settle_round(p_gm_ts text) SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_live_room_status() SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_post_vote_count() SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_stadium_contribution(p_user_id text, p_team_id text, p_new_points bigint) SET search_path = public, pg_temp;
ALTER FUNCTION public.trigger_update_user_temp_on_comment() SET search_path = public, pg_temp;
ALTER FUNCTION public.trigger_update_user_temp_on_post() SET search_path = public, pg_temp;
ALTER FUNCTION public.trigger_update_user_temp_on_vote() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_post_last_comment_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_stadium_fan_counts() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_temp_after_comment() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_temp_after_vote() SET search_path = public, pg_temp;
ALTER FUNCTION public.vote_sticker(p_sticker_id uuid, p_user_id text) SET search_path = public, pg_temp;

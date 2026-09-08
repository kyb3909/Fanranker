-- SECURITY DEFINER RPC 노출 차단 (2026-09-08, security-gauntlet Round 1 · Finding #1)
--
-- ## 무엇이 문제였나
-- SECURITY DEFINER 함수 51개가 `authenticated`(+ PUBLIC 경유 anon)에게 EXECUTE 가 열려 있어
-- `<project>.supabase.co/rest/v1/rpc/<fn>` 로 **직접** 호출 가능했다. 브라우저 클라이언트는
-- publishable(anon) 키 + Clerk 세션 토큰(role=authenticated)을 붙여(lib/supabase/client.ts
-- createAuthClient) PostgREST 를 직접 때리므로, 이 경로는 Next 미들웨어(rate-limit/admin
-- guard)와 route handler 의 모든 앱단 검증을 **통째로 우회**한다.
--
-- 이 함수들은 신원을 auth.jwt() 에서 유도하지 않고 인자(p_user_id 등)로 받으며 그대로 신뢰한다.
-- 따라서 로그인한 아무 유저나 다음을 할 수 있었다 (BOLA / 권한·경제 조작):
--   · apply_flair_score(<임의 user>, <flair>, 999999999)     → flair 점수·기부잔액 무한 + 전 호칭 언락
--   · sync_stadium_contribution(<나>, <팀>, 9999999999)       → 경기장 포인트 임의 세팅(최고레벨·1위 기여자)
--   · metaverse_create_chat_room(..., p_cost => 1)           → 정가 100 우회, 방 헐값 생성
--   · vote_sticker(<sticker>, <가짜 user_id 다수>)            → 표 채워 스티커 자동승인(검수 우회)
--   · metaverse_equip_avatar(<남의 user>, <key>)             → 타인 프로필 아바타 변경(그리핑)
--   · betman_update_sync_state(<임의 gm_ts>)                  → 베팅 라운드 포인터 오염
--   · recalc_all_user_temperatures() / cleanup_* 등           → 무단 유지보수 트리거(부하)
--
-- ## 근본 수정 (심층 방어)
-- 이 함수들의 **모든** 앱 호출부는 서버(service_role, createServiceRoleClient) 또는 DB 트리거
-- (owner 컨텍스트)다 — 브라우저에서 부르는 곳은 없다(전수 확인). 따라서 anon/authenticated/PUBLIC
-- 에서 EXECUTE 를 회수하고 service_role 에만 부여하면 REST RPC 표면이 닫히면서 서버·트리거 경로는
-- 그대로 동작한다. 앱단(route handler)의 인증·소유권 검증은 유지된다 — 이건 DB단 한 겹을 더 얹는 것.
--
-- ⚠️ REVOKE ... FROM anon 만으로는 no-op 다 — 권한이 PUBLIC 에 붙어 있으면 anon 은 PUBLIC 으로
--    여전히 실행된다(메모 gotchas_supabase_verification / 20260904b 와 동일 함정). PUBLIC 을 함께 회수한다.
-- ⚠️ PUBLIC 회수 시 service_role 도 PUBLIC 경유 권한을 잃으므로 직접 호출 함수는 service_role 재부여 필수.
--
-- ## 의도적으로 anon 유지 (회수 대상 아님 — 운영자 결정 20260728 / 20260904b)
--   · increment_post_view_count — /api/posts/[id]/view 가 비로그인 조회수용으로 anon 클라로 부른다.
--   · stadium_bricks_today      — /stadium 페이지 공개 집계를 anon 클라로 부른다.
--   (조회수 dedup 우회는 알려진 저위험 수용 항목 — 이 마이그레이션에서 건드리지 않는다.)

-- ── ① anon/authenticated/PUBLIC 에서 EXECUTE 회수 (51개) ──
revoke execute on function public.apply_flair_score(p_user_id text, p_flair_id uuid, p_delta integer) from public, anon, authenticated;
revoke execute on function public.audit_gold_balance_change() from public, anon, authenticated;
revoke execute on function public.betman_check_sync_health() from public, anon, authenticated;
revoke execute on function public.betman_update_sync_state(new_gm_ts text) from public, anon, authenticated;
revoke execute on function public.can_increment_view_count(post_id_param uuid, ip_address_param text) from public, anon, authenticated;
revoke execute on function public.can_post_comment(user_id_param text) from public, anon, authenticated;
revoke execute on function public.check_achievements(p_user_id text) from public, anon, authenticated;
revoke execute on function public.check_prediction_allowed() from public, anon, authenticated;
revoke execute on function public.cleanup_expired_ticker_comments() from public, anon, authenticated;
revoke execute on function public.cleanup_old_ticker_items() from public, anon, authenticated;
revoke execute on function public.decrement_comment_count_on_delete() from public, anon, authenticated;
revoke execute on function public.enqueue_temp_on_post_vote() from public, anon, authenticated;
revoke execute on function public.get_league_id_by_alias(p_alias text, p_source text) from public, anon, authenticated;
revoke execute on function public.get_team_id_by_alias(p_alias text, p_source text) from public, anon, authenticated;
revoke execute on function public.increment_battle_participants(p_battle_id uuid) from public, anon, authenticated;
revoke execute on function public.increment_battle_side_score(p_side_id uuid) from public, anon, authenticated;
revoke execute on function public.increment_comment_count_on_insert() from public, anon, authenticated;
revoke execute on function public.increment_pending_predictions() from public, anon, authenticated;
revoke execute on function public.increment_post_comment_count(post_id_param uuid) from public, anon, authenticated;
revoke execute on function public.increment_prediction_count(match_id_param text) from public, anon, authenticated;
revoke execute on function public.increment_sticker_use(p_sticker_id uuid) from public, anon, authenticated;
revoke execute on function public.increment_worldcup_win(p_candidate_id uuid) from public, anon, authenticated;
revoke execute on function public.init_user_prediction_stats() from public, anon, authenticated;
revoke execute on function public.metaverse_cleanup_empty_chat_rooms() from public, anon, authenticated;
revoke execute on function public.metaverse_create_chat_room(p_user_id text, p_plot_id uuid, p_sign_text text, p_cost integer) from public, anon, authenticated;
revoke execute on function public.metaverse_equip_avatar(p_user_id text, p_avatar_key text) from public, anon, authenticated;
revoke execute on function public.recalc_all_user_temperatures() from public, anon, authenticated;
revoke execute on function public.recalc_user_sport_stats(p_user_id text) from public, anon, authenticated;
revoke execute on function public.recalculate_all_comment_counts() from public, anon, authenticated;
revoke execute on function public.recalculate_post_comment_count(post_id_param uuid) from public, anon, authenticated;
revoke execute on function public.reset_expired_temperatures(days_old integer) from public, anon, authenticated;
revoke execute on function public.set_comment_path() from public, anon, authenticated;
revoke execute on function public.sync_category_from_slug() from public, anon, authenticated;
revoke execute on function public.sync_commission_used_slots() from public, anon, authenticated;
revoke execute on function public.sync_live_room_status() from public, anon, authenticated;
revoke execute on function public.sync_stadium_contribution(p_user_id text, p_team_id text, p_new_points bigint) from public, anon, authenticated;
revoke execute on function public.trigger_update_user_temp_on_comment() from public, anon, authenticated;
revoke execute on function public.trigger_update_user_temp_on_post() from public, anon, authenticated;
revoke execute on function public.trigger_update_user_temp_on_vote() from public, anon, authenticated;
revoke execute on function public.update_active_rounds() from public, anon, authenticated;
revoke execute on function public.update_comment_cooldown(user_id_param text) from public, anon, authenticated;
revoke execute on function public.update_match_prediction_count() from public, anon, authenticated;
revoke execute on function public.update_post_comment_count() from public, anon, authenticated;
revoke execute on function public.update_post_last_comment_at() from public, anon, authenticated;
revoke execute on function public.update_stadium_fan_counts() from public, anon, authenticated;
revoke execute on function public.update_temp_after_comment() from public, anon, authenticated;
revoke execute on function public.update_temp_after_vote() from public, anon, authenticated;
revoke execute on function public.update_updated_at_column() from public, anon, authenticated;
revoke execute on function public.update_user_stats_on_settlement() from public, anon, authenticated;
revoke execute on function public.update_vote_count() from public, anon, authenticated;
revoke execute on function public.vote_sticker(p_sticker_id uuid, p_user_id text) from public, anon, authenticated;

-- ── ② 서버가 직접 부르는 함수는 service_role 에 EXECUTE 재부여 (PUBLIC 회수로 잃지 않게) ──
--    (트리거 전용 함수는 owner 컨텍스트로 실행되므로 재부여 불필요 — 여기 없음.)
grant execute on function public.apply_flair_score(p_user_id text, p_flair_id uuid, p_delta integer) to service_role;
grant execute on function public.betman_check_sync_health() to service_role;
grant execute on function public.betman_update_sync_state(new_gm_ts text) to service_role;
grant execute on function public.can_increment_view_count(post_id_param uuid, ip_address_param text) to service_role;
grant execute on function public.can_post_comment(user_id_param text) to service_role;
grant execute on function public.check_achievements(p_user_id text) to service_role;
grant execute on function public.cleanup_expired_ticker_comments() to service_role;
grant execute on function public.cleanup_old_ticker_items() to service_role;
grant execute on function public.get_league_id_by_alias(p_alias text, p_source text) to service_role;
grant execute on function public.get_team_id_by_alias(p_alias text, p_source text) to service_role;
grant execute on function public.increment_battle_participants(p_battle_id uuid) to service_role;
grant execute on function public.increment_battle_side_score(p_side_id uuid) to service_role;
grant execute on function public.increment_post_comment_count(post_id_param uuid) to service_role;
grant execute on function public.increment_prediction_count(match_id_param text) to service_role;
grant execute on function public.increment_sticker_use(p_sticker_id uuid) to service_role;
grant execute on function public.increment_worldcup_win(p_candidate_id uuid) to service_role;
grant execute on function public.metaverse_cleanup_empty_chat_rooms() to service_role;
grant execute on function public.metaverse_create_chat_room(p_user_id text, p_plot_id uuid, p_sign_text text, p_cost integer) to service_role;
grant execute on function public.metaverse_equip_avatar(p_user_id text, p_avatar_key text) to service_role;
grant execute on function public.recalc_all_user_temperatures() to service_role;
grant execute on function public.recalc_user_sport_stats(p_user_id text) to service_role;
grant execute on function public.recalculate_all_comment_counts() to service_role;
grant execute on function public.recalculate_post_comment_count(post_id_param uuid) to service_role;
grant execute on function public.reset_expired_temperatures(days_old integer) to service_role;
grant execute on function public.sync_live_room_status() to service_role;
grant execute on function public.sync_stadium_contribution(p_user_id text, p_team_id text, p_new_points bigint) to service_role;
grant execute on function public.update_active_rounds() to service_role;
grant execute on function public.update_comment_cooldown(user_id_param text) to service_role;
grant execute on function public.update_stadium_fan_counts() to service_role;
grant execute on function public.vote_sticker(p_sticker_id uuid, p_user_id text) to service_role;

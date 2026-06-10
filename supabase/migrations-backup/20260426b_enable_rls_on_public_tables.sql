-- ============================================================
-- Supabase advisor 경고 일괄 해소
-- ------------------------------------------------------------
-- 1) Public 테이블 8개에 RLS 활성화 (모두 server-side / service role 만 사용)
-- 2) news_reservoir_queue_lengths 뷰를 SECURITY INVOKER 로 전환
--
-- 모든 ALTER TABLE ... ENABLE RLS 는 이미 켜진 경우 no-op (idempotent).
-- ============================================================

-- 1) RLS 일괄 활성화
ALTER TABLE user_cards            ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_suspensions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_personas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_actions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_test_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_flags         ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction_slips      ENABLE ROW LEVEL SECURITY;

-- 정책 명시 안 함 = service role(BYPASSRLS) 외 anon/authenticated 모두 차단.
--
-- 운영 코드 매핑 (모두 service role 호출):
--   user_cards:         app/api/admin/content/reports/route.ts
--   user_suspensions:   lib/check-suspension.ts, admin/content/reports
--   agent_personas:     data/agent-test/runner.js (newsroom)
--   agent_runs:         data/agent-test/runner.js (newsroom)
--   agent_actions:      data/agent-test/runner.js (newsroom)
--   feature_test_logs:  data/agent-test/runner.js (newsroom)
--   content_flags:      data/agent-test/runner.js (newsroom)
--   prediction_slips:   lib/betman/*, app/api/betman/*, app/api/admin/stats

-- 2) View security model: SECURITY DEFINER → SECURITY INVOKER
-- 기존 뷰는 view 생성자 권한으로 동작 (RLS 우회 위험).
-- security_invoker = on 으로 두면 query 호출자 권한 + RLS 가 적용됨.
ALTER VIEW news_reservoir_queue_lengths SET (security_invoker = on);

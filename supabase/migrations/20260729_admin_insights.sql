-- 운영 인사이트 — GA4 + 내부 지표를 LLM 이 읽고 "무엇을 주목하고 무엇을 할지" 낸 결과.
--
-- 기존 weekly_analytics_reports.summary 는 숫자를 나열한 템플릿 문자열이라
-- ("주간 활성 유저 43명 … 참여율 2.3%") 신호를 못 짚어준다. 실제로 월드컵 이벤트
-- 종료 후 예측 참여가 58%→2% 로 붕괴했는데 그 요약문은 그냥 "2.3%" 라고만 적었다.
-- 그 판단을 대신하는 결과물을 따로 보관한다.
--
-- input_snapshot 을 함께 남기는 이유: 나중에 "왜 이런 말을 했지?" 를 재현할 수 있어야
-- 인사이트를 신뢰할지 판단할 수 있다.

CREATE TABLE IF NOT EXISTS admin_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 분석 대상 기간 (GA4 주간 리포트 기준)
  period_start date NOT NULL,
  period_end date NOT NULL,
  -- LLM 이 받은 입력 원본 (재현·검증용)
  input_snapshot jsonb NOT NULL,
  -- { headline, watch: [...], actions: [...], noise: [...] }
  insight jsonb NOT NULL,
  model text NOT NULL,
  -- 'manual' | 'cron'
  generated_by text NOT NULL DEFAULT 'manual',
  generation_duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_insights_created_idx ON admin_insights (created_at DESC);

-- 서비스 롤(관리자 API)로만 접근한다. 익명·일반 유저 접근 차단.
ALTER TABLE admin_insights ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_insights FROM PUBLIC;

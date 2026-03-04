CREATE TABLE weekly_analytics_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  report_data jsonb NOT NULL DEFAULT '{}',
  summary text,
  generated_by text NOT NULL DEFAULT 'cron',
  generated_at timestamptz NOT NULL DEFAULT now(),
  generation_duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_weekly_period UNIQUE (period_start, period_end)
);

ALTER TABLE weekly_analytics_reports ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_weekly_analytics_period ON weekly_analytics_reports (period_start DESC);

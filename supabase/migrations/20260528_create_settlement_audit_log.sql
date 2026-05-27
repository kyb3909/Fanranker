-- ─────────────────────────────────────────────────────────────────
-- 정산 기록부 (settlement_audit_log)
-- ─────────────────────────────────────────────────────────────────
--
-- 목적:
--   모든 정산·환불·취소·역연산 이벤트를 한 줄씩 기록한다.
--   사고 발생 시 5분 안에 root cause 추적 가능.
--
-- 사용 예 (사용자 분쟁):
--   사용자가 "내 슬립 왜 정산 안 됐어요?" 라고 신고
--   → SELECT * FROM settlement_audit_log
--     WHERE slip_id = '...' ORDER BY called_at;
--   → 시도들의 시계열 + 각 시도의 before/after 상태 즉시 확인
--
-- 관련 PRD: docs/PRD-betting-integrity.md (Phase 1, Section 4.1)
-- 모델: "토큰 in / 점수 out" — 적중자 토큰 지급 없음 (Section 0)
--
-- 이 마이그레이션은 audit 테이블만 생성한다. INSERT 호출 로직은
-- 다음 단계 (lib/betman/settle.ts 의 audit hook) 에서 추가.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.settlement_audit_log (
  -- 자동 증가 PK
  id              BIGSERIAL PRIMARY KEY,

  -- 이벤트 발생 시점
  called_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 누가 호출했는지
  -- 예: 'cron:settle' | 'cron:fetch-results' | 'admin:user_xxxx'
  actor           TEXT NOT NULL,

  -- 이벤트 종류
  -- 'settle_prediction' : 개별 예측 정산 (status=pending → settled/cancelled)
  -- 'settle_slip'       : 슬립 정산 (status=pending → won/lost/cancelled)
  -- 'refund'            : 환불 (refund_tokens 호출)
  -- 'cancel'            : 경기/슬립 취소
  -- 'manual_reverse'    : 관리자 수동 역연산 (Phase 3)
  event_type      TEXT NOT NULL,

  -- 관련 ID들 (event_type 에 따라 NULL 가능)
  game_id         UUID REFERENCES public.betman_games(id) ON DELETE SET NULL,
  slip_id         UUID,         -- prediction_slips(id) FK 는 안 둠 (slip 이 삭제돼도 audit 유지)
  prediction_id   UUID,         -- betman_predictions(id) FK 도 안 둠
  user_id         TEXT,         -- Clerk user_id

  -- 변경 전/후 상태 — JSONB 로 어떤 row 든 유연하게 저장
  -- 예: {"status": "pending", "is_correct": null, "points_earned": null}
  --     {"status": "settled", "is_correct": true, "points_earned": 2.50}
  before_state    JSONB NOT NULL,
  after_state     JSONB NOT NULL,

  -- 토큰 변동량 (양수=지급, 음수=차감, NULL=변동 없음)
  -- "토큰 in / 점수 out" 모델이므로 settle_prediction/settle_slip 은 보통 NULL.
  -- refund 만 양수, cancel 도 환불 동반 시 양수.
  amount          NUMERIC,

  -- 자유 텍스트 이유 (왜 이 이벤트가 일어났는지)
  -- 예: "결과: home_win", "경기 취소 환불", "수동 정산 (관리자 검토 후)"
  reason          TEXT,

  -- 호출 RPC 명 (디버깅용, 어떤 함수가 audit log 를 남겼는지)
  rpc_name        TEXT
);

-- ─────────────────────────────────────────────────────────────────
-- 인덱스 — 검색 패턴별
-- ─────────────────────────────────────────────────────────────────

-- 게임별 시계열 (가장 흔한 패턴)
CREATE INDEX IF NOT EXISTS idx_settlement_audit_game
  ON public.settlement_audit_log (game_id, called_at DESC);

-- 슬립별 시계열 (사용자 분쟁 시 빠르게 검색)
CREATE INDEX IF NOT EXISTS idx_settlement_audit_slip
  ON public.settlement_audit_log (slip_id, called_at DESC)
  WHERE slip_id IS NOT NULL;

-- 사용자별 시계열 (사용자별 정산 이력)
CREATE INDEX IF NOT EXISTS idx_settlement_audit_user
  ON public.settlement_audit_log (user_id, called_at DESC)
  WHERE user_id IS NOT NULL;

-- 이벤트 타입별 (집계용)
CREATE INDEX IF NOT EXISTS idx_settlement_audit_event
  ON public.settlement_audit_log (event_type, called_at DESC);

-- 시간 순회 (cron 으로 일일 집계 시)
CREATE INDEX IF NOT EXISTS idx_settlement_audit_called
  ON public.settlement_audit_log (called_at DESC);

-- ─────────────────────────────────────────────────────────────────
-- 테이블/컬럼 코멘트 (DB 레벨 문서화)
-- ─────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.settlement_audit_log IS
  '정산 이벤트 추적 로그. settle/refund/cancel/reverse 시 한 줄씩 INSERT. PRD: docs/PRD-betting-integrity.md';

COMMENT ON COLUMN public.settlement_audit_log.actor IS
  '호출자 — cron:settle | cron:fetch-results | admin:user_xxxx';

COMMENT ON COLUMN public.settlement_audit_log.event_type IS
  'settle_prediction | settle_slip | refund | cancel | manual_reverse';

COMMENT ON COLUMN public.settlement_audit_log.before_state IS
  '변경 전 row snapshot (JSONB) — 사고 시 정확한 reverse 에 사용';

COMMENT ON COLUMN public.settlement_audit_log.after_state IS
  '변경 후 row snapshot (JSONB)';

COMMENT ON COLUMN public.settlement_audit_log.amount IS
  '토큰 변동량 (양수=지급, 음수=차감, NULL=변동 없음). 정산 자체는 보통 NULL, refund 만 양수';

-- ─────────────────────────────────────────────────────────────────
-- RLS — 관리자만 SELECT 가능
-- ─────────────────────────────────────────────────────────────────
-- INSERT 는 service role 만 (cron + admin API). 일반 클라이언트는 차단.
-- service role 은 RLS 자동 우회.

ALTER TABLE public.settlement_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin only select on settlement_audit_log"
  ON public.settlement_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = (auth.jwt() ->> 'sub')
        AND profiles.is_admin = true
    )
  );

-- 일반 사용자 INSERT/UPDATE/DELETE 차단 (policy 미생성 = 차단)

-- ─────────────────────────────────────────────────────────────────
-- 회귀 안전성
-- ─────────────────────────────────────────────────────────────────
-- 이 마이그레이션은 100% 추가 (additive). 기존 테이블/함수/RLS 미수정.
-- 롤백: DROP TABLE public.settlement_audit_log CASCADE;
-- 이전 정산은 audit log 에 기록되지 않음 (소급 적용 X).
-- 신규 정산부터 기록되며, 다음 단계 (settle.ts 의 audit hook 추가) 가 적용된 후부터.

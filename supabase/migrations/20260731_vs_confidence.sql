-- VS 쟁점 신뢰도 + 끈 이유 (2026-07-31, 3인 회의 VS-RESULT.md 스펙)
--
-- confidence: LLM 의 "이 기사에 찬반이 갈릴 지점이 있는가" 판정 신뢰도 (0~1).
--   >= 0.7 → 기본 켜짐(is_active=true) / 0.4~0.7 → 제안 상태(is_active=false,
--   검수에서 1클릭 켜기 가능) / < 0.4 → 생성 안 함.
--   임계값은 가설 — 2주 실측(투표율 차이)으로 교체 예정.
-- off_reason: 운영자/정리 작업이 끈 이유 라벨 — 기각 few-shot 학습셋의 원재료.
--   fact_only | boilerplate_transfer | awkward_wording | no_conflict
-- 켜짐/꺼짐 자체는 기존 is_active 재사용 (별도 상태머신 없음 — 회의 결정).

ALTER TABLE public.polls
  ADD COLUMN IF NOT EXISTS confidence numeric,
  ADD COLUMN IF NOT EXISTS off_reason text;

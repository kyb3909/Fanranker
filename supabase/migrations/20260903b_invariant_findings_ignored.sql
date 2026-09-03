-- invariant_findings.status 에 'ignored' 허용 (2026-09-03)
-- 운영자가 "위반 아님" 으로 판정한 지문(정상 후속 기사의 중복 의심쌍 등)을 매시 재알림에서 빼기 위한 값.
-- invariant-audit 는 ignored 지문을 다시 열지도, 디스코드로 알리지도 않는다.
alter table public.invariant_findings drop constraint if exists invariant_findings_status_check;
alter table public.invariant_findings add constraint invariant_findings_status_check
  check (status = any (array['open'::text, 'resolved'::text, 'ignored'::text]));

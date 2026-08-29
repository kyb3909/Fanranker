-- 교차검증 사유 메모 (2026-08-30b)
--
-- 검증이 2겹이 되면서 (① 스코어 LFA×와이즈토토 ② result 필드 ↔ 검증 스코어 재계산)
-- mismatch 가 "뭐가" 어긋난 건지 구분이 필요해졌다. 운영자가 원장만 보고
-- 스코어 문제인지 result(공식 적특) 문제인지 알 수 있게 사유를 남긴다.
--
-- 배경 (운영자 지적): 정산은 result 필드로 지급하는데, result 는 betman.co.kr
-- 크롤이 채운다 — 스코어만 검증하면 정산이 실제로 읽는 값이 검증 밖이었다.

alter table betman_result_checks add column if not exists note text;

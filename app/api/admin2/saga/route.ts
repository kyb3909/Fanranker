/**
 * 구 경로 위임 (2026-08-08 감사 P1-6) — 정본은 /api/admin/saga-review.
 * "사가 검수 API가 폐기 대상 admin2에 있다"는 경로-정책 불일치 해소. 전환기
 * 호환용 얇은 재수출만 남김 — admin2 정리 시 이 파일째 삭제하면 된다.
 */
export { GET, POST, dynamic, maxDuration } from "@/app/api/admin/saga-review/route"

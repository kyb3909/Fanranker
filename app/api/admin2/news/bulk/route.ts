/**
 * 구 경로 위임 (2026-08-08 감사 P1-6) — 정본은 /api/admin/news-review/bulk.
 * admin2 폐기 결정(2026-08-04) 후에도 정본 검수 화면이 이 경로를 호출하고 있어
 * 로직을 정본 트리로 이전했다. 전환기 호환(배포 시차·북마크)용 얇은 재수출만 남김 —
 * admin2 정리 시 이 파일째 삭제하면 된다.
 */
export { POST, dynamic } from "@/app/api/admin/news-review/bulk/route"

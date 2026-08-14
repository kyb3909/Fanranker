import { redirect } from "next/navigation"

/**
 * /event/gunners-season → /season 통합 리다이렉트 (2026-08-14 3인 토의).
 *
 * 레이스 허브가 두 곳이면 순위·귀속·재방문 습관이 갈라진다 — /season 이 유일한
 * 이벤트 홈이다 (신청 전 세일즈 ↔ 신청 후 허브를 상태로 전환). 이 URL 은 이미
 * 모달·밴드에 태워 보낸 링크가 있을 수 있어 라우트만 남기고 넘긴다.
 * 랭킹 패널은 standing-panel.tsx 를 /season 에서 import 해 재사용.
 */
export default function GunnersSeasonRedirect() {
  redirect("/season?ref=legacy-hub")
}

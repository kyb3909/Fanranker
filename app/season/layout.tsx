import { redirect } from "next/navigation"
import "../worldcup/wc-tokens.css"

/**
 * 시즌 오픈 팬덤 대항전 layout — 월드컵 디자인 토큰(wc-*) 재사용.
 * 헤더/푸터는 root layout 담당. .worldcup-scope 로 토큰 스코프만 격리.
 */
export default function SeasonLayout({ children }: { children: React.ReactNode }) {
  // ── 이벤트 페이지 폐쇄 (2026-09-02 운영자: "승부예측 이벤트 페이지도 모두 닫아놓고") ──
  // DB events.status='closed' + GUNNERS_SEASON.open=false 로 참가·귀속은 이미 막혀 있었지만
  // 페이지는 "종료" 상태로 계속 떠 있었다. /worldcup/layout.tsx 와 같은 방식 — layout 한 줄로
  // 하위 전부(/season · join · big4 · results)를 내린다. 코드·데이터는 보존.
  // 복원하려면 이 redirect 한 줄만 제거하고, GNB·탭바·홈 프리뷰의 승부예측 href 를
  // /prediction → /season 으로 되돌린다 (lib/event/gunners-season.ts 킬스위치 주석 참조).
  redirect("/prediction")

  return <div className="worldcup-scope">{children}</div>
}

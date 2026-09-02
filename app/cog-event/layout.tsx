import { redirect } from "next/navigation"
import "../worldcup/wc-tokens.css"

/**
 * 코그 시청자 팬덤 대결 layout — 월드컵 디자인 토큰(wc-*) 재사용.
 * app/season/layout.tsx 와 동일 패턴. 헤더/푸터는 root layout 담당,
 * 여기서는 .worldcup-scope 로 토큰 스코프만 연다 (--wc-* 는 이 클래스 안에서만 유효).
 */
export default function CogEventLayout({ children }: { children: React.ReactNode }) {
  // ── 이벤트 페이지 폐쇄 (2026-09-02 운영자: "승부예측 이벤트 페이지도 모두 닫아놓고") ──
  // events(cog-duel-2026).status='closed'. 제휴가 성사되면 이 한 줄을 제거하고
  // status 를 'open' 으로 — ?preview=1 미리보기도 그때까지 같이 닫힌다.
  redirect("/prediction")

  return <div className="worldcup-scope">{children}</div>
}

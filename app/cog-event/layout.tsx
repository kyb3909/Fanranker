import "../worldcup/wc-tokens.css"

/**
 * 코그 시청자 팬덤 대결 layout — 월드컵 디자인 토큰(wc-*) 재사용.
 * app/season/layout.tsx 와 동일 패턴. 헤더/푸터는 root layout 담당,
 * 여기서는 .worldcup-scope 로 토큰 스코프만 연다 (--wc-* 는 이 클래스 안에서만 유효).
 */
export default function CogEventLayout({ children }: { children: React.ReactNode }) {
  return <div className="worldcup-scope">{children}</div>
}

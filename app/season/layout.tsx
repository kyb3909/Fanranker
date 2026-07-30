import "../worldcup/wc-tokens.css"

/**
 * 시즌 오픈 팬덤 대항전 layout — 월드컵 디자인 토큰(wc-*) 재사용.
 * 헤더/푸터는 root layout 담당. .worldcup-scope 로 토큰 스코프만 격리.
 */
export default function SeasonLayout({ children }: { children: React.ReactNode }) {
  return <div className="worldcup-scope">{children}</div>
}

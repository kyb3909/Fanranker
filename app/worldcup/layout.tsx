import "./wc-tokens.css"

/**
 * 월드컵 이벤트 페이지 layout — 디자인 토큰 격리.
 *
 * 헤더/푸터/공통 사이드바는 root layout에서 처리되므로 영향 없음.
 * 여기는 메인 콘텐츠 영역에만 .worldcup-scope wrapper 추가해서
 * --wc-* CSS 변수가 이 트리 안에서만 유효하게 만든다.
 */
export default function WorldcupLayout({ children }: { children: React.ReactNode }) {
  return <div className="worldcup-scope">{children}</div>
}

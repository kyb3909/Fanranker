import { redirect } from "next/navigation"
import "./wc-tokens.css"

/**
 * 월드컵 이벤트 페이지 layout — 디자인 토큰 격리.
 *
 * 헤더/푸터/공통 사이드바는 root layout에서 처리되므로 영향 없음.
 * 여기는 메인 콘텐츠 영역에만 .worldcup-scope wrapper 추가해서
 * --wc-* CSS 변수가 이 트리 안에서만 유효하게 만든다.
 */
export default function WorldcupLayout({ children }: { children: React.ReactNode }) {
  // ── 이벤트 아카이브 비공개 (2026-07-29, 카카오 비즈앱 심사 대비) ──
  // 1차 월드컵 이벤트(2026-07-19 종료·당첨 안내 완료)는 경품이 예측 성적 순위에
  // 직결되는 구성이라 현행 약관 제6조의2(경품 = 활동 기준 추첨)와 어긋난다.
  // 문구만 고치면 과거 이벤트 기록을 왜곡하는 꼴이라, 세그먼트 전체를 내린다.
  // layout 단일 redirect = 하위 7개 라우트(games/leaderboard/my-predictions/
  // register/register/done/result 포함) 일괄 차단. 코드·데이터는 보존(아카이브).
  // 복원하려면 이 redirect 한 줄만 제거.
  redirect("/prediction")

  return <div className="worldcup-scope">{children}</div>
}

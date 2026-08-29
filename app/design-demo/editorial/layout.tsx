import type { Metadata } from "next"
import { Noto_Serif_KR } from "next/font/google"
import "./editorial.css"

/**
 * 에디토리얼 시안 — 읽는 지면 전용 명조.
 *
 * 이 레이아웃 안에서만 로드한다. 전역 body 로 올리지 않는다 (아트디렉션 1번 금지항목).
 * next/font 는 빌드 시점에 자체 호스팅하므로 CSP font-src 를 건드리지 않는다.
 *
 * ⚠️ **이 로딩 방식은 시안 전용이다. 프로덕션으로 그대로 올리지 말 것.**
 *    구현 조사 실측: Google 배포본은 @font-face 124개로 쪼개져 있고, 447자짜리
 *    한국어 기사 하나가 14청크 · 284KB 를 늦게 받아온다(한글은 next/font 의
 *    subsets 에 못 넣어 preload 힌트도 안 붙는다). 2,000자급이면 25~45청크 · 최대 1MB.
 *    본문이 폴백 명조로 그려졌다가 청크가 오는 대로 조각조각 다시 그려진다.
 *
 *    여기서는 **서체 얼굴을 정확히 보여주는 것**이 목적이라 감수한다(로컬 dev 전용,
 *    프로덕션에서는 app/design-demo 가 통째로 404).
 *    방향이 확정되면 pyftsubset 으로 KS X 1001 서브셋 woff2 단일 파일(≈175KB, 요청 1건)을
 *    만들어 layout.tsx 의 localFont 로 승격하고, adjustFontFallback: "Times New Roman"
 *    으로 CLS 를 막는다.
 */
const notoSerifKr = Noto_Serif_KR({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-prose",
  display: "swap",
  preload: false,
})

export const metadata: Metadata = {
  title: "에디토리얼 시안",
  robots: { index: false, follow: false },
}

export default function EditorialDemoLayout({ children }: { children: React.ReactNode }) {
  return <div className={`ed-scope ${notoSerifKr.variable}`}>{children}</div>
}

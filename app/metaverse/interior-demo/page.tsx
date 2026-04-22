import { SideScrollerDemo } from "@/components/metaverse/side-scroller-demo"

// SideScrollerDemo 는 "use client" + useEffect 내부에서 Phaser 를 await import 하므로
// page 에서 dynamic({ ssr: false }) 래핑 불필요. Next.js 15 는 서버 컴포넌트에서
// dynamic ssr:false 를 거부하므로 오히려 그 패턴이 빌드 에러.

export const metadata = {
  title: "사이드스크롤러 프로토타입 — 메타버스",
  description: "Phase 4 사이드뷰 실내 씬 감각 검증 데모 (내부 테스트)",
  robots: { index: false, follow: false },
}

export default function InteriorDemoPage() {
  return <SideScrollerDemo />
}

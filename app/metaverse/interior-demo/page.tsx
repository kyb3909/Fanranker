import dynamic from "next/dynamic"

const SideScrollerDemo = dynamic(
  () => import("@/components/metaverse/side-scroller-demo").then((m) => m.SideScrollerDemo),
  { ssr: false }
)

export const metadata = {
  title: "사이드스크롤러 프로토타입 — 메타버스",
  description: "Phase 4 사이드뷰 실내 씬 감각 검증 데모 (내부 테스트)",
  robots: { index: false, follow: false },
}

export default function InteriorDemoPage() {
  return <SideScrollerDemo />
}

import { MetaverseStage } from "@/components/metaverse/metaverse-stage"

export const metadata = {
  title: "경기장 메타버스 — 개발 중",
  description: "공놀이 경기장 메타버스 (내부 테스트)",
  robots: { index: false, follow: false },
}

export default function MetaversePage() {
  return <MetaverseStage />
}

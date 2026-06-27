import { HighburyStage } from "@/components/metaverse/highbury-stage"

export const metadata = {
  title: "프로토타입 — 메타버스 (테스트)",
  description: "메타버스 프로토타입 페이지 (게스트 진입 가능)",
  robots: { index: false, follow: false },
}

/**
 * /metaverse/prototype — 메타버스 프로토타입 검증 전용 페이지.
 * /metaverse/highbury 와 동일한 씬·채널을 쓰되 비로그인 게스트도 진입 가능.
 * 로컬 개발 + production 검증 양쪽에서 빠르게 확인하기 위함.
 */
export default function MetaversePrototypePage() {
  return <HighburyStage allowGuest />
}

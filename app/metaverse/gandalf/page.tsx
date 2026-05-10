import { HighburyStage } from "@/components/metaverse/highbury-stage"

export const metadata = {
  title: "간달프 — 메타버스 (테스트)",
  description: "GandalfHardcore 캐릭터 통합 검증 페이지 (게스트 진입 가능)",
  robots: { index: false, follow: false },
}

/**
 * /metaverse/gandalf — Gandalf 캐릭터 검증 전용 페이지.
 * /metaverse/highbury 와 동일한 씬·채널을 쓰되 비로그인 게스트도 진입 가능.
 * 로컬 개발 + production 검증 양쪽에서 빠르게 확인하기 위함.
 */
export default function GandalfTestPage() {
  return <HighburyStage allowGuest />
}

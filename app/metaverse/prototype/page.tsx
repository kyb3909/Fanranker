import { redirect } from "next/navigation"
import { HighburyStage } from "@/components/metaverse/highbury-stage"

export const metadata = {
  title: "프로토타입 — 메타버스 (테스트)",
  description: "메타버스 프로토타입 페이지 (게스트 진입 가능)",
  robots: { index: false, follow: false },
}

/**
 * /metaverse/prototype — 메타버스 프로토타입 검증 전용 페이지.
 * /metaverse/highbury 와 동일한 씬·채널을 쓰되 비로그인 게스트도 진입 가능.
 * 프로덕션은 정식 스타디움(/metaverse/highbury)으로 통일 — 중복 공간 혼란 방지 (2026-07-02).
 */
export default function MetaversePrototypePage() {
  if (process.env.NODE_ENV !== "development") redirect("/metaverse/highbury")
  return <HighburyStage allowGuest />
}

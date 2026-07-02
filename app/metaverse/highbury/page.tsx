import { HighburyStage } from "@/components/metaverse/highbury-stage"

export const metadata = {
  title: "스타디움",
  description:
    "아스날 하이버리 스타디움 — 내 아바타로 입장해 경기장 안팎을 오가며 다른 팬들과 실시간 채팅.",
  alternates: { canonical: "/metaverse/highbury" },
}

export default function HighburyPage() {
  // 가입 없이 게스트로 진입 가능 (캣스날 오픈 체험용).
  return <HighburyStage allowGuest />
}

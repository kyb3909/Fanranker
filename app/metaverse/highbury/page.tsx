import { StadiumPageBinding } from "@/components/metaverse/stadium-pip"

export const metadata = {
  title: "스타디움",
  description:
    "아스날 하이버리 스타디움 — 내 아바타로 입장해 경기장 안팎을 오가며 다른 팬들과 실시간 채팅.",
  alternates: { canonical: "/metaverse/highbury" },
}

export default function HighburyPage() {
  // 스테이지는 AppShell 의 StadiumPipProvider(GlobalStadium)가 상주 렌더 —
  // 이 페이지는 진입=풀스크린 / 이탈=미니 전환 바인딩만 담당 (PIP 패턴).
  // 게스트 진입 허용은 GlobalStadium 쪽 allowGuest 로 유지.
  return <StadiumPageBinding />
}

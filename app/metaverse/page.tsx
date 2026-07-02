import { redirect } from "next/navigation"
import { CountryPicker } from "@/components/metaverse/country-picker"

export const metadata = {
  title: "국가 선택",
  description: "응원하는 리그의 월드맵으로 입장하세요",
  robots: { index: false, follow: false },
}

export default function MetaverseLandingPage() {
  // 월드맵 체인은 폐기 방향 — 프로덕션은 정식 공간(하이버리 스타디움)으로 통일.
  // 테스트 공간이 여러 개 살아있으면 유저가 다른 채널에 흩어져 서로 안 보임 (2026-07-02).
  if (process.env.NODE_ENV !== "development") redirect("/metaverse/highbury")
  return <CountryPicker />
}

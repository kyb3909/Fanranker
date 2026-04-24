import { CountryPicker } from "@/components/metaverse/country-picker"

export const metadata = {
  title: "메타버스 · 국가 선택",
  description: "입장할 국가를 선택하세요 — 공동체의 경기장 메타버스",
  robots: { index: false, follow: false },
}

export default function MetaverseLandingPage() {
  return <CountryPicker />
}

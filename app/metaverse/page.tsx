import { CountryPicker } from "@/components/metaverse/country-picker"

export const metadata = {
  title: "국가 선택",
  description: "응원하는 리그의 월드맵으로 입장하세요",
  robots: { index: false, follow: false },
}

export default function MetaverseLandingPage() {
  return <CountryPicker />
}

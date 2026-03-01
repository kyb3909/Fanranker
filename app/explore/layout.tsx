import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "탐색",
  description: "다양한 스포츠 커뮤니티를 탐색하세요",
  openGraph: {
    title: "탐색 - FanRanker",
    description: "다양한 스포츠 커뮤니티를 탐색하세요",
  },
  twitter: {
    card: "summary",
    title: "탐색 - FanRanker",
    description: "다양한 스포츠 커뮤니티를 탐색하세요",
  },
  alternates: { canonical: "/explore" },
}

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return children
}

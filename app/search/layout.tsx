import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "검색",
  description: "FanRanker 게시글 검색",
  alternates: { canonical: "/search" },
}

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children
}

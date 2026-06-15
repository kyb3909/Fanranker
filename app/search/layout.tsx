import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "검색",
  description: "공놀이판 게시글을 검색해보세요",
  alternates: { canonical: "/search" },
}

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children
}

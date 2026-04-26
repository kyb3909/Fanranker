import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "검색",
  description: "공놀이 게시글 검색",
  alternates: { canonical: "/search" },
}

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children
}

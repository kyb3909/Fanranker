import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "운동장",
  description: "관심 있는 게시판을 찾아 팔로우하고 내 담벼락을 채워보세요",
  openGraph: {
    title: "운동장 - gongnori.fan",
    description: "관심 있는 게시판을 찾아 팔로우하고 내 담벼락을 채워보세요",
  },
  twitter: {
    card: "summary",
    title: "운동장 - gongnori.fan",
    description: "관심 있는 게시판을 찾아 팔로우하고 내 담벼락을 채워보세요",
  },
  alternates: { canonical: "/explore" },
}

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return children
}

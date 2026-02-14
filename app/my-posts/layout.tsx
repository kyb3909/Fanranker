import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "내 게시물",
}

export default function MyPostsLayout({ children }: { children: React.ReactNode }) {
  return children
}

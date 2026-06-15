import { Metadata } from "next"
import { ShareContent } from "./share-content"

export const metadata: Metadata = {
  title: "지금 뜨는 토픽",
  description: "각 게시판에서 지금 가장 많이 이야기되는 주제를 확인하세요",
  openGraph: {
    title: "지금 뜨는 토픽 - gongnori.fan",
    description: "각 게시판에서 지금 가장 많이 이야기되는 주제를 확인하세요",
  },
  twitter: {
    card: "summary",
    title: "지금 뜨는 토픽 - gongnori.fan",
    description: "각 게시판에서 지금 가장 많이 이야기되는 주제를 확인하세요",
  },
  alternates: { canonical: "/share" },
}

export default function SharePage() {
  return <ShareContent />
}

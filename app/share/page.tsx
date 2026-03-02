import { Metadata } from "next"
import { ShareContent } from "./share-content"

export const metadata: Metadata = {
  title: "토픽 점유율",
  description: "각 게시판에서 가장 많이 이야기되는 토픽을 한눈에 확인하세요",
  openGraph: {
    title: "토픽 점유율 - FanRanker",
    description: "각 게시판에서 가장 많이 이야기되는 토픽을 한눈에 확인하세요",
  },
  twitter: {
    card: "summary",
    title: "토픽 점유율 - FanRanker",
    description: "각 게시판에서 가장 많이 이야기되는 토픽을 한눈에 확인하세요",
  },
  alternates: { canonical: "/share" },
}

export default function SharePage() {
  return <ShareContent />
}

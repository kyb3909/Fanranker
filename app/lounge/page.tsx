import { redirect } from "next/navigation"
import { LoungeRoom } from "@/components/metaverse/lounge-room"

// LoungeRoom 은 "use client" + useEffect 내부에서 Phaser 를 await import 하므로
// dynamic({ ssr: false }) 래핑 불필요 (interior-demo 와 동일 패턴).

export const metadata = {
  title: "팬 라운지",
  description: "내 아바타로 입장해 다른 팬들과 실시간으로 채팅하는 라운지.",
  alternates: { canonical: "/lounge" },
}

export default function LoungePage() {
  // 일단 정식 공간은 하이버리 스타디움 하나로 통일 (2026-07-02 사용자 결정) —
  // 라운지(웸블리 씬 + 방 샤딩 + 경기장 레벨 연동)는 코드 보존, 프로덕션 리다이렉트.
  // 방 샤딩/장착 아바타는 추후 하이버리에 이식 예정.
  if (process.env.NODE_ENV !== "development") redirect("/metaverse/highbury")
  return <LoungeRoom />
}

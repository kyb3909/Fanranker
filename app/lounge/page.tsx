import { LoungeRoom } from "@/components/metaverse/lounge-room"

// LoungeRoom 은 "use client" + useEffect 내부에서 Phaser 를 await import 하므로
// dynamic({ ssr: false }) 래핑 불필요 (interior-demo 와 동일 패턴).

export const metadata = {
  title: "팬 라운지",
  description: "내 아바타로 입장해 다른 팬들과 실시간으로 채팅하는 라운지.",
  alternates: { canonical: "/lounge" },
}

export default function LoungePage() {
  return <LoungeRoom />
}

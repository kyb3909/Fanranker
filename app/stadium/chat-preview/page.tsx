import { GameCanvasDynamic } from "@/components/stadium/game-canvas-dynamic"

export const metadata = {
  title: "경기장 채팅방 프리뷰 | gongnori.fan",
}

/**
 * Phaser 기반 StadiumChatScene 개발용 프리뷰 라우트.
 *
 * 프로덕션 stadium-room.tsx(현 Canvas 기반)를 교체하기 전,
 * 아바타 이동/카메라/Realtime 실험을 위한 고립된 환경.
 */
export default function StadiumChatPreviewPage() {
  return (
    <main className="min-h-screen bg-neutral-950 p-4">
      <div className="mx-auto max-w-[820px]">
        <h1 className="mb-3 text-lg font-semibold text-white">경기장 채팅방 프리뷰 (Phase 2a)</h1>
        <p className="mb-4 text-sm text-neutral-400">
          방향키(또는 WASD)로 이동, 카메라가 따라옵니다. 타일맵·아바타 스프라이트· 멀티플레이는
          Phase 2b에서 추가.
        </p>
        <GameCanvasDynamic />
      </div>
    </main>
  )
}

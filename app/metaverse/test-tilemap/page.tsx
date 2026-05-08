"use client"

import { useEffect, useRef, useState } from "react"

export default function TestTilemapPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [errMsg, setErrMsg] = useState<string>("")

  useEffect(() => {
    if (!containerRef.current) return
    const parent = containerRef.current
    let game: import("phaser").Game | null = null
    let cancelled = false

    ;(async () => {
      try {
        const Phaser = await import("phaser")
        const { TestTilemapScene } = await import("@/lib/metaverse/scenes/test-tilemap-scene")
        if (cancelled) return

        game = new Phaser.Game({
          type: Phaser.AUTO,
          parent,
          width: 900,
          height: 600,
          backgroundColor: "#101216",
          scene: TestTilemapScene,
          pixelArt: true,
          render: { antialias: false },
          physics: {
            default: "arcade",
            arcade: { gravity: { x: 0, y: 0 }, debug: false },
          },
        })
        setStatus("ready")
      } catch (err) {
        setErrMsg(err instanceof Error ? err.message : String(err))
        setStatus("error")
      }
    })()

    return () => {
      cancelled = true
      game?.destroy(true)
    }
  }, [])

  return (
    <div className="mx-auto max-w-5xl space-y-3 p-6">
      <h1 className="text-xl font-bold">UK 경기장 맵 검증</h1>
      <p className="text-sm text-neutral-600">
        영국 자동 생성 맵 + EPL Big Six + 웸블리. <strong>WASD / 화살표</strong>로 캐릭터 이동.
        경기장 사각형 클릭 → 경기장 정보 alert. Spawn = Wembley 근처. 충돌은 정식 통합에서.
      </p>
      <div className="text-sm">
        상태:{" "}
        {status === "loading" ? (
          <span className="text-amber-600">로드 중…</span>
        ) : status === "ready" ? (
          <span className="text-emerald-600">렌더 시작</span>
        ) : (
          <span className="text-red-600">에러: {errMsg}</span>
        )}
      </div>
      <div
        ref={containerRef}
        className="overflow-hidden rounded border border-neutral-300 bg-black"
        style={{ width: 900, height: 600 }}
      />
    </div>
  )
}

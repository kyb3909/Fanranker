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
          width: 800,
          height: 640,
          backgroundColor: "#101216",
          scene: TestTilemapScene,
          pixelArt: true,
          render: { antialias: false },
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
    <div className="mx-auto max-w-3xl space-y-3 p-6">
      <h1 className="text-xl font-bold">Tilemap 검증</h1>
      <p className="text-sm text-neutral-600">
        Tiled 50×40 맵 (uk-test.json) + LimeZu 타일셋이 Phaser에서 정상 로드되는지 확인. 잔디 배경 +
        빨간 사각형(highbury entrance) 보이면 성공. 사각형 클릭 시 alert.
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
        style={{ width: 800, height: 640 }}
      />
    </div>
  )
}

"use client"

import { useEffect, useRef, useState } from "react"
import type { StadiumWalkDemo } from "@/lib/metaverse/avatar3d/create-stadium-walk-demo"

const demoModulePromise = import("@/lib/metaverse/avatar3d/create-stadium-walk-demo")

const keyGuide = [
  { keys: "W A S D / 방향키", label: "이동" },
  { keys: "Shift", label: "달리기" },
  { keys: "Space", label: "점프" },
  { keys: "K", label: "슛" },
  { keys: "C", label: "환호" },
  { keys: "드래그", label: "카메라 회전" },
]

export function StadiumWalk() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const demoRef = useRef<StadiumWalkDemo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false
    async function boot() {
      try {
        const { createStadiumWalkDemo } = await demoModulePromise
        if (!canvasRef.current || disposed) return
        const demo = await createStadiumWalkDemo(canvasRef.current)
        if (disposed) {
          demo.dispose()
          return
        }
        demoRef.current = demo
      } catch (bootError: unknown) {
        console.error("Failed to initialize stadium walk demo", bootError)
        setError("3D 데모를 불러오지 못했습니다. 새로고침해 주세요.")
      }
    }
    void boot()
    return () => {
      disposed = true
      demoRef.current?.dispose()
      demoRef.current = null
    }
  }, [])

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-950">
      <canvas
        ref={canvasRef}
        className="h-[70vh] min-h-[420px] w-full touch-none outline-none"
        aria-label="경기장 워크 데모"
      />
      <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-wrap justify-center gap-2">
        {keyGuide.map((item) => (
          <span
            key={item.keys}
            className="rounded-full bg-slate-900/85 px-3 py-1 text-xs font-medium text-slate-200"
          >
            <span className="font-semibold text-indigo-300">{item.keys}</span> {item.label}
          </span>
        ))}
      </div>
      {error ? (
        <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-rose-300">
          {error}
        </p>
      ) : null}
    </div>
  )
}

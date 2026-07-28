"use client"

import { useEffect, useRef } from "react"

/**
 * public/games/*.html 셀프 컨테인드 미니게임을 앱 셸 안에서 띄우는 iframe 래퍼.
 * 게임은 keydown 입력을 쓰므로 mount 시 iframe에 포커스를 줘야 키가 바로 먹는다.
 */
export function MiniGameFrame({ src, title }: { src: string; title: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    frameRef.current?.focus()
  }, [])

  return (
    <iframe
      ref={frameRef}
      src={src}
      title={title}
      className="h-[calc(100dvh-200px)] min-h-[480px] w-full rounded-lg border"
      style={{ borderColor: "var(--wc-line, #e8e5e0)" }}
      allow="fullscreen"
    />
  )
}

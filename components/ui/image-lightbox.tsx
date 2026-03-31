"use client"

import { useCallback, useEffect, useState } from "react"
import { X } from "lucide-react"

/**
 * 이미지 라이트박스 — 클릭 시 원본 크기로 확대 표시
 * 배경 클릭 또는 ESC 키로 닫기
 */
export function ImageLightbox() {
  const [src, setSrc] = useState<string | null>(null)

  const close = useCallback(() => setSrc(null), [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (target.tagName === "IMG" && target.closest(".tiptap-image, .post-body-image")) {
        e.preventDefault()
        e.stopPropagation()
        setSrc((target as HTMLImageElement).src)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") close()
    }
    document.addEventListener("click", handleClick)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("click", handleClick)
      document.removeEventListener("keydown", handleKey)
    }
  }, [close])

  if (!src) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={close}
    >
      <button
        className="absolute top-4 right-4 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
        onClick={close}
        aria-label="닫기"
      >
        <X className="h-6 w-6" />
      </button>
      <img
        src={src}
        alt=""
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}

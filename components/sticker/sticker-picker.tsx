"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Image from "next/image"
import { Sparkles, X, ShoppingBag } from "lucide-react"
import Link from "@/components/ui/app-link"

interface OwnedSticker {
  id: string
  name: string
  image_url: string
  media_type: string
}

interface StickerPickerProps {
  onSelect: (sticker: { id: string; name: string; image_url: string }) => void
  onClose: () => void
}

export function StickerPicker({ onSelect, onClose }: StickerPickerProps) {
  const [stickers, setStickers] = useState<OwnedSticker[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const ref = useRef<HTMLDivElement>(null)

  const loadMyStickers = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/stickers/my")
      const data = await res.json()
      if (data.stickers) setStickers(data.stickers)
    } catch {
      // ignore
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMyStickers()
  }, [loadMyStickers])

  // 바깥 클릭 닫기 (pointerdown: 마우스/터치/펜 통합, 터치 지연 회피)
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("pointerdown", handler)
    return () => document.removeEventListener("pointerdown", handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="border-border bg-card absolute bottom-full left-0 z-50 mb-2 w-72 overflow-hidden rounded-xl border shadow-xl"
    >
      {/* 헤더 */}
      <div className="border-border flex items-center justify-between border-b px-3 py-2">
        <div className="text-foreground flex items-center gap-1.5 text-xs font-bold">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />내 스티커
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 스티커 그리드 */}
      <div className="max-h-60 overflow-y-auto p-2">
        {isLoading ? (
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-muted aspect-square animate-pulse rounded-lg" />
            ))}
          </div>
        ) : stickers.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-muted-foreground text-xs">보유한 스티커가 없습니다</p>
            <Link
              href="/shop"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-500 hover:underline"
            >
              <ShoppingBag className="h-3 w-3" />
              상점에서 구매하기
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {stickers.map((s) => (
              <button
                key={s.id}
                onClick={() => onSelect({ id: s.id, name: s.name, image_url: s.image_url })}
                className="group bg-muted/30 relative aspect-square overflow-hidden rounded-lg border border-transparent p-1.5 transition-all hover:border-amber-500/50 hover:bg-amber-500/5"
                title={s.name}
              >
                <Image
                  src={s.image_url}
                  alt={s.name}
                  fill
                  className="object-contain transition-transform group-hover:scale-110"
                  sizes="48px"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

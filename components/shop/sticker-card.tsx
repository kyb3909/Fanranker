"use client"

import { useState } from "react"
import { Check, ShoppingCart, Sparkles } from "lucide-react"

interface Sticker {
  id: string
  name: string
  image_url: string
  media_type: string
  price: number
  purchase_count: number
  use_count: number
  creator_id: string
}

interface StickerCardProps {
  sticker: Sticker
  isOwned: boolean
  onPurchase: (id: string) => Promise<{ success: boolean; error?: string; spent?: number }>
}

export function StickerCard({ sticker, isOwned, onPurchase }: StickerCardProps) {
  const [buying, setBuying] = useState(false)
  const [justBought, setJustBought] = useState(false)
  const [error, setError] = useState("")

  const handleBuy = async () => {
    if (isOwned || buying) return
    setBuying(true)
    setError("")
    const result = await onPurchase(sticker.id)
    setBuying(false)
    if (result.success) {
      setJustBought(true)
    } else if (result.error === "insufficient_points") {
      setError("포인트 부족")
    } else if (result.error === "already_owned") {
      setJustBought(true)
    } else {
      setError("구매 실패")
    }
  }

  const owned = isOwned || justBought

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border transition-all ${
        owned
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-border bg-card hover:border-amber-500/30 hover:shadow-md"
      }`}
    >
      {/* 이미지 */}
      <div className="bg-muted/30 relative aspect-square p-3">
        <img
          src={sticker.image_url}
          alt={sticker.name}
          className="h-full w-full object-contain transition-transform group-hover:scale-110"
          loading="lazy"
        />
        {owned && (
          <div className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
            <Check className="h-3 w-3" />
          </div>
        )}
      </div>

      {/* 정보 */}
      <div className="border-border/50 border-t p-2">
        <p className="text-foreground truncate text-xs font-semibold">{sticker.name}</p>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-muted-foreground flex items-center gap-0.5 text-[10px]">
            <Sparkles className="h-2.5 w-2.5 text-amber-500" />
            {sticker.purchase_count}명 보유
          </span>

          {owned ? (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              보유중
            </span>
          ) : (
            <button
              onClick={handleBuy}
              disabled={buying}
              className="flex items-center gap-0.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-2 py-0.5 text-[10px] font-bold text-white transition-all hover:shadow-sm disabled:opacity-50"
            >
              {buying ? (
                "..."
              ) : (
                <>
                  <ShoppingCart className="h-2.5 w-2.5" />
                  {sticker.price}P
                </>
              )}
            </button>
          )}
        </div>
        {error && <p className="mt-0.5 text-[10px] text-red-500">{error}</p>}
      </div>
    </div>
  )
}

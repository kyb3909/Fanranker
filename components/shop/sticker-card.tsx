"use client"

import { useState } from "react"
import Image from "next/image"
import { Check, ShoppingCart, Sparkles } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

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
  const [confirmOpen, setConfirmOpen] = useState(false)

  const handleConfirmPurchase = async () => {
    if (isOwned || buying) return
    setBuying(true)
    setError("")
    const result = await onPurchase(sticker.id)
    setBuying(false)
    setConfirmOpen(false)
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
      className={`group relative overflow-hidden rounded-xl${owned ? "" : "gn-card-lift"}`}
      style={
        owned
          ? {
              border: "1px solid rgba(16,185,129,0.3)",
              background: "rgba(16,185,129,0.05)",
              borderTop: "3px solid #10b981",
            }
          : {
              border: "1px solid var(--wc-line)",
              background: "var(--wc-card)",
              borderTop: `3px solid var(--wc-burgundy)`,
            }
      }
    >
      {/* 이미지 */}
      <div className="relative aspect-square p-3" style={{ background: "var(--wc-paper)" }}>
        <Image
          src={sticker.image_url}
          alt={sticker.name}
          fill
          className="object-contain transition-transform group-hover:scale-110"
          sizes="(max-width: 640px) 25vw, 120px"
        />
        {owned && (
          <div className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
            <Check className="h-3 w-3" />
          </div>
        )}
      </div>

      {/* 정보 */}
      <div className="p-2" style={{ borderTop: "1px solid var(--wc-line)" }}>
        <p className="truncate text-xs font-semibold" style={{ color: "var(--wc-ink)" }}>
          {sticker.name}
        </p>
        <div className="mt-1 flex items-center justify-between">
          <span
            className="flex items-center gap-0.5 text-[10px]"
            style={{ color: "var(--wc-mute)" }}
          >
            <Sparkles className="h-2.5 w-2.5" style={{ color: "var(--wc-burgundy)" }} />
            {sticker.purchase_count}명 보유
          </span>

          {owned ? (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              보유중
            </span>
          ) : (
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={buying}
              className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: "var(--wc-burgundy)" }}
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

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>스티커를 구매할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="text-foreground font-medium">{sticker.name}</span> 스티커를{" "}
              {sticker.price}P에 구매합니다. 구매 후 포인트가 차감되며 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={buying}>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmPurchase} disabled={buying}>
              {buying ? "구매 중..." : `${sticker.price}P로 구매`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

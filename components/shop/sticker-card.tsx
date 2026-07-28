"use client"

import { useState } from "react"
import Image from "next/image"
import { Coins } from "lucide-react"
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
      className="group gn-card-lift relative overflow-hidden rounded-xl"
      style={{ border: "1px solid var(--wc-line)", background: "var(--wc-card)" }}
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
          <span
            className="absolute top-1.5 right-1.5"
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 20,
              padding: "0 6px",
              borderRadius: 12,
              background: "var(--wc-soft)",
              color: "var(--wc-burgundy)",
              fontSize: 10.5,
              fontWeight: 700,
            }}
          >
            ✓
          </span>
        )}
      </div>

      {/* 정보 */}
      <div className="p-2" style={{ borderTop: "1px solid var(--wc-line)" }}>
        <p className="truncate text-xs font-semibold" style={{ color: "var(--wc-ink)" }}>
          {sticker.name}
        </p>
        <div className="mt-1 flex items-center justify-between">
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              fontSize: 13,
              fontWeight: 800,
              color: "var(--wc-ink)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <Coins style={{ width: 13, height: 13 }} />
            {sticker.price}
          </span>

          {owned ? (
            <span
              style={{
                height: 28,
                padding: "0 10px",
                display: "inline-flex",
                alignItems: "center",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 600,
                background: "var(--wc-soft)",
                color: "var(--wc-mute)",
              }}
            >
              보유중
            </span>
          ) : (
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={buying}
              style={{
                height: 32,
                padding: "0 12px",
                display: "inline-flex",
                alignItems: "center",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                background: "#fff",
                border: "1px solid var(--wc-line-2)",
                color: "var(--wc-ink)",
                cursor: "pointer",
                opacity: buying ? 0.5 : 1,
                transition: "background .15s, color .15s, border-color .15s",
              }}
              onMouseEnter={(e) => {
                if (buying) return
                const t = e.currentTarget
                t.style.background = "var(--wc-burgundy)"
                t.style.color = "#fff"
                t.style.borderColor = "var(--wc-burgundy)"
              }}
              onMouseLeave={(e) => {
                const t = e.currentTarget
                t.style.background = "#fff"
                t.style.color = "var(--wc-ink)"
                t.style.borderColor = "var(--wc-line-2)"
              }}
            >
              {buying ? "..." : "구매"}
            </button>
          )}
        </div>
        {error && <p style={{ marginTop: 2, fontSize: 10, color: "var(--wc-down)" }}>{error}</p>}
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

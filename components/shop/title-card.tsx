"use client"

import { Coins } from "lucide-react"
import { TitleBadge } from "@/components/profile/title-badge"
import type { TitleDisplay } from "@/types/user"

export interface TitleItem extends TitleDisplay {
  id: string
  name: string
  description: string
  price: number
  rarity: "common" | "rare" | "epic" | "legendary"
  owned?: boolean
}

const RARITY_CHIP: Record<TitleItem["rarity"], { bg: string; color: string; label: string }> = {
  common: { bg: "var(--wc-soft)", color: "var(--wc-mute)", label: "일반" },
  rare: { bg: "#EAF1FD", color: "#1E3A8A", label: "레어" },
  epic: { bg: "#FBF3DC", color: "#8C6411", label: "에픽" },
  legendary: { bg: "#FEF3C7", color: "#B45309", label: "레전드" },
}

interface TitleCardProps {
  item: TitleItem
  onPurchase?: (id: string) => void
}

export function TitleCard({ item, onPurchase }: TitleCardProps) {
  const chip = RARITY_CHIP[item.rarity]

  return (
    <div
      className="gn-card-lift"
      style={{
        border: "1px solid var(--wc-line)",
        borderRadius: 12,
        padding: 16,
        background: "var(--wc-card)",
      }}
    >
      {/* DD2 — 레어도 칩 */}
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          height: 20,
          padding: "0 6px",
          borderRadius: 4,
          background: chip.bg,
          color: chip.color,
          fontSize: 10,
          fontWeight: 800,
          marginBottom: 10,
        }}
      >
        {chip.label}
      </span>

      {/* DD1 — 칭호 뱃지 미리보기 영역 */}
      <div
        style={{
          height: 72,
          background: "var(--wc-paper)",
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 13, color: "var(--wc-mute-2)" }}>영범</span>
        <TitleBadge
          adjTitle={item.adjTitle}
          nounTitle={item.nounTitle}
          rarity={item.rarity}
          size="md"
        />
      </div>

      {/* DD4 — 이름 + 부제 */}
      <p
        style={{
          fontSize: 15,
          fontWeight: 800,
          color: "var(--wc-ink)",
          marginBottom: 3,
        }}
      >
        {item.name}
      </p>
      <p
        style={{
          fontSize: 12,
          color: "var(--wc-mute)",
          marginBottom: 14,
        }}
      >
        {item.description}
      </p>

      {/* DD3 — 가격 + 구매 버튼 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 15,
            fontWeight: 800,
            color: "var(--wc-ink)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <Coins style={{ width: 14, height: 14 }} />
          {item.price.toLocaleString()}
        </span>

        {item.owned ? (
          <span
            style={{
              height: 32,
              padding: "0 14px",
              display: "inline-flex",
              alignItems: "center",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              background: "var(--wc-soft)",
              color: "var(--wc-mute)",
            }}
          >
            보유중
          </span>
        ) : (
          <button
            onClick={() => onPurchase?.(item.id)}
            className="gn-buy-btn"
            style={{
              height: 32,
              padding: "0 14px",
              display: "inline-flex",
              alignItems: "center",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              background: "#fff",
              border: "1px solid var(--wc-line-2)",
              color: "var(--wc-ink)",
              cursor: "pointer",
              transition: "background .15s, color .15s, border-color .15s",
            }}
            onMouseEnter={(e) => {
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
            구매
          </button>
        )}
      </div>
    </div>
  )
}

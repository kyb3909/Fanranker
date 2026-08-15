"use client"

import { useEffect, useState } from "react"
import { LunaStage } from "@/components/tarot/luna-stage"
import { CardTable, type ReadingCard } from "@/components/tarot/card-table"
import type { Expression } from "@/lib/tarot/expression"

/**
 * 점집 무대 — 루나와 테이블 (원본 StagePanel 대응).
 *
 * 데스크톱에서는 **화면 왼쪽 절반**을 차지하고 오른쪽 채팅과 마주 본다. 좁은 화면에서는
 * 채팅 위에 얹히는 가로 띠가 된다. 어느 쪽이든 같은 컴포넌트라 카드 UI 가 갈라지지 않는다.
 *
 * 넓은 자리에서는 카드도 같이 커진다 — 무대가 커졌는데 카드가 그대로면 인물만 크고
 * 테이블은 장난감처럼 보인다.
 */
export function StagePanel({
  expression,
  cards,
  flipped,
  onFlip,
  caption,
  dealing = false,
  className = "",
}: {
  expression: Expression
  cards: ReadingCard[]
  flipped: Set<number>
  onFlip: (position: number) => void
  caption: string
  dealing?: boolean
  className?: string
}) {
  // 카드 폭은 무대 실제 폭에서 계산한다 — 3장이 나란히 들어가야 하고,
  // 데스크톱 좌측 패널(≈500px)에서는 한 장이 130px 까지 커질 수 있다.
  const [cardW, setCardW] = useState(84)
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const w = e.contentRect.width
      const n = Math.max(cards.length, 1)
      // 좌우 패딩 32 + 카드 사이 간격
      const per = (w - 32 - (n - 1) * 12) / n
      setCardW(Math.max(56, Math.min(136, Math.floor(per))))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [el, cards.length])

  return (
    <div
      ref={setEl}
      className={`relative overflow-hidden ${className}`}
      style={{ background: "#120c1a" }}
    >
      <LunaStage
        expression={expression}
        className="absolute inset-0"
        dim={cards.length > 0}
        raise={cards.length > 0}
      />

      {/* 자막 — 루나가 지금 무슨 상태인지 */}
      <p
        className="absolute inset-x-0 top-3 px-4 text-center text-[12.5px] font-semibold"
        style={{ color: "rgba(255,255,255,.92)", textShadow: "0 1px 6px rgba(0,0,0,.75)" }}
      >
        {caption}
      </p>

      {/* 테이블 */}
      {cards.length > 0 && (
        <div className="absolute inset-x-0 bottom-4 px-4">
          <CardTable cards={cards} flipped={flipped} onFlip={onFlip} width={cardW} />
        </div>
      )}

      {dealing && (
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-8 mx-auto block h-[3px] w-24 animate-pulse rounded-full"
          style={{ background: "rgba(224,189,126,.7)" }}
        />
      )}
    </div>
  )
}

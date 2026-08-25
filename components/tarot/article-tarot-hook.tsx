"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { Sparkles } from "lucide-react"
import { suggestTarot } from "@/lib/tarot/suggest"
import { trackEvent } from "@/lib/analytics/events"

const TarotModal = dynamic(
  () => import("@/components/tarot/tarot-modal").then((m) => ({ default: m.TarotModal })),
  { ssr: false }
)

/**
 * 기사 상세 타로 훅 (2026-08-20 운영자: "선수 이적 기사 같은 데서 점 보는 걸로").
 *
 * 떡밥 카드의 타로 띠(TarotStrip)와 같은 재료(suggestTarot) — 제목이 이적설·경기
 * 프리뷰 등 점칠 거리로 판정될 때만 나타난다. 모달이라 기사를 떠나지 않는다:
 * 데스크톱은 큰 루나 무대(980px 2단), 모바일은 컴팩트 배치 (TarotModal 반응형).
 */
export function ArticleTarotHook({ title }: { title: string }) {
  const [open, setOpen] = useState(false)
  const tarot = suggestTarot(title)
  if (!tarot) return null
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          trackEvent({ name: "tarot_hook_click", params: { surface: "post" } })
        }}
        className="inline-flex items-center gap-1.5 text-[12px] font-bold transition-opacity hover:opacity-80"
        style={{ color: "var(--wc-burgundy)" }}
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {tarot.label}
      </button>
      {open && <TarotModal question={tarot.question} open={open} onOpenChange={setOpen} />}
    </>
  )
}

"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { Sparkles } from "lucide-react"
import { trackEvent } from "@/lib/analytics/events"

const TarotModal = dynamic(
  () => import("@/components/tarot/tarot-modal").then((m) => ({ default: m.TarotModal })),
  { ssr: false }
)

/**
 * 경기 일정 타로 훅 (2026-08-20 운영자: "타로는 이적설 뉴스나 경기 일정에서 점 보는 걸로").
 *
 * **경기 행 우측의 컴팩트 칩** (2026-08-21 운영자 교정: 표제 행이 아니라 "각 경기의
 * 오른쪽에", 유명 클럽이 낀 경기만 — 노출 판정은 lib/match/famous-clubs.ts, 호출부 담당).
 * 해당 경기를 프리필 질문으로 얹어 모달을 연다 — 페이지를 떠나지 않는다 (카드뉴스
 * TarotStrip 과 같은 문법).
 */
export function FixturesTarotHook({ question }: { question: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          trackEvent({ name: "tarot_hook_click", params: { surface: "fixtures" } })
        }}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-bold transition-colors hover:bg-[var(--wc-tint)]"
        style={{
          background: "var(--wc-wine-tint)",
          border: "1px solid var(--wc-line)",
          color: "var(--wc-burgundy)",
        }}
      >
        <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
        타로점
      </button>
      {open && <TarotModal question={question} open={open} onOpenChange={setOpen} />}
    </>
  )
}

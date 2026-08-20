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
 * 그날의 대표 예정 경기 하나를 프리필 질문으로 얹어 모달을 연다 — 페이지를 떠나지
 * 않는다 (카드뉴스 TarotStrip 과 같은 문법). 예정 경기가 없는 날은 서버가 아예
 * 렌더하지 않는다 (props 없음 = 없음).
 */
export function FixturesTarotHook({ question }: { question: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {/* 날짜 표제 행 우측의 버튼 (2026-08-20 운영자: "경기 일정 옆에 타로점 보기 버튼") */}
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          trackEvent({ name: "tarot_hook_click", params: { surface: "fixtures" } })
        }}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition-colors hover:bg-[var(--wc-tint)]"
        style={{
          background: "var(--wc-wine-tint)",
          border: "1px solid var(--wc-line)",
          color: "var(--wc-burgundy)",
        }}
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
        타로점 보기
      </button>
      {open && <TarotModal question={question} open={open} onOpenChange={setOpen} />}
    </>
  )
}

"use client"

import { useState } from "react"
import { ArrowRight, Gift, Lock, Crown, Trophy } from "lucide-react"
import { Card } from "@/components/ui/card"
import Image from "next/image"
import Link from "next/link"

interface PrizeHint {
  week: number
  label: string
  emoji: string
}

interface PrizeConfig {
  title: string
  description: string
  imageUrl: string
  month: string
  startDate: string
  hints: PrizeHint[]
}

const CURRENT_PRIZE: PrizeConfig = {
  title: "사비 알론소 사인 유니폼",
  description: "사비 알론소 친필 사인 액자 유니폼 (2005 챔피언스리그 우승)",
  imageUrl: "/images/prizes/xabi-alonso-jersey.webp",
  month: "3월",
  startDate: "2026-03-01",
  hints: [
    { week: 1, label: "축구", emoji: "⚽" },
    { week: 2, label: "스페인", emoji: "🇪🇸" },
    { week: 3, label: "MF", emoji: "🎯" },
    { week: 4, label: "뮌헨", emoji: "🏟️" },
  ],
}

function getRevealedWeeks(startDate: string): number {
  const start = new Date(startDate)
  const now = new Date()
  const diffMs = now.getTime() - start.getTime()
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000))
  return Math.max(0, Math.min(diffWeeks + 1, 4))
}

export function MonthlyPrizeBanner() {
  const [revealed, setRevealed] = useState(false)
  const revealedWeeks = getRevealedWeeks(CURRENT_PRIZE.startDate)

  return (
    <Card className="border-border relative gap-0 overflow-hidden rounded-xl border py-0 shadow-none">
      <div className="via-primary/60 absolute top-0 right-0 left-0 h-[2px] bg-gradient-to-r from-transparent to-transparent" />

      {/* 헤더 */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="text-primary h-3.5 w-3.5" />
            <h3 className="text-primary text-[14px] font-bold">
              {CURRENT_PRIZE.month} 이달의 상품
            </h3>
          </div>
          <span className="text-muted-foreground text-[11px] font-semibold">1위 증정</span>
        </div>
        <p className="text-muted-foreground/60 mt-0.5 ml-[22px] text-[11px] tracking-wide uppercase">
          Monthly Prize
        </p>
      </div>

      {/* 본문 */}
      <div className="relative">
        {/* 힌트 */}
        <div
          className={`transition-all duration-500 ${
            revealed ? "pointer-events-none absolute inset-0 opacity-0" : "opacity-100"
          }`}
        >
          <div className="divide-border border-border divide-y border-t">
            {CURRENT_PRIZE.hints.map((hint) => {
              const isUnlocked = hint.week <= revealedWeeks
              return (
                <div key={hint.week} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-muted-foreground w-8 text-[11px] font-medium">
                    W{hint.week}
                  </span>
                  {isUnlocked ? (
                    <span className="text-foreground text-[13px] font-semibold">
                      {hint.emoji}&ensp;{hint.label}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/30 flex items-center gap-1.5">
                      <Lock className="h-3 w-3" />
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          <div className="p-3">
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="bg-primary relative flex w-full cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-lg py-2.5 text-[13px] font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
            >
              <span className="absolute inset-0 -translate-x-full animate-[shimmer_3s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <Gift className="relative h-4 w-4" />
              <span className="relative">정답 확인하기</span>
            </button>
          </div>
        </div>

        {/* 상품 공개 */}
        <div
          className={`transition-all duration-500 ${
            revealed ? "opacity-100" : "pointer-events-none absolute inset-0 opacity-0"
          }`}
        >
          <div className="bg-muted/30 ring-border relative mx-3 mt-1 aspect-square overflow-hidden rounded-lg ring-1">
            <Image
              src={CURRENT_PRIZE.imageUrl}
              alt={CURRENT_PRIZE.title}
              fill
              className="object-contain p-4"
              sizes="(min-width: 1024px) 280px, 0px"
            />
            <div className="bg-primary absolute top-2 right-2 flex items-center gap-1 rounded px-1.5 py-0.5">
              <Crown className="h-2.5 w-2.5 text-white" />
              <span className="text-[9px] font-bold text-white">PRIZE</span>
            </div>
          </div>

          <div className="p-4">
            <p className="text-foreground text-[14px] font-bold">{CURRENT_PRIZE.title}</p>
            <p className="text-muted-foreground mt-0.5 text-[11px]">{CURRENT_PRIZE.description}</p>

            <Link
              href="/?view=prediction"
              className="bg-primary mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-[13px] font-bold text-white transition-all hover:opacity-90"
            >
              승부예측 참여하기
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </Card>
  )
}

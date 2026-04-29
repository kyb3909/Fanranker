"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "@/components/ui/app-link"
import { ArrowRight, Lock, Crown } from "lucide-react"
import { CURRENT_PRIZE, getRevealedWeeks } from "@/lib/prize/current"
import { MinimalSideCard } from "./minimal-right-aside"

interface MinimalPrizeCardProps {
  /** "MONTHLY PRIZE" 서브 라벨 표시 (예측 페이지용) */
  showSubLabel?: boolean
}

/**
 * 이달의 상품 카드 — Minimal Sport 톤.
 * 데이터: lib/prize/current.ts (운영자가 직접 수정하는 정적 config — 기존
 * MonthlyPrizeBanner와 동일 source).
 *
 * - 4 row(W1-W4) hint 진행 (시작일부터 N주 경과 시 N개 공개, Lock 아이콘)
 * - "정답 확인하기" CTA → reveal 토글 (상품 image + title + 예측 참여 CTA)
 */
export function MinimalPrizeCard({ showSubLabel = false }: MinimalPrizeCardProps) {
  const [revealed, setRevealed] = useState(false)
  const revealedWeeks = getRevealedWeeks()

  return (
    <MinimalSideCard
      title={`${CURRENT_PRIZE.month} 이달의 상품`}
      trailing={
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-extrabold"
          style={{
            backgroundColor: "var(--ms-brand-soft)",
            color: "var(--ms-brand)",
          }}
        >
          1위 증정
        </span>
      }
    >
      {showSubLabel && (
        <div
          className="font-archivo mb-2 text-[9px] font-extrabold"
          style={{ color: "var(--ms-ink-3)", letterSpacing: "0.18em" }}
        >
          MONTHLY PRIZE
        </div>
      )}

      {!revealed ? (
        <>
          {/* W1-W4 힌트 */}
          <ul className="flex flex-col gap-1.5">
            {CURRENT_PRIZE.hints.map((hint) => {
              const unlocked = hint.week <= revealedWeeks
              return (
                <li
                  key={hint.week}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px]"
                  style={{ backgroundColor: "var(--ms-bg-hover)" }}
                >
                  <span
                    className="font-archivo w-7 shrink-0 text-[11px] font-extrabold"
                    style={{ color: "var(--ms-brand)" }}
                  >
                    W{hint.week}
                  </span>
                  {unlocked ? (
                    <>
                      <span className="text-[14px]" aria-hidden>
                        {hint.emoji}
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate font-bold"
                        style={{ color: "var(--ms-ink)" }}
                      >
                        {hint.label}
                      </span>
                    </>
                  ) : (
                    <span
                      className="flex flex-1 items-center gap-1.5"
                      style={{ color: "var(--ms-ink-3)" }}
                    >
                      <Lock className="h-3 w-3" />
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="mt-3 h-9 w-full rounded-xl text-[12px] font-bold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--ms-brand)" }}
          >
            정답 확인하기
          </button>
        </>
      ) : (
        <>
          {/* 상품 이미지 + 정보 */}
          <div
            className="relative mx-1 mb-3 aspect-square overflow-hidden rounded-xl"
            style={{
              backgroundColor: "var(--ms-bg-hover)",
              border: "1px solid var(--ms-line)",
            }}
          >
            <Image
              src={CURRENT_PRIZE.imageUrl}
              alt={CURRENT_PRIZE.title}
              fill
              className="object-contain p-4"
              sizes="(min-width: 1024px) 280px, 0px"
            />
            <div
              className="absolute top-2 right-2 flex items-center gap-1 rounded px-1.5 py-0.5"
              style={{ backgroundColor: "var(--ms-brand)" }}
            >
              <Crown className="h-2.5 w-2.5 text-white" aria-hidden />
              <span className="text-[9px] font-bold text-white">PRIZE</span>
            </div>
          </div>
          <p className="text-[13px] font-bold" style={{ color: "var(--ms-ink)" }}>
            {CURRENT_PRIZE.title}
          </p>
          <p className="mt-0.5 text-[11px]" style={{ color: "var(--ms-ink-3)" }}>
            {CURRENT_PRIZE.description}
          </p>
          <Link
            href="/prediction"
            className="mt-3 flex h-9 items-center justify-center gap-1.5 rounded-xl text-[12px] font-bold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--ms-brand)" }}
          >
            승부예측 참여하기
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </>
      )}
    </MinimalSideCard>
  )
}

"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { Card } from "@/components/ui/card"

interface RecapOverall {
  housePnl: number
  avgProfitRate: number | null
  avgAccuracy: number | null
  totalWagered: number
  totalReturns: number
  wonSlips: number
  settledSlips: number
  totalParticipants: number
}

interface RecapPeriod {
  start: string
  end: string
}

/** "2026-06-28" → "6/28" */
function mdLabel(d: string): string {
  const [, m, day] = d.split("-")
  return `${Number(m)}/${Number(day)}`
}

/**
 * 월드컵 이벤트 결산 보드.
 * 손익·수익률·배팅액은 노출하지 않는다 (하우스 vs 유저 구도 = 베팅 색채 제거).
 * 예측 통계 탭 상단에 노출. /api/event/worldcup/report 를 직접 fetch.
 * 정산 슬립이 없으면 아무것도 렌더하지 않는다.
 */
export function WorldcupRecapBoard() {
  const [overall, setOverall] = useState<RecapOverall | null>(null)
  const [period, setPeriod] = useState<RecapPeriod | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch("/api/event/worldcup/report")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setOverall((d?.overall as RecapOverall) ?? null)
        setPeriod((d?.period as RecapPeriod) ?? null)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <div className="wc-skeleton h-72 rounded-xl" />
  if (!overall || overall.settledSlips === 0) return null

  const message = `구너 ${overall.totalParticipants}명이 끝까지 함께했어요`

  return (
    <Card
      className="overflow-hidden"
      style={{ background: "var(--wc-card, #ffffff)", boxShadow: "var(--wc-shadow-1)" }}
    >
      <div className="p-4 sm:p-5">
        <div className="mb-4 text-center">
          <h3 className="text-foreground text-lg font-bold">이벤트 결산</h3>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {period
              ? `${mdLabel(period.start)}~${mdLabel(period.end)} · 월드컵 기간의 구너 예측 기록`
              : "이번 이벤트, 이렇게 마무리됐어요"}
          </p>
        </div>

        {/* 메인 카드 */}
        <div className="bg-muted/50 rounded-xl p-5 text-center">
          {/* 말풍선 */}
          <div
            className="relative mx-auto mb-3 inline-block max-w-[280px] rounded-2xl border bg-white px-4 py-2.5 text-sm font-bold shadow-sm dark:bg-neutral-900"
            style={{ borderColor: "var(--wc-line, #eadfe3)" }}
          >
            <span className="text-foreground">{message}</span>
            {/* 꼬리 */}
            <span
              className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-r border-b bg-white dark:bg-neutral-900"
              style={{ borderColor: "var(--wc-line, #eadfe3)" }}
            />
          </div>

          <div className="flex justify-center">
            <Image
              src="/mascot/hi.webp"
              alt="공노리 마스코트"
              width={96}
              height={96}
              className="h-24 w-24 object-contain"
            />
          </div>
        </div>

        {/* 참여 기록 */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="bg-muted/40 rounded-lg p-3 text-center">
            <p className="text-muted-foreground text-xs">함께한 구너</p>
            <p className="text-foreground text-xl font-bold">{overall.totalParticipants}명</p>
          </div>
          <div className="bg-muted/40 rounded-lg p-3 text-center">
            <p className="text-muted-foreground text-xs">총 예측</p>
            <p className="text-foreground text-xl font-bold">
              {overall.settledSlips.toLocaleString()}건
            </p>
          </div>
          <div className="bg-muted/40 rounded-lg p-3 text-center">
            <p className="text-muted-foreground text-xs">평균 적중률</p>
            <p className="text-foreground text-xl font-bold">
              {overall.avgAccuracy !== null ? `${overall.avgAccuracy}%` : "-"}
            </p>
          </div>
        </div>
      </div>
    </Card>
  )
}

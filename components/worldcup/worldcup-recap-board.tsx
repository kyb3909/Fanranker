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

/** 큰 볼 수량 축약 (stats-tab 과 동일 규칙) */
function formatBalls(n: number): string {
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)}만`
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}천`
  return n.toLocaleString()
}

/** "2026-06-28" → "6/28" */
function mdLabel(d: string): string {
  const [, m, day] = d.split("-")
  return `${Number(m)}/${Number(day)}`
}

/**
 * 월드컵 이벤트 결과 후기 보드 — "대회 주최자 vs 유저".
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

  const housePnl = overall.housePnl
  const usersWinning = housePnl < 0
  const houseWinning = housePnl > 0

  const mascot = usersWinning
    ? "/mascot/cry.webp"
    : houseWinning
      ? "/mascot/hi.webp"
      : "/mascot/bet-slip.png"
  const message = usersWinning
    ? "유저들이 앞섰습니다!"
    : houseWinning
      ? "대회 주최자가 웃고 있습니다…"
      : "끝까지 팽팽했어요!"

  return (
    <Card
      className="overflow-hidden"
      style={{ background: "var(--wc-card, #ffffff)", boxShadow: "var(--wc-shadow-1)" }}
    >
      <div className="p-4 sm:p-5">
        <div className="mb-4 text-center">
          <h3 className="text-foreground text-lg font-bold">대회 주최자 vs 유저</h3>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {period
              ? `${mdLabel(period.start)}~${mdLabel(period.end)} · 월드컵 기간의 구너 예측 대결`
              : "이번 이벤트, 누가 더 잘 예측했을까?"}
          </p>
        </div>

        {/* 메인 대결 카드 */}
        <div
          className={`rounded-xl p-5 text-center ${
            usersWinning
              ? "bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30"
              : houseWinning
                ? "bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/30"
                : "bg-muted/50"
          }`}
        >
          {/* 말풍선 */}
          <div
            className="relative mx-auto mb-3 inline-block max-w-[280px] rounded-2xl border bg-white px-4 py-2.5 text-sm font-bold shadow-sm dark:bg-neutral-900"
            style={{ borderColor: "var(--wc-line, #eadfe3)" }}
          >
            <span
              className={
                usersWinning
                  ? "text-emerald-700 dark:text-emerald-400"
                  : houseWinning
                    ? "text-[color:var(--wc-burgundy,#961e37)] dark:text-rose-300"
                    : "text-muted-foreground"
              }
            >
              {message}
            </span>
            {/* 꼬리 */}
            <span
              className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-r border-b bg-white dark:bg-neutral-900"
              style={{ borderColor: "var(--wc-line, #eadfe3)" }}
            />
          </div>

          <div className="flex justify-center">
            <Image
              src={mascot}
              alt="공노리 마스코트"
              width={96}
              height={96}
              className="h-24 w-24 object-contain"
            />
          </div>

          <div
            className="mt-3 inline-block rounded-full px-4 py-1.5 text-sm font-bold text-white"
            style={{ background: "var(--wc-burgundy, #961e37)" }}
          >
            대회 주최자 {usersWinning ? "손실" : "수익"} {usersWinning ? "-" : "+"}
            {formatBalls(Math.abs(housePnl))} 볼
          </div>
        </div>

        {/* 대결 스탯 */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="bg-muted/40 rounded-lg p-3 text-center">
            <p className="text-muted-foreground text-xs">유저 평균 수익률</p>
            <p
              className={`text-xl font-bold ${
                (overall.avgProfitRate ?? 0) >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {overall.avgProfitRate !== null ? `${overall.avgProfitRate}%` : "-"}
            </p>
          </div>
          <div className="bg-muted/40 rounded-lg p-3 text-center">
            <p className="text-muted-foreground text-xs">유저 평균 적중률</p>
            <p className="text-foreground text-xl font-bold">
              {overall.avgAccuracy !== null ? `${overall.avgAccuracy}%` : "-"}
            </p>
          </div>
        </div>

        {/* 참여 통계 */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="bg-muted/40 rounded-lg p-2.5 text-center">
            <p className="text-muted-foreground text-[11px]">참여자</p>
            <p className="text-foreground text-sm font-semibold">{overall.totalParticipants}명</p>
          </div>
          <div className="bg-muted/40 rounded-lg p-2.5 text-center">
            <p className="text-muted-foreground text-[11px]">총 예측</p>
            <p className="text-foreground text-sm font-semibold">
              {overall.settledSlips.toLocaleString()}건
            </p>
          </div>
          <div className="bg-muted/40 rounded-lg p-2.5 text-center">
            <p className="text-muted-foreground text-[11px]">총 배팅</p>
            <p className="text-foreground text-sm font-semibold">
              {formatBalls(overall.totalWagered)} 볼
            </p>
          </div>
        </div>
      </div>
    </Card>
  )
}

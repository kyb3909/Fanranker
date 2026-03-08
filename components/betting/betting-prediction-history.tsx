"use client"

import { Loader2 } from "lucide-react"
import type { PredictionHistoryItem } from "./betting-types"
import { PredictionSlipCard } from "./prediction-slip-card"

interface BettingPredictionHistoryProps {
  predictionHistory: PredictionHistoryItem[]
  isLoading: boolean
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const todayStr = now.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })
  const yesterdayDate = new Date(now)
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterdayStr = yesterdayDate.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })
  const targetStr = date.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })

  const formatted = date.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  })

  if (targetStr === todayStr) return `오늘 · ${formatted}`
  if (targetStr === yesterdayStr) return `어제 · ${formatted}`
  return formatted
}

function getDateKey(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }) // YYYY-MM-DD
}

export function BettingPredictionHistory({
  predictionHistory,
  isLoading,
}: BettingPredictionHistoryProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (predictionHistory.length === 0) {
    return <p className="text-muted-foreground py-8 text-center">예측 내역이 없습니다.</p>
  }

  // 날짜별 그룹핑
  const grouped: { dateKey: string; label: string; items: PredictionHistoryItem[] }[] = []
  let currentKey = ""

  for (const pred of predictionHistory) {
    const key = getDateKey(pred.date)
    if (key !== currentKey) {
      currentKey = key
      grouped.push({ dateKey: key, label: formatDateLabel(pred.date), items: [] })
    }
    grouped[grouped.length - 1].items.push(pred)
  }

  return (
    <div className="space-y-4">
      {grouped.map((group) => (
        <div key={group.dateKey}>
          {/* 날짜 구분선 */}
          <div className="flex items-center gap-3 py-2">
            <div className="border-border flex-1 border-t" />
            <span className="text-muted-foreground shrink-0 text-xs font-medium">
              {group.label}
            </span>
            <div className="border-border flex-1 border-t" />
          </div>
          {/* 해당 날짜의 슬립들 */}
          <div className="space-y-2">
            {group.items.map((pred) => (
              <PredictionSlipCard
                key={pred.id}
                sport={pred.sport}
                date={pred.date}
                status={pred.status}
                matches={pred.matches}
                stake={pred.stake}
                totalOdds={pred.totalOdds}
                profit={pred.profit}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

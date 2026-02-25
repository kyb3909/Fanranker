"use client"

import { Loader2 } from "lucide-react"
import type { PredictionHistoryItem } from "./betting-types"
import { PredictionSlipCard } from "./prediction-slip-card"

interface BettingPredictionHistoryProps {
  predictionHistory: PredictionHistoryItem[]
  isLoading: boolean
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

  return (
    <div className="space-y-2">
      {predictionHistory.map((pred) => (
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
  )
}

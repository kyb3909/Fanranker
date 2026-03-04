"use client"

import { Card } from "@/components/ui/card"
import { Trophy, Target, TrendingUp, Percent } from "lucide-react"
import { type Stats } from "./prediction-types"

export function PredictionStatsSummary({ stats }: { stats: Stats }) {
  const netPoints = Number(stats.totalPointsEarned) - Number(stats.totalPointsUsed)
  const netFormatted = netPoints.toFixed(2)
  const used = Number(stats.totalPointsUsed)
  const profitRate =
    used > 0 ? (((Number(stats.totalPointsEarned) - used) / used) * 100).toFixed(1) : null

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card className="p-4 text-center">
        <Target className="text-primary mx-auto mb-2 h-5 w-5" />
        <p className="text-2xl font-bold">{stats.totalPredictions}</p>
        <p className="text-muted-foreground text-xs">총 예측</p>
      </Card>
      <Card className="p-4 text-center">
        <TrendingUp className="mx-auto mb-2 h-5 w-5 text-blue-500" />
        <p className="text-2xl font-bold">{stats.accuracy.toFixed(1)}%</p>
        <p className="text-muted-foreground text-xs">적중률</p>
      </Card>
      <Card className="p-4 text-center">
        <Percent className="mx-auto mb-2 h-5 w-5 text-emerald-500" />
        <p
          className={`text-2xl font-bold ${
            profitRate === null
              ? ""
              : Number(profitRate) >= 0
                ? "text-emerald-600"
                : "text-primary"
          }`}
        >
          {profitRate === null ? "—" : `${Number(profitRate) >= 0 ? "+" : ""}${profitRate}%`}
        </p>
        <p className="text-muted-foreground text-xs">수익률</p>
      </Card>
      <Card className="p-4 text-center">
        <Trophy className="mx-auto mb-2 h-5 w-5 text-amber-500" />
        <p className={`text-2xl font-bold ${netPoints >= 0 ? "text-emerald-600" : "text-primary"}`}>
          {netPoints >= 0 ? "+" : ""}
          {netFormatted}
        </p>
        <p className="text-muted-foreground text-xs">획득점수</p>
      </Card>
    </div>
  )
}

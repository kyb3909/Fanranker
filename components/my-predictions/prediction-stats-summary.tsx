"use client"

import { Card } from "@/components/ui/card"
import { Trophy, Target, TrendingUp, CheckCircle2 } from "lucide-react"
import { type Stats } from "./prediction-types"

export function PredictionStatsSummary({ stats }: { stats: Stats }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card className="p-4 text-center">
        <Target className="text-primary mx-auto mb-2 h-5 w-5" />
        <p className="text-2xl font-bold">{stats.totalPredictions}</p>
        <p className="text-muted-foreground text-xs">총 예측</p>
      </Card>
      <Card className="p-4 text-center">
        <CheckCircle2 className="mx-auto mb-2 h-5 w-5 text-emerald-500" />
        <p className="text-2xl font-bold">{stats.correctPredictions}</p>
        <p className="text-muted-foreground text-xs">적중</p>
      </Card>
      <Card className="p-4 text-center">
        <TrendingUp className="mx-auto mb-2 h-5 w-5 text-blue-500" />
        <p className="text-2xl font-bold">{stats.accuracy.toFixed(1)}%</p>
        <p className="text-muted-foreground text-xs">적중률</p>
      </Card>
      <Card className="p-4 text-center">
        <Trophy className="mx-auto mb-2 h-5 w-5 text-amber-500" />
        <p className="text-2xl font-bold text-emerald-600">
          +{Number(stats.totalPointsEarned).toFixed(2)}
        </p>
        <p className="text-muted-foreground text-xs">획득 볼</p>
      </Card>
    </div>
  )
}

"use client"

import { Card } from "@/components/ui/card"
import {
  Trophy,
  Target,
  TrendingUp,
  CheckCircle2,
} from "lucide-react"
import { type Stats } from "./prediction-types"

export function PredictionStatsSummary({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      <Card className="p-4 text-center">
        <Target className="h-5 w-5 mx-auto mb-2 text-primary" />
        <p className="text-2xl font-bold">{stats.totalPredictions}</p>
        <p className="text-xs text-muted-foreground">총 예측</p>
      </Card>
      <Card className="p-4 text-center">
        <CheckCircle2 className="h-5 w-5 mx-auto mb-2 text-emerald-500" />
        <p className="text-2xl font-bold">{stats.correctPredictions}</p>
        <p className="text-xs text-muted-foreground">적중</p>
      </Card>
      <Card className="p-4 text-center">
        <TrendingUp className="h-5 w-5 mx-auto mb-2 text-blue-500" />
        <p className="text-2xl font-bold">{stats.accuracy.toFixed(1)}%</p>
        <p className="text-xs text-muted-foreground">적중률</p>
      </Card>
      <Card className="p-4 text-center">
        <Trophy className="h-5 w-5 mx-auto mb-2 text-amber-500" />
        <p className="text-2xl font-bold text-emerald-600">+{stats.totalPointsEarned}</p>
        <p className="text-xs text-muted-foreground">획득 볼</p>
      </Card>
    </div>
  )
}

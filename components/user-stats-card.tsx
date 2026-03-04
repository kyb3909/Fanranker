"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Trophy, Target, TrendingUp, BarChart3 } from "lucide-react"

interface UserStatsCardProps {
  totalPredictions?: number
  correctPredictions?: number
  accuracy?: number
  profit?: number
  roi?: number
  totalPoints?: number
}

export function UserStatsCard({
  totalPredictions = 0,
  correctPredictions = 0,
  accuracy = 0,
  profit = 0,
  roi = 0,
  totalPoints = 0,
}: UserStatsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          예측 통계
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="flex flex-col gap-1">
            <div className="text-xs text-muted-foreground">총 예측</div>
            <div className="text-lg font-bold text-foreground">{totalPredictions.toLocaleString()}</div>
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Target className="h-3 w-3" />
              적중률
            </div>
            <div className="text-lg font-bold text-emerald-600">{accuracy.toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground">
              ({correctPredictions}/{totalPredictions || 1})
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              수익률
            </div>
            <div className={`text-lg font-bold ${roi >= 0 ? 'text-orange-600' : 'text-primary'}`}>
              {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Trophy className="h-3 w-3" />
              총 수익
            </div>
            <div className={`text-lg font-bold ${profit >= 0 ? 'text-blue-600' : 'text-primary'}`}>
              {profit >= 0 ? '+' : ''}{profit.toLocaleString()}P
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

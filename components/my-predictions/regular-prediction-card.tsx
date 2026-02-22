"use client"

import { Card } from "@/components/ui/card"
import {
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react"
import { type RegularPrediction } from "./prediction-types"

// Regular Prediction Card (for non-betman predictions)
export function RegularPredictionCard({ prediction }: { prediction: RegularPrediction }) {
  return (
    <Card className="p-4 overflow-hidden">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* Match Info */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded font-medium">
              {prediction.match.league}
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(prediction.match.matchTime).toLocaleDateString("ko-KR", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>

          {/* Teams */}
          <p className="font-medium text-sm mb-2">
            {prediction.match.homeTeam} vs {prediction.match.awayTeam}
          </p>

          {/* Prediction Info */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs px-2 py-1 bg-muted rounded">
              예측: {
                prediction.predictedValue === "home" ? prediction.match.homeTeam + " 승" :
                prediction.predictedValue === "away" ? prediction.match.awayTeam + " 승" :
                prediction.predictedValue === "over" ? "오버" :
                prediction.predictedValue === "under" ? "언더" :
                prediction.predictedValue === "draw" ? "무승부" : prediction.predictedValue
              }
            </span>
            <span className="text-xs text-muted-foreground">
              배당 {prediction.oddsAtPrediction.toFixed(2)}
            </span>
            <span className="text-xs text-muted-foreground">
              {prediction.amount}볼 사용
            </span>
          </div>
        </div>

        {/* Result */}
        <div className="text-right">
          {prediction.isCorrect === null ? (
            <div className="flex items-center gap-1 text-amber-500">
              <Clock className="h-4 w-4" />
              <span className="text-xs font-medium">대기중</span>
            </div>
          ) : prediction.isCorrect ? (
            <div>
              <div className="flex items-center gap-1 text-emerald-500 mb-1">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-xs font-medium">적중</span>
              </div>
              <p className="text-sm font-bold text-emerald-600">
                +{prediction.pointsEarned} 볼
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-red-500">
              <XCircle className="h-4 w-4" />
              <span className="text-xs font-medium">미적중</span>
            </div>
          )}
        </div>
      </div>

      {/* Match Result (if finished) */}
      {prediction.match.status === "finished" && prediction.match.homeScore !== undefined && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs text-muted-foreground">
            최종 스코어: {prediction.match.homeTeam} {prediction.match.homeScore} - {prediction.match.awayScore} {prediction.match.awayTeam}
          </p>
        </div>
      )}
    </Card>
  )
}

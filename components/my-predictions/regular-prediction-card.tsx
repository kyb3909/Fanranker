"use client"

import { Card } from "@/components/ui/card"
import { CheckCircle2, XCircle, Clock } from "lucide-react"
import { type RegularPrediction } from "./prediction-types"

// Regular Prediction Card (for non-betman predictions)
export function RegularPredictionCard({ prediction }: { prediction: RegularPrediction }) {
  return (
    <Card className="overflow-hidden p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* Match Info */}
          <div className="mb-2 flex items-center gap-2">
            <span className="bg-primary/10 text-primary rounded px-2 py-0.5 text-xs font-medium">
              {prediction.match.league}
            </span>
            <span className="text-muted-foreground text-xs">
              {new Date(prediction.match.matchTime).toLocaleDateString("ko-KR", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>

          {/* Teams */}
          <p className="mb-2 text-sm font-medium">
            {prediction.match.homeTeam} vs {prediction.match.awayTeam}
          </p>

          {/* Prediction Info */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-muted rounded px-2 py-1 text-xs">
              예측:{" "}
              {prediction.predictedValue === "home"
                ? prediction.match.homeTeam + " 승"
                : prediction.predictedValue === "away"
                  ? prediction.match.awayTeam + " 승"
                  : prediction.predictedValue === "over"
                    ? "오버"
                    : prediction.predictedValue === "under"
                      ? "언더"
                      : prediction.predictedValue === "draw"
                        ? "무승부"
                        : prediction.predictedValue}
            </span>
            <span className="text-muted-foreground text-xs">
              배당 {prediction.oddsAtPrediction.toFixed(2)}
            </span>
            <span className="text-muted-foreground text-xs">{prediction.amount}볼 사용</span>
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
              <div className="mb-1 flex items-center gap-1 text-emerald-500">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-xs font-medium">적중</span>
              </div>
              <p className="text-sm font-bold text-emerald-600">
                +{Number(prediction.pointsEarned).toFixed(2)} 볼
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-primary">
              <XCircle className="h-4 w-4" />
              <span className="text-xs font-medium">미적중</span>
            </div>
          )}
        </div>
      </div>

      {/* Match Result (if finished) */}
      {prediction.match.status === "finished" && prediction.match.homeScore !== undefined && (
        <div className="border-border mt-3 border-t pt-3">
          <p className="text-muted-foreground text-xs">
            최종 스코어: {prediction.match.homeTeam} {prediction.match.homeScore} -{" "}
            {prediction.match.awayScore} {prediction.match.awayTeam}
          </p>
        </div>
      )}
    </Card>
  )
}

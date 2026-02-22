"use client"

import { Card } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import type { PredictionHistoryItem } from "./betting-types"
import { sportColorFill } from "./betting-types"

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
      <div className="flex justify-center items-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (predictionHistory.length === 0) {
    return <p className="text-center text-muted-foreground py-8">예측 내역이 없습니다.</p>
  }

  return (
    <div className="space-y-2">
      {predictionHistory.map((pred) => (
        <Card key={pred.id} className="overflow-hidden border-0 shadow-sm">
          <div
            className={`p-2 text-xs flex items-center justify-between ${
              pred.sport === "축구"
                ? "bg-rose-50"
                : pred.sport === "야구"
                  ? "bg-blue-50"
                  : pred.sport === "농구"
                    ? "bg-orange-50"
                    : "bg-purple-50"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`font-semibold ${
                  pred.sport === "축구"
                    ? "text-rose-700"
                    : pred.sport === "야구"
                      ? "text-blue-700"
                      : pred.sport === "농구"
                        ? "text-orange-700"
                        : "text-purple-700"
                }`}
              >
                {pred.sport === "축구"
                  ? "⚽"
                  : pred.sport === "야구"
                    ? "⚾"
                    : pred.sport === "농구"
                      ? "🏀"
                      : "🏐"}{" "}
                {pred.sport}
              </span>
              <span className="text-gray-500">{pred.date}</span>
            </div>
            <div
              className={`text-xs font-semibold px-2 py-0.5 rounded ${
                pred.status === "win"
                  ? "bg-green-100 text-green-700"
                  : pred.status === "lose"
                    ? "bg-red-100 text-red-700"
                    : "bg-gray-100 text-gray-700"
              }`}
            >
              {pred.status === "win" ? "적중" : pred.status === "lose" ? "미적중" : "대기중"}
            </div>
          </div>
          <div className="p-3 space-y-2">
            {pred.matches.map((match, idx) => {
              const sportKey = pred.sport === "축구" ? "soccer" : pred.sport === "야구" ? "baseball" : pred.sport === "농구" ? "basketball" : "volleyball"
              const fillColor = sportColorFill[sportKey]
              const hasDrawOdds = pred.sport === "축구"

              return (
                <div key={idx} className="bg-white rounded-lg border overflow-hidden">
                  <div className="px-3 py-1.5 bg-gray-100 flex justify-between text-xs text-gray-600">
                    <span>{match.league}</span>
                  </div>
                  <div className={`p-2 grid ${hasDrawOdds ? 'grid-cols-3' : 'grid-cols-2'} gap-1`}>
                    <div
                      className={`rounded-lg p-2 text-center ${
                        match.selection === "홈팀"
                          ? `${fillColor.bg} ${fillColor.border} border`
                          : "bg-gray-50"
                      }`}
                    >
                      <div className={`text-xs truncate ${match.selection === "홈팀" ? fillColor.text : "text-gray-600"}`}>
                        {match.home}
                      </div>
                      <div className={`font-bold text-sm ${match.selection === "홈팀" ? fillColor.text : "text-gray-900"}`}>
                        {match.odds}
                      </div>
                    </div>
                    {hasDrawOdds && (
                      <div
                        className={`rounded-lg p-2 text-center ${
                          match.selection === "무"
                            ? `${fillColor.bg} ${fillColor.border} border`
                            : "bg-gray-50"
                        }`}
                      >
                        <div className={`text-xs ${match.selection === "무" ? fillColor.text : "text-gray-600"}`}>
                          무
                        </div>
                        <div className={`font-bold text-sm ${match.selection === "무" ? fillColor.text : "text-gray-900"}`}>
                          {match.odds}
                        </div>
                      </div>
                    )}
                    <div
                      className={`rounded-lg p-2 text-center ${
                        match.selection === "원정팀"
                          ? `${fillColor.bg} ${fillColor.border} border`
                          : "bg-gray-50"
                      }`}
                    >
                      <div className={`text-xs truncate ${match.selection === "원정팀" ? fillColor.text : "text-gray-600"}`}>
                        {match.away}
                      </div>
                      <div className={`font-bold text-sm ${match.selection === "원정팀" ? fillColor.text : "text-gray-900"}`}>
                        {match.odds}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
            <div className="mt-3 pt-3 border-t flex justify-between items-center">
              <div className="text-xs text-gray-600">
                배팅금: {pred.stake.toLocaleString()}G | 총배당: {pred.totalOdds}배
              </div>
              <div
                className={`text-sm font-semibold ${
                  pred.status === "win"
                    ? "text-green-600"
                    : pred.status === "lose"
                      ? "text-red-600"
                      : "text-gray-600"
                }`}
              >
                {pred.status === "pending"
                  ? "대기중"
                  : `${pred.profit > 0 ? "+" : ""}${pred.profit.toLocaleString()}G`}
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

"use client"

import { Card } from "@/components/ui/card"
import type { PredictionMatch } from "./betting-types"
import { sportColorFill, SPORT_ICONS } from "./betting-types"

const SPORT_HEADER_STYLES: Record<string, { bg: string; text: string }> = {
  축구: { bg: "bg-rose-50", text: "text-rose-700" },
  야구: { bg: "bg-blue-50", text: "text-blue-700" },
  농구: { bg: "bg-orange-50", text: "text-orange-700" },
  배구: { bg: "bg-purple-50", text: "text-purple-700" },
}

const DEFAULT_HEADER_STYLE = { bg: "bg-muted", text: "text-foreground" }

export interface PredictionSlipCardProps {
  sport: string
  date: string
  status: string // "win" | "lose" | "pending"
  matches: PredictionMatch[]
  stake: number
  totalOdds: number
  profit: number
}

export function PredictionSlipCard({
  sport,
  date,
  status,
  matches,
  stake,
  totalOdds,
  profit,
}: PredictionSlipCardProps) {
  return (
    <Card className="overflow-hidden border-0 shadow-sm">
      <div
        className={`flex items-center justify-between p-2 text-xs ${
          (SPORT_HEADER_STYLES[sport] || DEFAULT_HEADER_STYLE).bg
        }`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`font-semibold ${(SPORT_HEADER_STYLES[sport] || DEFAULT_HEADER_STYLE).text}`}
          >
            {SPORT_ICONS[sport] || "🎯"} {sport}
          </span>
          <span className="text-muted-foreground">{date}</span>
        </div>
        <div
          className={`rounded px-2 py-0.5 text-xs font-semibold ${
            status === "win"
              ? "bg-green-100 text-green-700"
              : status === "lose"
                ? "bg-red-100 text-red-700"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {status === "win" ? "적중" : status === "lose" ? "미적중" : "대기중"}
        </div>
      </div>
      <div className="space-y-2 p-3">
        {matches.map((match, idx) => {
          const fillColor = sportColorFill[sport] || sportColorFill["축구"]
          const isOverUnder = match.selection === "오버" || match.selection === "언더"
          const hasDrawOdds = !isOverUnder && sport === "축구"

          return (
            <div key={idx} className="bg-card overflow-hidden rounded-lg border">
              <div className="bg-muted text-muted-foreground flex justify-between px-3 py-1.5 text-xs">
                <span>{match.league}</span>
              </div>
              {isOverUnder ? (
                <div className="grid grid-cols-2 gap-1 p-2">
                  <div
                    className={`rounded-lg p-2 text-center ${
                      match.selection === "오버"
                        ? `${fillColor.bg} ${fillColor.border} border`
                        : "bg-muted/50"
                    }`}
                  >
                    <div
                      className={`text-xs ${match.selection === "오버" ? fillColor.text : "text-muted-foreground"}`}
                    >
                      오버
                    </div>
                    <div
                      className={`text-sm font-bold ${match.selection === "오버" ? fillColor.text : "text-foreground"}`}
                    >
                      {match.odds}
                    </div>
                  </div>
                  <div
                    className={`rounded-lg p-2 text-center ${
                      match.selection === "언더"
                        ? `${fillColor.bg} ${fillColor.border} border`
                        : "bg-muted/50"
                    }`}
                  >
                    <div
                      className={`text-xs ${match.selection === "언더" ? fillColor.text : "text-muted-foreground"}`}
                    >
                      언더
                    </div>
                    <div
                      className={`text-sm font-bold ${match.selection === "언더" ? fillColor.text : "text-foreground"}`}
                    >
                      {match.odds}
                    </div>
                  </div>
                </div>
              ) : (
                <div className={`grid p-2 ${hasDrawOdds ? "grid-cols-3" : "grid-cols-2"} gap-1`}>
                  <div
                    className={`rounded-lg p-2 text-center ${
                      match.selection === "홈팀"
                        ? `${fillColor.bg} ${fillColor.border} border`
                        : "bg-muted/50"
                    }`}
                  >
                    <div
                      className={`truncate text-xs ${match.selection === "홈팀" ? fillColor.text : "text-muted-foreground"}`}
                    >
                      {match.home}
                    </div>
                    <div
                      className={`text-sm font-bold ${match.selection === "홈팀" ? fillColor.text : "text-foreground"}`}
                    >
                      {match.odds}
                    </div>
                  </div>
                  {hasDrawOdds && (
                    <div
                      className={`rounded-lg p-2 text-center ${
                        match.selection === "무"
                          ? `${fillColor.bg} ${fillColor.border} border`
                          : "bg-muted/50"
                      }`}
                    >
                      <div
                        className={`text-xs ${match.selection === "무" ? fillColor.text : "text-muted-foreground"}`}
                      >
                        무
                      </div>
                      <div
                        className={`text-sm font-bold ${match.selection === "무" ? fillColor.text : "text-foreground"}`}
                      >
                        {match.odds}
                      </div>
                    </div>
                  )}
                  <div
                    className={`rounded-lg p-2 text-center ${
                      match.selection === "원정팀"
                        ? `${fillColor.bg} ${fillColor.border} border`
                        : "bg-muted/50"
                    }`}
                  >
                    <div
                      className={`truncate text-xs ${match.selection === "원정팀" ? fillColor.text : "text-muted-foreground"}`}
                    >
                      {match.away}
                    </div>
                    <div
                      className={`text-sm font-bold ${match.selection === "원정팀" ? fillColor.text : "text-foreground"}`}
                    >
                      {match.odds}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        <div className="mt-3 flex items-center justify-between border-t pt-3">
          <div className="text-muted-foreground text-xs">
            배팅금: {stake.toLocaleString()}볼 | 총배당: {totalOdds}배
          </div>
          <div
            className={`text-sm font-semibold ${
              status === "win"
                ? "text-green-600"
                : status === "lose"
                  ? "text-red-600"
                  : "text-muted-foreground"
            }`}
          >
            {status === "pending"
              ? "대기중"
              : `${profit > 0 ? "+" : ""}${profit.toLocaleString()}볼`}
          </div>
        </div>
      </div>
    </Card>
  )
}

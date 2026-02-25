"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Clock, CheckCircle2 } from "lucide-react"
import type { GroupedMatch, SelectedBet } from "./betting-types"
import { sportColorFill, SPORT_ICONS, gameTypeLabels, formatMatchTime } from "./betting-types"

interface BettingMatchCardProps {
  groupedMatch: GroupedMatch
  selectedBets: SelectedBet[]
  selectedSport: string | null
  onBetSelection: (
    gameId: string,
    matchKey: string,
    selection: string,
    sport: string,
    gameType: string,
    handicap: number | null,
    overUnderLine: number | null,
    odds?: number
  ) => void
}

export function BettingMatchCard({
  groupedMatch,
  selectedBets,
  selectedSport,
  onBetSelection,
}: BettingMatchCardProps) {
  const fillColor = sportColorFill[groupedMatch.sport] || sportColorFill["축구"]
  const hasSelectionFromThisMatch = selectedBets.some((b) => b.matchKey === groupedMatch.matchKey)

  return (
    <Card
      className={`overflow-hidden border-0 shadow-sm ${hasSelectionFromThisMatch ? "ring-primary ring-2" : ""}`}
    >
      {/* Match Header */}
      <div className="bg-accent-surface text-accent-surface-foreground flex items-center justify-between px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{SPORT_ICONS[groupedMatch.sport] || "⚽"}</span>
          <span className="text-xs font-medium">{groupedMatch.leagueCode}</span>
        </div>
        <div className="text-accent-surface-foreground/90 flex items-center gap-1 text-xs">
          <Clock className="h-3 w-3" />
          <span>{formatMatchTime(groupedMatch.matchTime)}</span>
        </div>
      </div>

      {/* Teams */}
      <div className="px-2 pb-1">
        <div className="flex items-center justify-center gap-2 py-1">
          <span className="text-sm font-bold">{groupedMatch.homeTeam}</span>
          <span className="text-muted-foreground text-xs">vs</span>
          <span className="text-sm font-bold">{groupedMatch.awayTeam}</span>
        </div>
      </div>

      {/* Game Types */}
      <div className="space-y-1.5 px-2 pb-2">
        {groupedMatch.games.map((game) => {
          const isSUM = game.game_type === "SUM" || game.game_type === "SSUM"
          const isOverUnder = game.game_type.includes("언더오버")
          const isBasketball = game.sport === "농구"
          const gameTypeLabel = gameTypeLabels[game.game_type] || game.game_type
          const selectedBet = selectedBets.find((b) => b.gameId === game.id)
          const sportMismatch = selectedSport !== null && selectedSport !== game.sport
          const gameBetClosed = game.is_bettable === false
          const isDisabled =
            sportMismatch || (hasSelectionFromThisMatch && !selectedBet) || gameBetClosed

          // Build odds options based on game type
          let options: Array<{ value: string; label: string; odds?: number }>
          if (isSUM) {
            options = [
              { value: "odd", label: "홀", odds: game.odd_odds },
              { value: "even", label: "짝", odds: game.even_odds },
            ]
          } else if (isOverUnder) {
            options = [
              { value: "over", label: "오버", odds: game.over_odds },
              { value: "under", label: "언더", odds: game.under_odds },
            ]
          } else {
            options = [
              { value: "home", label: groupedMatch.homeTeam.slice(0, 4), odds: game.home_odds },
              ...(!isBasketball ? [{ value: "draw", label: "무", odds: game.draw_odds }] : []),
              { value: "away", label: groupedMatch.awayTeam.slice(0, 4), odds: game.away_odds },
            ]
          }

          const isTwoColumn = isSUM || isOverUnder || isBasketball

          return (
            <div key={game.id} className="bg-muted/50 rounded-lg border p-1.5">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                <div className="flex items-center gap-1">
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                    {gameTypeLabel}
                  </Badge>
                  {/* Handicap badge */}
                  {game.game_type.includes("핸디캡") &&
                    (game.handicap !== null && game.handicap !== 0 ? (
                      <Badge
                        variant="outline"
                        className="bg-primary/10 text-primary border-primary/20 px-1.5 py-0 text-[10px]"
                      >
                        {groupedMatch.homeTeam.slice(0, 3)} {game.handicap > 0 ? "+" : ""}
                        {game.handicap}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-muted text-muted-foreground border-border px-1.5 py-0 text-[10px]"
                      >
                        핸디캡 정보 없음
                      </Badge>
                    ))}
                  {/* Over/Under line badge */}
                  {game.game_type.includes("언더오버") &&
                    (game.over_under_line !== null && game.over_under_line !== undefined ? (
                      <Badge
                        variant="outline"
                        className="border-purple-200 bg-purple-50 px-1.5 py-0 text-[10px] text-purple-600"
                      >
                        기준 {game.over_under_line}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="bg-muted text-muted-foreground border-border px-1.5 py-0 text-[10px]"
                      >
                        기준선 정보 없음
                      </Badge>
                    ))}
                </div>
                {gameBetClosed && (
                  <span className="text-[10px] font-medium text-red-500">마감</span>
                )}
                {sportMismatch && !gameBetClosed && (
                  <span className="text-[10px] text-orange-500">다른 종목</span>
                )}
              </div>
              <div className={`grid gap-1 ${isTwoColumn ? "grid-cols-2" : "grid-cols-3"}`}>
                {options.map((opt) => (
                  <button
                    key={opt.value}
                    className={`rounded-md px-1.5 py-1 text-center transition-all ${
                      selectedBet?.selection === opt.value
                        ? `${fillColor.bg} ${fillColor.text} border ${fillColor.border}`
                        : "bg-card hover:bg-accent border"
                    } ${isDisabled ? "cursor-not-allowed opacity-50" : ""}`}
                    onClick={() =>
                      !isDisabled &&
                      onBetSelection(
                        game.id,
                        groupedMatch.matchKey,
                        opt.value,
                        game.sport,
                        game.game_type,
                        game.handicap,
                        game.over_under_line,
                        opt.odds
                      )
                    }
                    disabled={isDisabled}
                    aria-label={`${opt.label} 선택, 배당 ${opt.odds ? opt.odds.toFixed(2) : "없음"}`}
                    aria-pressed={selectedBet?.selection === opt.value}
                  >
                    <div className="text-muted-foreground truncate text-[10px]">{opt.label}</div>
                    <div
                      className={`text-xs font-bold ${selectedBet?.selection === opt.value ? "" : "text-foreground"}`}
                    >
                      {opt.odds ? opt.odds.toFixed(2) : "-"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Selection Status */}
      {hasSelectionFromThisMatch && (
        <div className="px-2 pb-1.5">
          <div className="flex items-center justify-center gap-1.5 rounded bg-emerald-50 py-1 text-emerald-600">
            <CheckCircle2 className="h-3 w-3" />
            <span className="text-[10px] font-medium">선택됨</span>
          </div>
        </div>
      )}
    </Card>
  )
}

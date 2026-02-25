"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ChevronDown, ChevronUp, Target, Coins, Loader2, X } from "lucide-react"
import type { SelectedBet, GroupedMatch } from "./betting-types"
import { gameTypeLabels, formatMatchTime, SPORT_ICONS } from "./betting-types"

interface BettingSlipProps {
  selectedBets: SelectedBet[]
  groupedMatches: GroupedMatch[]
  isSlipExpanded: boolean
  setIsSlipExpanded: (expanded: boolean) => void
  betAmount: number
  setBetAmount: (amount: number) => void
  userBalls: number
  totalOdds: number
  expectedReturn: number
  isSubmitting: boolean
  onRemoveBet: (gameId: string) => void
  onClearAllBets: () => void
  onSubmit: () => void
}

export function BettingSlip({
  selectedBets,
  groupedMatches,
  isSlipExpanded,
  setIsSlipExpanded,
  betAmount,
  setBetAmount,
  userBalls,
  totalOdds,
  expectedReturn,
  isSubmitting,
  onRemoveBet,
  onClearAllBets,
  onSubmit,
}: BettingSlipProps) {
  if (selectedBets.length === 0) return null

  return (
    <div className="from-background via-background sticky bottom-0 z-40 -mx-0 bg-gradient-to-t to-transparent pt-2 pb-0 sm:pt-4">
      <Card className="bg-card rounded-lg border shadow-lg">
        <div
          className="flex cursor-pointer items-center justify-between p-2 sm:p-3"
          onClick={() => setIsSlipExpanded(!isSlipExpanded)}
          role="button"
          aria-expanded={isSlipExpanded}
          aria-label={`베팅 슬립 ${isSlipExpanded ? "접기" : "펼치기"}, ${selectedBets.length}경기 선택됨`}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              setIsSlipExpanded(!isSlipExpanded)
            }
          }}
        >
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-xs font-medium sm:text-sm">{selectedBets.length}경기 선택</span>
            {selectedBets.length > 0 && selectedBets[0].sport && (
              <span className="text-muted-foreground bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[10px] sm:text-xs">
                {SPORT_ICONS[selectedBets[0].sport] || "🎯"} {selectedBets[0].sport}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {isSlipExpanded ? (
              <ChevronDown className="h-5 w-5" />
            ) : (
              <ChevronUp className="h-5 w-5" />
            )}
          </div>
        </div>

        {isSlipExpanded && (
          <div className="border-t px-3 py-2">
            {/* Clear all button */}
            <div className="border-border flex items-center justify-between border-b pb-2">
              <span className="text-muted-foreground text-xs">
                선택한 경기 {selectedBets.length}개
              </span>
              <button
                onClick={onClearAllBets}
                className="text-xs font-medium text-red-500 hover:text-red-600"
                aria-label="선택한 경기 전체 삭제"
              >
                전체 삭제
              </button>
            </div>

            {/* Selected bets list */}
            <div className="divide-border divide-y">
              {selectedBets.map((bet) => {
                const groupedMatch = groupedMatches.find((m) => m.matchKey === bet.matchKey)
                const game = groupedMatch?.games.find((g) => g.id === bet.gameId)
                if (!groupedMatch || !game) return null
                return (
                  <div key={bet.gameId} className="group relative py-2">
                    {/* Remove button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemoveBet(bet.gameId)
                      }}
                      className="text-muted-foreground absolute top-2 right-0 flex h-5 w-5 items-center justify-center transition-colors hover:text-red-500"
                      aria-label={`${groupedMatch.homeTeam} vs ${groupedMatch.awayTeam} 선택 삭제`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                    {/* League & time */}
                    <div className="text-muted-foreground mb-0.5 flex flex-wrap items-center gap-2 text-[11px]">
                      <span>{groupedMatch.leagueCode}</span>
                      <span className="text-border">|</span>
                      <span>{formatMatchTime(groupedMatch.matchTime)}</span>
                      <span className="text-border">|</span>
                      <span className="text-primary">
                        {gameTypeLabels[bet.gameType] || bet.gameType}
                      </span>
                      {/* Handicap info */}
                      {bet.gameType.includes("핸디캡") && bet.handicap !== null && (
                        <span className="text-primary font-medium">
                          ({groupedMatch.homeTeam.slice(0, 4)} {bet.handicap > 0 ? "+" : ""}
                          {bet.handicap})
                        </span>
                      )}
                      {/* Over/Under line */}
                      {bet.gameType.includes("언더오버") && bet.overUnderLine != null && (
                        <span className="font-medium text-purple-600">
                          (기준 {bet.overUnderLine})
                        </span>
                      )}
                    </div>
                    {/* Teams */}
                    <div className="text-foreground mb-1 pr-6 text-sm">
                      {groupedMatch.homeTeam} vs {groupedMatch.awayTeam}
                    </div>
                    {/* Selection & odds */}
                    <div className="flex items-center justify-between">
                      <span className="text-primary text-sm font-medium">
                        선택:{" "}
                        {bet.selection === "home" || bet.selection === "1"
                          ? groupedMatch.homeTeam
                          : bet.selection === "away" || bet.selection === "2"
                            ? groupedMatch.awayTeam
                            : bet.selection === "draw" || bet.selection === "X"
                              ? "무승부"
                              : bet.selection === "over"
                                ? "오버"
                                : bet.selection === "under"
                                  ? "언더"
                                  : bet.selection === "odd"
                                    ? "홀"
                                    : bet.selection === "even"
                                      ? "짝"
                                      : bet.selection}
                        {bet.handicap !== null &&
                          ` (${bet.handicap > 0 ? "+" : ""}${bet.handicap})`}
                      </span>
                      {bet.odds && (
                        <span className="text-sm font-bold text-emerald-600">
                          {bet.odds.toFixed(2)}배
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Bet amount input */}
            <div className="border-border mt-2 space-y-3 border-t pt-3">
              {/* Ball balance */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">보유 볼</span>
                <span className="flex items-center gap-1 font-medium">
                  <Coins className="h-4 w-4 text-yellow-500" />
                  {userBalls.toLocaleString()}
                </span>
              </div>

              {/* Bet amount */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">베팅 금액</span>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={betAmount}
                      onChange={(e) =>
                        setBetAmount(
                          Math.max(0, Math.min(userBalls, parseInt(e.target.value) || 0))
                        )
                      }
                      className="h-8 w-24 text-right text-sm"
                      min={0}
                      max={userBalls}
                    />
                    <span className="text-muted-foreground text-sm">볼</span>
                  </div>
                </div>
                {/* Quick amount buttons */}
                <div className="flex gap-1">
                  {[1, 3, 5, 10].map((amount) => (
                    <button
                      key={amount}
                      onClick={() => setBetAmount(Math.min(amount, userBalls))}
                      className={`flex-1 rounded border py-1 text-xs transition-colors ${
                        betAmount === amount
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/50 hover:bg-muted border-border"
                      } ${amount > userBalls ? "opacity-50" : ""}`}
                      disabled={amount > userBalls}
                    >
                      {amount}
                    </button>
                  ))}
                </div>
              </div>

              {/* Odds & expected return */}
              <div className="bg-muted/30 space-y-2 rounded-lg p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">총 배당률</span>
                  <span className="text-primary font-bold">{totalOdds.toFixed(2)}배</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">예상 획득</span>
                  <span className="flex items-center gap-1 text-lg font-bold text-emerald-600">
                    <Coins className="h-4 w-4 text-yellow-500" />
                    {expectedReturn.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Submit button */}
              <Button
                className="bg-primary hover:bg-primary/90 text-primary-foreground h-11 w-full"
                onClick={onSubmit}
                disabled={isSubmitting || selectedBets.length === 0 || betAmount <= 0}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span className="flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    {selectedBets.length}경기 {betAmount.toLocaleString()}볼 예측하기
                  </span>
                )}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

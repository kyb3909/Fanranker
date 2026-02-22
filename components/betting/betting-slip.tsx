"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  ChevronDown,
  ChevronUp,
  Target,
  Coins,
  Loader2,
  X,
} from "lucide-react"
import type { SelectedBet, GroupedMatch } from "./betting-types"
import { gameTypeLabels, formatMatchTime } from "./betting-types"

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
    <div className="sticky bottom-0 z-40 pt-2 sm:pt-4 -mx-0 bg-gradient-to-t from-background via-background to-transparent pb-0">
      <Card className="rounded-lg shadow-lg border bg-card">
        <div
          className="flex items-center justify-between p-2 sm:p-3 cursor-pointer"
          onClick={() => setIsSlipExpanded(!isSlipExpanded)}
          role="button"
          aria-expanded={isSlipExpanded}
          aria-label={`베팅 슬립 ${isSlipExpanded ? '접기' : '펼치기'}, ${selectedBets.length}경기 선택됨`}
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsSlipExpanded(!isSlipExpanded) } }}
        >
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="font-medium text-xs sm:text-sm">{selectedBets.length}경기 선택</span>
            {selectedBets.length > 0 && selectedBets[0].sport && (
              <span className="text-[10px] sm:text-xs text-muted-foreground bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                {selectedBets[0].sport === "축구" ? "⚽ 축구" : "🏀 농구"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {isSlipExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
          </div>
        </div>

        {isSlipExpanded && (
          <div className="border-t px-3 py-2">
            {/* Clear all button */}
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <span className="text-xs text-muted-foreground">선택한 경기 {selectedBets.length}개</span>
              <button
                onClick={onClearAllBets}
                className="text-xs text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 font-medium"
                aria-label="선택한 경기 전체 삭제"
              >
                전체 삭제
              </button>
            </div>

            {/* Selected bets list */}
            <div className="divide-y divide-border">
              {selectedBets.map((bet) => {
                const groupedMatch = groupedMatches.find((m) => m.matchKey === bet.matchKey)
                const game = groupedMatch?.games.find((g) => g.id === bet.gameId)
                if (!groupedMatch || !game) return null
                return (
                  <div key={bet.gameId} className="py-2 relative group">
                    {/* Remove button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemoveBet(bet.gameId)
                      }}
                      className="absolute top-2 right-0 w-5 h-5 text-muted-foreground hover:text-red-500 dark:hover:text-red-400 flex items-center justify-center transition-colors"
                      aria-label={`${groupedMatch.homeTeam} vs ${groupedMatch.awayTeam} 선택 삭제`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                    {/* League & time */}
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-0.5 flex-wrap">
                      <span>{groupedMatch.leagueCode}</span>
                      <span className="text-border">|</span>
                      <span>{formatMatchTime(groupedMatch.matchTime)}</span>
                      <span className="text-border">|</span>
                      <span className="text-primary">{gameTypeLabels[bet.gameType] || bet.gameType}</span>
                      {/* Handicap info */}
                      {bet.gameType.includes('핸디캡') && bet.handicap !== null && (
                        <span className="text-primary font-medium">
                          ({groupedMatch.homeTeam.slice(0, 4)} {bet.handicap > 0 ? '+' : ''}{bet.handicap})
                        </span>
                      )}
                      {/* Over/Under line */}
                      {bet.gameType.includes('언더오버') && bet.overUnderLine != null && (
                        <span className="text-purple-600 font-medium">
                          (기준 {bet.overUnderLine})
                        </span>
                      )}
                    </div>
                    {/* Teams */}
                    <div className="text-sm text-foreground mb-1 pr-6">
                      {groupedMatch.homeTeam} vs {groupedMatch.awayTeam}
                    </div>
                    {/* Selection & odds */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-primary font-medium">
                        선택: {bet.selection === "home" || bet.selection === "1"
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
                        {bet.handicap !== null && ` (${bet.handicap > 0 ? '+' : ''}${bet.handicap})`}
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
            <div className="pt-3 mt-2 border-t border-border space-y-3">
              {/* Ball balance */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">보유 볼</span>
                <span className="font-medium flex items-center gap-1">
                  <Coins className="w-4 h-4 text-yellow-500" />
                  {userBalls.toLocaleString()}
                </span>
              </div>

              {/* Bet amount */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">베팅 금액</span>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={betAmount}
                      onChange={(e) => setBetAmount(Math.max(0, Math.min(userBalls, parseInt(e.target.value) || 0)))}
                      className="w-24 h-8 text-right text-sm"
                      min={0}
                      max={userBalls}
                    />
                    <span className="text-sm text-muted-foreground">볼</span>
                  </div>
                </div>
                {/* Quick amount buttons */}
                <div className="flex gap-1">
                  {[1, 3, 5, 10].map((amount) => (
                    <button
                      key={amount}
                      onClick={() => setBetAmount(Math.min(amount, userBalls))}
                      className={`flex-1 py-1 text-xs rounded border transition-colors ${
                        betAmount === amount
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted/50 hover:bg-muted border-border'
                      } ${amount > userBalls ? 'opacity-50' : ''}`}
                      disabled={amount > userBalls}
                    >
                      {amount}
                    </button>
                  ))}
                </div>
              </div>

              {/* Odds & expected return */}
              <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">총 배당률</span>
                  <span className="font-bold text-primary">{totalOdds.toFixed(2)}배</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">예상 획득</span>
                  <span className="font-bold text-lg text-emerald-600 flex items-center gap-1">
                    <Coins className="w-4 h-4 text-yellow-500" />
                    {expectedReturn.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Submit button */}
              <Button
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-11"
                onClick={onSubmit}
                disabled={isSubmitting || selectedBets.length === 0 || betAmount <= 0}
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span className="flex items-center gap-2">
                    <Target className="w-4 h-4" />
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

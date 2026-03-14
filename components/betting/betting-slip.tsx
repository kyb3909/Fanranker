"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ChevronDown, ChevronUp, Target, Circle, Loader2, X, Newspaper } from "lucide-react"
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
  isJournalist?: boolean
  analysisTitle?: string
  setAnalysisTitle?: (text: string) => void
  analysisText?: string
  setAnalysisText?: (text: string) => void
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
  isJournalist,
  analysisTitle = "",
  setAnalysisTitle,
  analysisText = "",
  setAnalysisText,
}: BettingSlipProps) {
  if (selectedBets.length === 0) return null

  return (
    <>
      {isSlipExpanded && (
        <div
          className="fixed inset-0 z-30 bg-black/40"
          onClick={() => setIsSlipExpanded(false)}
          aria-hidden="true"
        />
      )}
      <div className="from-background via-background sticky bottom-0 z-40 bg-gradient-to-t to-transparent pt-2 pb-2 sm:pt-4 sm:pb-3">
        <Card className="bg-card border-primary/30 ring-primary/10 rounded-lg border-2 shadow-xl ring-1">
          <div
            className="flex cursor-pointer items-center justify-between p-3 sm:p-4"
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
            <div className="border-t px-4 py-3 sm:px-5 sm:py-4">
              {/* Clear all button */}
              <div className="border-border flex items-center justify-between border-b pb-2">
                <span className="text-muted-foreground text-xs">
                  선택한 경기 {selectedBets.length}개
                </span>
                <button
                  onClick={onClearAllBets}
                  className="text-primary hover:text-primary/80 text-xs font-medium"
                  aria-label="선택한 경기 전체 삭제"
                >
                  전체 삭제
                </button>
              </div>

              {/* Selected bets list */}
              <div className="divide-border max-h-[40vh] divide-y overflow-y-auto">
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
                        className="text-muted-foreground hover:text-primary absolute top-2 right-0 flex h-5 w-5 items-center justify-center transition-colors"
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
                    <Circle className="fill-primary text-primary h-3.5 w-3.5" />
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
                        className="h-8 w-20 text-right text-sm sm:w-24"
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

                {/* Journalist analysis */}
                {isJournalist && setAnalysisText && setAnalysisTitle && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Newspaper className="h-3.5 w-3.5 text-blue-500" />
                      <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                        분석글
                      </span>
                    </div>
                    <Input
                      value={analysisTitle}
                      onChange={(e) => setAnalysisTitle(e.target.value)}
                      placeholder="분석글 제목 (선택)"
                      maxLength={100}
                      className="text-sm"
                    />
                    <Textarea
                      value={analysisText}
                      onChange={(e) => setAnalysisText(e.target.value)}
                      placeholder="이 조합에 대한 분석글을 작성하세요..."
                      maxLength={5000}
                      rows={3}
                      className="resize-none text-sm"
                    />
                    <span className="text-muted-foreground text-xs">
                      {analysisText.length}/5000
                    </span>
                  </div>
                )}

                {/* Odds & expected return */}
                <div className="bg-muted/30 space-y-2 rounded-lg p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">총 배당률</span>
                    <span className="text-primary font-bold">{totalOdds.toFixed(2)}배</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-sm">예상 획득 점수</span>
                    <span className="text-lg font-bold text-emerald-600">
                      {(betAmount * totalOdds).toFixed(2)}점
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
    </>
  )
}

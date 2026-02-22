"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Circle
} from "lucide-react"
import {
  type BetmanSlip,
  gameTypeLabels,
  SPORT_ICONS,
  sportColorFill,
  formatMatchTime,
} from "./prediction-types"

// Betting Slip Card Component
export function BettingSlipCard({ slip, isExpanded, onToggle }: {
  slip: BetmanSlip
  isExpanded: boolean
  onToggle: () => void
}) {
  const sportColor = sportColorFill[slip.sport] || sportColorFill['축구']
  const isBasketball = slip.sport === '농구'

  // Determine result status
  const getResultStatus = () => {
    if (slip.isCorrect === null) return 'pending'
    return slip.isCorrect ? 'win' : 'lose'
  }

  const resultStatus = getResultStatus()

  return (
    <Card className="overflow-hidden border-0 shadow-sm">
      {/* Slip Header - Always Visible */}
      <div
        className={`p-3 cursor-pointer transition-colors hover:bg-muted/30 ${sportColor.bg}`}
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{SPORT_ICONS[slip.sport] || "🎯"}</span>
            <div>
              <div className="flex items-center gap-2">
                <span className={`font-semibold text-sm ${sportColor.text}`}>
                  베트맨 {slip.sport}
                </span>
                {slip.roundInfo && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {slip.roundInfo.year}년 {slip.roundInfo.round}회차
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <span>{slip.gameCount}경기</span>
                <span>·</span>
                <span>{slip.ballsUsed}볼 사용</span>
                <span>·</span>
                <span>배당 {slip.totalOdds.toFixed(2)}배</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Result Badge */}
            <div className={`text-xs font-semibold px-2 py-1 rounded ${
              resultStatus === 'win'
                ? 'bg-emerald-100 text-emerald-700'
                : resultStatus === 'lose'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-amber-100 text-amber-700'
            }`}>
              {resultStatus === 'win' ? (
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  적중
                </span>
              ) : resultStatus === 'lose' ? (
                <span className="flex items-center gap-1">
                  <XCircle className="h-3 w-3" />
                  미적중
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  대기중
                </span>
              )}
            </div>

            {/* Expand/Collapse Icon */}
            {isExpanded ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        </div>
      </div>

      {/* Expanded Content - Betting Slip Details */}
      {isExpanded && (
        <div className="border-t">
          {/* Games List */}
          <div className="divide-y">
            {slip.games.map((game) => {
              const hasDrawOdds = slip.sport === '축구' && !game.gameType.includes('언더오버')
              const isOverUnder = game.gameType.includes('언더오버')

              return (
                <div key={game.id} className="p-3">
                  {/* League & Time */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                    <span className="font-medium">{game.match.league}</span>
                    <span>{formatMatchTime(game.match.matchTime)}</span>
                  </div>

                  {/* Teams */}
                  <div className="text-sm font-medium mb-2">
                    {game.match.homeTeam} vs {game.match.awayTeam}
                  </div>

                  {/* Game Type Badge with Handicap/Line Info */}
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge variant="secondary" className="text-[10px]">
                      {gameTypeLabels[game.gameType] || game.gameType}
                    </Badge>
                    {/* 핸디캡 정보 표시 */}
                    {game.gameType.includes('핸디캡') && game.handicap !== null && (
                      <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                        {game.handicap < 0 ? (
                          <span>{game.match.homeTeam.slice(0, 4)} {game.handicap}</span>
                        ) : (
                          <span>{game.match.homeTeam.slice(0, 4)} +{game.handicap}</span>
                        )}
                      </Badge>
                    )}
                    {/* 언더오버 기준선 표시 */}
                    {game.gameType.includes('언더오버') && game.overUnderLine !== null && (
                      <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
                        기준 {game.overUnderLine}
                      </Badge>
                    )}
                    {game.isCorrect !== null && (
                      game.isCorrect ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-500" />
                      )
                    )}
                  </div>

                  {/* Odds Selection Display */}
                  <div className={`grid gap-1.5 ${
                    isOverUnder || isBasketball ? 'grid-cols-2' : 'grid-cols-3'
                  }`}>
                    {/* Home */}
                    {!isOverUnder && (
                      <div className={`rounded-lg p-2 text-center border ${
                        game.prediction === 'home'
                          ? `${sportColor.bg} ${sportColor.border} border-2`
                          : 'bg-muted/30'
                      }`}>
                        <div className={`text-xs truncate ${
                          game.prediction === 'home' ? sportColor.text : 'text-muted-foreground'
                        }`}>
                          {game.match.homeTeam.slice(0, 6)}
                        </div>
                        <div className={`font-bold text-sm ${
                          game.prediction === 'home' ? sportColor.text : ''
                        }`}>
                          {game.prediction === 'home' ? game.odds.toFixed(2) : '-'}
                        </div>
                      </div>
                    )}

                    {/* Draw (only for soccer non-over/under) */}
                    {hasDrawOdds && (
                      <div className={`rounded-lg p-2 text-center border ${
                        game.prediction === 'draw'
                          ? `${sportColor.bg} ${sportColor.border} border-2`
                          : 'bg-muted/30'
                      }`}>
                        <div className={`text-xs ${
                          game.prediction === 'draw' ? sportColor.text : 'text-muted-foreground'
                        }`}>
                          무
                        </div>
                        <div className={`font-bold text-sm ${
                          game.prediction === 'draw' ? sportColor.text : ''
                        }`}>
                          {game.prediction === 'draw' ? game.odds.toFixed(2) : '-'}
                        </div>
                      </div>
                    )}

                    {/* Away */}
                    {!isOverUnder && (
                      <div className={`rounded-lg p-2 text-center border ${
                        game.prediction === 'away'
                          ? `${sportColor.bg} ${sportColor.border} border-2`
                          : 'bg-muted/30'
                      }`}>
                        <div className={`text-xs truncate ${
                          game.prediction === 'away' ? sportColor.text : 'text-muted-foreground'
                        }`}>
                          {game.match.awayTeam.slice(0, 6)}
                        </div>
                        <div className={`font-bold text-sm ${
                          game.prediction === 'away' ? sportColor.text : ''
                        }`}>
                          {game.prediction === 'away' ? game.odds.toFixed(2) : '-'}
                        </div>
                      </div>
                    )}

                    {/* Over/Under options */}
                    {isOverUnder && (
                      <>
                        <div className={`rounded-lg p-2 text-center border ${
                          game.prediction === 'over'
                            ? `${sportColor.bg} ${sportColor.border} border-2`
                            : 'bg-muted/30'
                        }`}>
                          <div className={`text-xs ${
                            game.prediction === 'over' ? sportColor.text : 'text-muted-foreground'
                          }`}>
                            오버
                          </div>
                          <div className={`font-bold text-sm ${
                            game.prediction === 'over' ? sportColor.text : ''
                          }`}>
                            {game.prediction === 'over' ? game.odds.toFixed(2) : '-'}
                          </div>
                        </div>
                        <div className={`rounded-lg p-2 text-center border ${
                          game.prediction === 'under'
                            ? `${sportColor.bg} ${sportColor.border} border-2`
                            : 'bg-muted/30'
                        }`}>
                          <div className={`text-xs ${
                            game.prediction === 'under' ? sportColor.text : 'text-muted-foreground'
                          }`}>
                            언더
                          </div>
                          <div className={`font-bold text-sm ${
                            game.prediction === 'under' ? sportColor.text : ''
                          }`}>
                            {game.prediction === 'under' ? game.odds.toFixed(2) : '-'}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Match Result (if finished) */}
                  {game.match.status === 'finished' && game.match.homeScore !== undefined && (
                    <div className="mt-2 text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1">
                      최종: {game.match.homeTeam} {game.match.homeScore} - {game.match.awayScore} {game.match.awayTeam}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Slip Footer - Summary */}
          <div className="px-3 py-3 bg-muted/20 border-t">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Circle className="h-3 w-3 fill-primary text-primary" />
                  {slip.ballsUsed}볼 사용
                </span>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground mb-0.5">
                  총 배당 {slip.totalOdds.toFixed(2)}배
                </div>
                <div className={`text-sm font-bold ${
                  resultStatus === 'win'
                    ? 'text-emerald-600'
                    : resultStatus === 'lose'
                      ? 'text-red-600'
                      : 'text-muted-foreground'
                }`}>
                  {resultStatus === 'pending'
                    ? `예상 +${Math.floor(slip.ballsUsed * slip.totalOdds)}볼`
                    : resultStatus === 'win'
                      ? `+${slip.pointsEarned || Math.floor(slip.ballsUsed * slip.totalOdds)}볼 획득`
                      : `-${slip.ballsUsed}볼`
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

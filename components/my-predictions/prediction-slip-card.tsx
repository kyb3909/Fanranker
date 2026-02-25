"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, Circle, Lock } from "lucide-react"
import {
  type BetmanSlip,
  type BetmanGame,
  gameTypeLabels,
  SPORT_ICONS,
  sportColorFill,
  formatMatchTime,
} from "./prediction-types"

/**
 * 개별 배당률 셀의 스타일을 결정합니다.
 * - 내 선택 + 적중: 초록 하이라이트
 * - 내 선택 + 미적중: 빨간 하이라이트
 * - 정답 (내가 선택하지 않음): 초록 아웃라인
 * - 대기중 내 선택: 스포츠 색상
 * - 기본: 회색 배경
 */
function getOddsCellStyle(
  optionKey: string,
  game: BetmanGame,
  sportColor: { bg: string; text: string; border: string }
) {
  const isSelected = game.prediction === optionKey
  const isCorrectAnswer = game.result === optionKey
  const isSettled = game.isCorrect !== null

  // 경기 결과 확정된 경우
  if (isSettled) {
    // 내 선택 + 적중
    if (isSelected && game.isCorrect) {
      return {
        container: "border-2 border-green-400 bg-green-50",
        label: "text-green-700",
        odds: "text-green-700",
        icon: "✓",
      }
    }
    // 내 선택 + 미적중
    if (isSelected && !game.isCorrect) {
      return {
        container: "border-2 border-red-300 bg-red-50",
        label: "text-red-600",
        odds: "text-red-600",
        icon: "✗",
      }
    }
    // 정답 (내가 안 골랐지만 이게 정답)
    if (isCorrectAnswer) {
      return {
        container: "border-2 border-green-300 bg-green-50/60",
        label: "text-green-700",
        odds: "text-green-700",
        icon: "✓",
      }
    }
    // 나머지 (선택도 아니고 정답도 아님)
    return {
      container: "border border-transparent bg-muted/30",
      label: "text-muted-foreground",
      odds: "text-muted-foreground/60",
      icon: null as string | null,
    }
  }

  // 대기중: 내 선택
  if (isSelected) {
    return {
      container: `border-2 ${sportColor.border} ${sportColor.bg}`,
      label: sportColor.text,
      odds: sportColor.text,
      icon: null as string | null,
    }
  }

  // 대기중: 선택 안한 옵션
  return {
    container: "border border-transparent bg-muted/30",
    label: "text-muted-foreground",
    odds: "text-foreground",
    icon: null as string | null,
  }
}

/** 옵션별 배당률 가져오기 */
function getOddsForOption(optionKey: string, game: BetmanGame): number | null {
  switch (optionKey) {
    case "home":
      return game.homeOdds
    case "away":
      return game.awayOdds
    case "draw":
      return game.drawOdds
    case "over":
      return game.overOdds
    case "under":
      return game.underOdds
    default:
      return null
  }
}

// Betting Slip Card Component
export function BettingSlipCard({
  slip,
  isExpanded,
  onToggle,
  locked = false,
  lockedContent,
  matchCount,
}: {
  slip: BetmanSlip
  isExpanded: boolean
  onToggle: () => void
  locked?: boolean
  lockedContent?: React.ReactNode
  matchCount?: number
}) {
  const sportColor = sportColorFill[slip.sport] || sportColorFill["축구"]
  const isBasketball = slip.sport === "농구"

  // Determine result status
  const getResultStatus = () => {
    if (slip.isCorrect === null) return "pending"
    return slip.isCorrect ? "win" : "lose"
  }

  const resultStatus = getResultStatus()

  return (
    <Card className="overflow-hidden border-0 shadow-sm">
      {/* Slip Header - Always Visible */}
      <div
        className={`hover:bg-muted/30 cursor-pointer p-3 transition-colors ${sportColor.bg}`}
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {locked && <Lock className="text-muted-foreground h-4 w-4" />}
            <span className="text-lg">{SPORT_ICONS[slip.sport] || "🎯"}</span>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${sportColor.text}`}>
                  베트맨 {slip.sport}
                </span>
                {slip.roundInfo && (
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                    {slip.roundInfo.year}년 {slip.roundInfo.round}회차
                  </Badge>
                )}
              </div>
              <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
                <span>{matchCount ?? slip.gameCount}경기</span>
                {!locked && (
                  <>
                    <span>·</span>
                    <span>{slip.ballsUsed}볼 사용</span>
                    <span>·</span>
                    <span>배당 {slip.totalOdds.toFixed(2)}배</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Result Badge */}
            {locked ? (
              <span className="bg-muted text-muted-foreground rounded px-2 py-1 text-xs font-medium">
                잠금
              </span>
            ) : (
              <div
                className={`rounded px-2 py-1 text-xs font-semibold ${
                  resultStatus === "win"
                    ? "bg-emerald-100 text-emerald-700"
                    : resultStatus === "lose"
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700"
                }`}
              >
                {resultStatus === "win" ? (
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    적중
                  </span>
                ) : resultStatus === "lose" ? (
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
            )}

            {/* Expand/Collapse Icon */}
            {isExpanded ? (
              <ChevronUp className="text-muted-foreground h-5 w-5" />
            ) : (
              <ChevronDown className="text-muted-foreground h-5 w-5" />
            )}
          </div>
        </div>
      </div>

      {/* Expanded Content - Betting Slip Details */}
      {isExpanded && locked && (
        <div className="border-t px-4 py-5 text-center">
          <Lock className="text-muted-foreground mx-auto mb-2 h-6 w-6" />
          <p className="text-muted-foreground text-sm font-medium">구매 후 확인 가능</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            배당률, 선택지 등 상세 정보는 열람 후 확인할 수 있습니다.
          </p>
          {lockedContent && <div className="mt-3">{lockedContent}</div>}
        </div>
      )}
      {isExpanded && !locked && (
        <div className="border-t">
          {/* Games List */}
          <div className="divide-y">
            {slip.games.map((game) => {
              const hasDrawOdds = slip.sport === "축구" && !game.gameType.includes("언더오버")
              const isOverUnder = game.gameType.includes("언더오버")

              return (
                <div key={game.id} className="p-3">
                  {/* League & Time */}
                  <div className="text-muted-foreground mb-2 flex items-center justify-between text-xs">
                    <span className="font-medium">{game.match.league}</span>
                    <span>{formatMatchTime(game.match.matchTime)}</span>
                  </div>

                  {/* Teams */}
                  <div className="mb-2 text-sm font-medium">
                    {game.match.homeTeam} vs {game.match.awayTeam}
                  </div>

                  {/* Game Type Badge with Handicap/Line Info */}
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {gameTypeLabels[game.gameType] || game.gameType}
                    </Badge>
                    {/* 핸디캡 정보 표시 */}
                    {game.gameType.includes("핸디캡") && game.handicap !== null && (
                      <Badge
                        variant="outline"
                        className="border-blue-200 bg-blue-50 text-[10px] text-blue-700"
                      >
                        {game.handicap < 0 ? (
                          <span>
                            {game.match.homeTeam.slice(0, 4)} {game.handicap}
                          </span>
                        ) : (
                          <span>
                            {game.match.homeTeam.slice(0, 4)} +{game.handicap}
                          </span>
                        )}
                      </Badge>
                    )}
                    {/* 언더오버 기준선 표시 */}
                    {game.gameType.includes("언더오버") && game.overUnderLine !== null && (
                      <Badge
                        variant="outline"
                        className="border-purple-200 bg-purple-50 text-[10px] text-purple-700"
                      >
                        기준 {game.overUnderLine}
                      </Badge>
                    )}
                    {game.isCorrect !== null &&
                      (game.isCorrect ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-500" />
                      ))}
                  </div>

                  {/* Odds Selection Display */}
                  {(() => {
                    const options: Array<{ key: string; label: string }> = isOverUnder
                      ? [
                          { key: "over", label: "오버" },
                          { key: "under", label: "언더" },
                        ]
                      : [
                          { key: "home", label: game.match.homeTeam.slice(0, 6) },
                          ...(hasDrawOdds ? [{ key: "draw", label: "무" }] : []),
                          { key: "away", label: game.match.awayTeam.slice(0, 6) },
                        ]

                    return (
                      <div
                        className={`grid gap-1.5 ${
                          options.length === 2 ? "grid-cols-2" : "grid-cols-3"
                        }`}
                      >
                        {options.map((opt) => {
                          const cellStyle = getOddsCellStyle(opt.key, game, sportColor)
                          const optionOdds = getOddsForOption(opt.key, game)

                          return (
                            <div
                              key={opt.key}
                              className={`odds-btn rounded-lg px-2 py-2.5 text-center ${cellStyle.container}`}
                            >
                              <div className={`truncate text-xs ${cellStyle.label}`}>
                                {cellStyle.icon && <span className="mr-0.5">{cellStyle.icon}</span>}
                                {opt.label}
                              </div>
                              <div
                                className={`font-[family-name:var(--font-display)] text-sm font-bold ${cellStyle.odds}`}
                              >
                                {optionOdds ? optionOdds.toFixed(2) : "-"}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}

                  {/* Match Result (if finished) */}
                  {game.match.status === "finished" && game.match.homeScore !== undefined && (
                    <div className="text-muted-foreground bg-muted/30 mt-2 rounded px-2 py-1 text-xs">
                      최종: {game.match.homeTeam} {game.match.homeScore} - {game.match.awayScore}{" "}
                      {game.match.awayTeam}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Slip Footer - Summary */}
          <div className="bg-muted/20 border-t px-3 py-3">
            <div className="flex items-center justify-between">
              <div className="text-muted-foreground text-sm">
                <span className="flex items-center gap-1">
                  <Circle className="fill-primary text-primary h-3 w-3" />
                  {slip.ballsUsed}볼 사용
                </span>
              </div>
              <div className="text-right">
                <div className="text-muted-foreground mb-0.5 text-xs">
                  총 배당 {slip.totalOdds.toFixed(2)}배
                </div>
                <div
                  className={`text-sm font-bold ${
                    resultStatus === "win"
                      ? "text-emerald-600"
                      : resultStatus === "lose"
                        ? "text-red-600"
                        : "text-muted-foreground"
                  }`}
                >
                  {resultStatus === "pending"
                    ? `예상 +${Math.floor(slip.ballsUsed * slip.totalOdds)}볼`
                    : resultStatus === "win"
                      ? `+${slip.pointsEarned || Math.floor(slip.ballsUsed * slip.totalOdds)}볼 획득`
                      : `-${slip.ballsUsed}볼`}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

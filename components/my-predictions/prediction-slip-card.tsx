"use client"

import type { CSSProperties } from "react"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, Circle, Lock } from "lucide-react"
import {
  type SportsSlip,
  type SportsGame,
  getGameTypeLabel,
  SPORT_ICONS,
  sportColorFill,
  formatMatchTime,
} from "./prediction-types"

function getOddsCellStyle(
  optionKey: string,
  game: SportsGame,
  sportColor: { bg: string; text: string; border: string }
): { cls: string; style: CSSProperties; icon: string | null } {
  const isSelected = game.prediction === optionKey
  const isCorrectAnswer = game.result === optionKey
  const isSettled = game.isCorrect !== null

  if (isSettled) {
    if (isSelected && game.isCorrect) {
      return {
        cls: "rounded-lg px-2 py-2.5 text-center",
        style: { background: "var(--wc-burgundy)", color: "#fff" },
        icon: "✓",
      }
    }
    if (isSelected && !game.isCorrect) {
      return {
        cls: "rounded-lg px-2 py-2.5 text-center",
        style: {
          background: "var(--wc-paper)",
          border: "1px solid var(--wc-line)",
          color: "var(--wc-mute)",
        },
        icon: "✗",
      }
    }
    if (isCorrectAnswer) {
      return {
        cls: "rounded-lg px-2 py-2.5 text-center",
        style: {
          border: "2px solid var(--wc-burgundy)",
          background: "var(--wc-soft)",
          color: "var(--wc-burgundy)",
        },
        icon: "✓",
      }
    }
    return {
      cls: "rounded-lg px-2 py-2.5 text-center",
      style: { background: "var(--wc-paper)", color: "var(--wc-mute-2)" },
      icon: null,
    }
  }

  if (isSelected) {
    return {
      cls: `rounded-lg border-2 px-2 py-2.5 text-center ${sportColor.border} ${sportColor.bg}`,
      style: {},
      icon: null,
    }
  }

  return {
    cls: "rounded-lg px-2 py-2.5 text-center",
    style: { background: "var(--wc-paper)", color: "var(--wc-mute)" },
    icon: null,
  }
}

/** 옵션별 배당률 가져오기 */
function getOddsForOption(optionKey: string, game: SportsGame): number | null {
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
  slip: SportsSlip
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
    <div
      className="overflow-hidden rounded-xl"
      style={{
        background: "var(--wc-card)",
        border: "1px solid var(--wc-line)",
        boxShadow: "var(--wc-shadow-1)",
      }}
    >
      {/* Slip Header - Always Visible */}
      <div className={`cursor-pointer p-3 transition-colors ${sportColor.bg}`} onClick={onToggle}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {locked && <Lock className="text-muted-foreground h-4 w-4" />}
            <span className="text-lg">{SPORT_ICONS[slip.sport] || "🎯"}</span>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${sportColor.text}`}>{slip.sport}</span>
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
                    <span>배점 {slip.totalOdds.toFixed(2)}배</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Result Badge */}
            {locked ? (
              <span
                className="rounded px-2 py-1 text-xs font-medium"
                style={{ background: "var(--wc-paper)", color: "var(--wc-mute)" }}
              >
                잠금
              </span>
            ) : (
              <div
                className="rounded px-2.5 py-1 text-xs font-semibold"
                style={
                  resultStatus === "win"
                    ? { background: "var(--wc-burgundy)", color: "#fff" }
                    : resultStatus === "lose"
                      ? { background: "var(--wc-paper)", color: "var(--wc-mute)" }
                      : { background: "#FEF3C7", color: "#D97706" }
                }
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
        <div className="px-4 py-5 text-center" style={{ borderTop: "1px solid var(--wc-line)" }}>
          <Lock className="mx-auto mb-2 h-6 w-6" style={{ color: "var(--wc-mute)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--wc-mute)" }}>
            구매 후 확인 가능
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--wc-mute-2)" }}>
            배점, 선택지 등 상세 정보는 열람 후 확인할 수 있습니다.
          </p>
          {lockedContent && <div className="mt-3">{lockedContent}</div>}
        </div>
      )}
      {isExpanded && !locked && (
        <div style={{ borderTop: "1px solid var(--wc-line)" }}>
          {/* Games List */}
          <div className="divide-y">
            {slip.games.map((game) => {
              const hasDrawOdds = slip.sport === "축구" && !game.gameType.includes("언더오버")
              const isOverUnder = game.gameType.includes("언더오버")

              return (
                <div key={game.id} className="p-3">
                  {/* League & Time */}
                  <div
                    className="mb-2 flex items-center justify-between text-xs"
                    style={{ color: "var(--wc-mute)" }}
                  >
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
                      {getGameTypeLabel(
                        game.gameType ?? "일반",
                        slip.sport,
                        game.drawOdds != null && Number(game.drawOdds) > 0
                      )}
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
                        <CheckCircle2 className="text-primary h-3.5 w-3.5" />
                      ) : (
                        <XCircle className="text-muted-foreground h-3.5 w-3.5" />
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
                              className={`odds-btn ${cellStyle.cls}`}
                              style={cellStyle.style}
                            >
                              <div className="truncate text-xs">
                                {cellStyle.icon && <span className="mr-0.5">{cellStyle.icon}</span>}
                                {opt.label}
                              </div>
                              <div className="font-[family-name:var(--font-display)] text-sm font-bold">
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
                    <div
                      className="mt-2 rounded px-2 py-1 text-xs"
                      style={{ background: "var(--wc-paper)", color: "var(--wc-mute)" }}
                    >
                      최종: {game.match.homeTeam} {game.match.homeScore} - {game.match.awayScore}{" "}
                      {game.match.awayTeam}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Slip Footer - Summary */}
          <div
            className="px-3 py-3"
            style={{ background: "var(--wc-paper)", borderTop: "1px solid var(--wc-line)" }}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm" style={{ color: "var(--wc-mute)" }}>
                <span className="flex items-center gap-1">
                  <Circle
                    className="h-3 w-3"
                    style={{ fill: "var(--wc-burgundy)", color: "var(--wc-burgundy)" }}
                  />
                  {slip.ballsUsed}볼 사용
                </span>
              </div>
              <div className="text-right">
                <div className="mb-0.5 text-xs" style={{ color: "var(--wc-mute)" }}>
                  총 배점 {slip.totalOdds.toFixed(2)}배
                </div>
                <div
                  className="text-sm font-bold"
                  style={{
                    color: resultStatus === "win" ? "var(--wc-burgundy)" : "var(--wc-mute)",
                  }}
                >
                  {resultStatus === "pending"
                    ? `예상 +${Math.floor(slip.ballsUsed * slip.totalOdds)}볼`
                    : resultStatus === "win"
                      ? `+${Number(slip.pointsEarned || Math.floor(slip.ballsUsed * slip.totalOdds)).toFixed(2)}볼 획득`
                      : `-${slip.ballsUsed}볼`}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

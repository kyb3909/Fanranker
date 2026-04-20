"use client"

import { useMemo, useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Lock, TrendingUp, Target, Flame, Loader2, ChevronDown, ChevronUp } from "lucide-react"
import { formatRelativeTime } from "@/lib/utils/date"
import type { PredictionMatch } from "@/components/betting/betting-types"

interface PredictionGame {
  home_team_name: string
  away_team_name: string
  match_time: string
  game_type: string
  sport: string
  result: string | null
}

interface Prediction {
  id: string
  game_id: string
  prediction: string
  status: string
  game: PredictionGame
}

interface SlipGroup {
  slipId: string
  sport: string
  date: string
  status: string
  matchCount: number
  // 항상 공개 (locked/unlocked 공통)
  analysisTitle: string | null
  totalOddsRange: string
  // Unlocked에서만 유의미한 값 (locked일 때 0/null/[])
  stake: number
  totalOdds: number
  profit: number
  matches: PredictionMatch[]
  analysisText: string | null
}

interface ActivityData {
  id: string
  user_id: string
  round_id: string
  sport: string
  prediction_count: number
  created_at: string
  profile: {
    nickname: string
    avatar_url: string | null
  }
  stats: {
    accuracy: number
    net_profit: number
    current_streak: number
  } | null
  round: {
    year: number
    round: number
    status: string
  } | null
  is_purchased: boolean
  is_free?: boolean
  predictions: Prediction[] | null
  slipGroups?: SlipGroup[] | null
}

const SPORT_LABELS: Record<string, string> = {
  축구: "축구",
  야구: "야구",
  농구: "농구",
  배구: "배구",
}

const SPORT_EMOJI: Record<string, string> = {
  축구: "⚽",
  야구: "⚾",
  농구: "🏀",
  배구: "🏐",
}

/** 종목별 액센트 컬러 — 상단 스트라이프 + 이모지 칩 배경. */
const SPORT_COLOR: Record<string, { chip: string; stripe: string }> = {
  축구: { chip: "bg-emerald-500", stripe: "bg-gradient-to-r from-emerald-400 to-teal-500" },
  야구: { chip: "bg-sky-500", stripe: "bg-gradient-to-r from-sky-400 to-blue-500" },
  농구: { chip: "bg-orange-500", stripe: "bg-gradient-to-r from-orange-400 to-amber-500" },
  배구: { chip: "bg-purple-500", stripe: "bg-gradient-to-r from-purple-400 to-fuchsia-500" },
}
const SPORT_COLOR_DEFAULT = {
  chip: "bg-slate-500",
  stripe: "bg-gradient-to-r from-slate-400 to-slate-500",
}

function formatActivityDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })
}

export function PredictionActivityCard({
  activity,
  onPurchase,
  isFollowed = false,
  isFollowLoading = false,
  onFollow,
}: {
  activity: ActivityData
  onPurchase: (activityId: string) => Promise<Prediction[] | null>
  isFollowed?: boolean
  isFollowLoading?: boolean
  onFollow?: () => void
}) {
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [localSlipGroups, setLocalSlipGroups] = useState<SlipGroup[] | null>(
    activity.slipGroups || null
  )
  const [localPredictions, setLocalPredictions] = useState<Prediction[] | null>(
    activity.predictions
  )
  const [isPurchased, setIsPurchased] = useState(activity.is_purchased)
  const [isFree, setIsFree] = useState(activity.is_free || false)
  // 기본은 모든 슬립 접힘 — 사용자가 "내용 보기" 토글로만 본문/경기 펼침.
  const [expandedSlips, setExpandedSlips] = useState<Set<string>>(new Set())

  const toggleSlip = (slipId: string) => {
    setExpandedSlips((prev) => {
      const next = new Set(prev)
      if (next.has(slipId)) next.delete(slipId)
      else next.add(slipId)
      return next
    })
  }

  const handlePurchase = async () => {
    setIsPurchasing(true)
    try {
      const result = await onPurchase(activity.id)
      if (result) {
        setLocalPredictions(result)
        setIsPurchased(true)
        setLocalSlipGroups(buildSlipGroupsFromPredictions(result, activity.sport))
      }
    } finally {
      setIsPurchasing(false)
    }
  }

  const sportLabel = SPORT_LABELS[activity.sport] || activity.sport
  const sportEmoji = SPORT_EMOJI[activity.sport] || "🎯"
  const sportColor = SPORT_COLOR[activity.sport] || SPORT_COLOR_DEFAULT
  const contentUnlocked = isPurchased || isFree

  // slipGroups가 없고 unlocked predictions만 있는 경우 자동 변환 → 렌더 일관성 유지.
  const effectiveSlipGroups = useMemo<SlipGroup[] | null>(() => {
    if (localSlipGroups && localSlipGroups.length > 0) return localSlipGroups
    if (localPredictions && localPredictions.length > 0 && contentUnlocked) {
      return buildSlipGroupsFromPredictions(localPredictions, activity.sport)
    }
    return null
  }, [localSlipGroups, localPredictions, contentUnlocked, activity.sport])

  return (
    <div className="bg-card border-border overflow-hidden rounded-xl border">
      {/* 종목 accent stripe — 멀리서도 종목 구분 */}
      <div className={`h-1 ${sportColor.stripe}`} aria-hidden="true" />

      {/* Header: 프로필 + 스탯 (1줄 meta bar) */}
      <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-2">
        <Avatar className="h-9 w-9 flex-shrink-0">
          <AvatarImage
            src={activity.profile.avatar_url || "/placeholder-user.jpg"}
            alt={activity.profile.nickname}
          />
          <AvatarFallback>{activity.profile.nickname?.[0] || "?"}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-foreground text-[13px] font-semibold">
              {activity.profile.nickname}
            </span>
            {onFollow && (
              <Button
                size="sm"
                variant={isFollowed ? "outline" : "default"}
                onClick={onFollow}
                disabled={isFollowLoading}
                className={`h-5 rounded-full px-2 text-[10px] ${
                  isFollowed
                    ? "text-muted-foreground hover:border-primary/50 hover:text-primary"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                }`}
              >
                {isFollowLoading ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                ) : isFollowed ? (
                  "팔로잉"
                ) : (
                  "팔로우"
                )}
              </Button>
            )}
            {activity.stats && activity.stats.accuracy > 0 && (
              <Badge
                variant="secondary"
                className="h-4 gap-0.5 bg-indigo-50 px-1.5 py-0 text-[10px] text-indigo-600 hover:bg-indigo-50"
              >
                <Target className="h-2.5 w-2.5" />
                {activity.stats.accuracy.toFixed(1)}%
              </Badge>
            )}
            {activity.stats && activity.stats.current_streak > 0 && (
              <Badge
                variant="secondary"
                className="h-4 gap-0.5 bg-orange-50 px-1.5 py-0 text-[10px] text-orange-600 hover:bg-orange-50"
              >
                <Flame className="h-2.5 w-2.5" />
                {activity.stats.current_streak}연승
              </Badge>
            )}
            {activity.stats && activity.stats.net_profit > 0 && (
              <Badge
                variant="secondary"
                className="h-4 gap-0.5 bg-emerald-50 px-1.5 py-0 text-[10px] text-emerald-600 hover:bg-emerald-50"
              >
                <TrendingUp className="h-2.5 w-2.5" />+{activity.stats.net_profit.toFixed(0)}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-0.5 text-[11px]">
            {formatActivityDate(activity.created_at)} ·{" "}
            {formatRelativeTime(new Date(activity.created_at))}
          </p>
        </div>
      </div>

      {/* 슬립 섹션 루프 — 기본 collapsed, "내용 보기" 토글로 펼침 */}
      {effectiveSlipGroups && effectiveSlipGroups.length > 0
        ? effectiveSlipGroups.map((group) => {
            const slipLocked = !contentUnlocked
            const title = group.analysisTitle || `${sportLabel} ${group.matchCount}경기 조합`
            const oddsText = slipLocked ? group.totalOddsRange : `${group.totalOdds.toFixed(2)}배`
            const statusDot = !slipLocked ? getStatusDot(group.status) : null
            const isExpanded = expandedSlips.has(group.slipId)
            const canExpand = !slipLocked && (!!group.analysisText || group.matches.length > 0)

            return (
              <div key={group.slipId} className="border-border border-t px-4 pt-4 pb-3">
                {/* HERO: 분석글 제목 */}
                <h3 className="text-foreground text-[16px] leading-snug font-semibold tracking-tight">
                  {title}
                </h3>

                {/* Meta: 종목 · 경기수 · 배당 · 상태 */}
                <div className="text-muted-foreground mt-2 flex items-center gap-1.5 text-[12px]">
                  <span
                    className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded-[4px] text-[11px] leading-none ${sportColor.chip}`}
                    aria-hidden="true"
                  >
                    {sportEmoji}
                  </span>
                  <span>
                    {sportLabel} {group.matchCount}경기
                  </span>
                  <span className="text-muted-foreground/40">·</span>
                  <span className={slipLocked ? "" : "text-foreground"}>{oddsText}</span>
                  {statusDot && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="flex items-center gap-1">
                        <span
                          className={`inline-block h-1.5 w-1.5 rounded-full ${statusDot.dotClass}`}
                          aria-hidden="true"
                        />
                        <span className={statusDot.textClass}>{statusDot.label}</span>
                      </span>
                    </>
                  )}
                </div>

                {/* Expanded 상세 — 본문 + 경기 라인 (unlocked + 토글 시에만) */}
                {!slipLocked && isExpanded && (
                  <div className="border-border/60 mt-4 space-y-3 border-t pt-3.5">
                    {group.analysisText && (
                      <p className="text-foreground/85 text-[13.5px] leading-relaxed whitespace-pre-line">
                        {group.analysisText}
                      </p>
                    )}
                    {group.matches.length > 0 && (
                      <div className="space-y-1.5">
                        {group.matches.map((m, i) => (
                          <PredictionMatchLine key={`${group.slipId}-match-${i}`} match={m} />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Action: locked CTA / unlocked 토글 */}
                <div className="mt-3.5">
                  {slipLocked ? (
                    <Button
                      onClick={handlePurchase}
                      disabled={isPurchasing}
                      variant="outline"
                      className="border-primary/30 text-primary hover:bg-primary/5 hover:text-primary h-10 w-full gap-2 text-[13px] font-medium"
                    >
                      {isPurchasing ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          구매 중...
                        </>
                      ) : (
                        <>
                          <Lock className="h-3.5 w-3.5" />
                          500G로 열람
                        </>
                      )}
                    </Button>
                  ) : canExpand ? (
                    <button
                      type="button"
                      onClick={() => toggleSlip(group.slipId)}
                      className="text-muted-foreground hover:text-foreground flex w-full items-center justify-center gap-1 py-1 text-[12px] font-medium transition-colors"
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? (
                        <>
                          접기
                          <ChevronUp className="h-3.5 w-3.5" />
                        </>
                      ) : (
                        <>
                          내용 보기
                          <ChevronDown className="h-3.5 w-3.5" />
                        </>
                      )}
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })
        : null}
    </div>
  )
}

/** 상태 → 도트 색 + 라벨. 도박 신호(빨강) 피하기 위해 lose는 중성 slate. */
function getStatusDot(
  status: string
): { label: string; dotClass: string; textClass: string } | null {
  switch (status) {
    case "win":
      return {
        label: "적중",
        dotClass: "bg-emerald-500 ring-2 ring-emerald-500/20",
        textClass: "text-emerald-600 font-medium",
      }
    case "lose":
      return {
        label: "미적중",
        dotClass: "bg-slate-400",
        textClass: "text-slate-500",
      }
    case "pending":
      return {
        label: "진행중",
        dotClass: "bg-amber-500 ring-2 ring-amber-500/20",
        textClass: "text-amber-600 font-medium",
      }
    case "cancelled":
      return {
        label: "취소",
        dotClass: "bg-slate-300",
        textClass: "text-slate-400",
      }
    default:
      return null
  }
}

function PredictionMatchLine({ match }: { match: PredictionMatch }) {
  const resultIcon =
    match.result === "win"
      ? "✓"
      : match.result === "lose"
        ? "✗"
        : match.result === "pending"
          ? "·"
          : "·"
  const resultClass =
    match.result === "win"
      ? "text-primary"
      : match.result === "lose"
        ? "text-muted-foreground/70"
        : "text-muted-foreground/50"
  return (
    <div className="flex items-center justify-between gap-2 text-[12px]">
      <span className="text-foreground flex-1 truncate">
        {match.home} vs {match.away}
      </span>
      <span className="text-muted-foreground shrink-0">{match.selection}</span>
      <span className={`shrink-0 font-semibold ${resultClass}`} aria-hidden="true">
        {resultIcon}
      </span>
    </div>
  )
}

// Purchase API 응답(predictions)으로부터 slipGroups 빌드
function buildSlipGroupsFromPredictions(
  predictions: Prediction[],
  activitySport: string
): SlipGroup[] {
  const game0 = predictions[0]?.game
  const sport = game0?.sport || activitySport
  const date = game0?.match_time
    ? new Date(game0.match_time).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })
    : ""

  const SELECTION_MAP: Record<string, string> = {
    home: "홈팀",
    away: "원정팀",
    draw: "무",
    over: "오버",
    under: "언더",
  }

  const allSettled = predictions.every((p) => p.game?.result)
  const allCorrect = predictions.every((p) => p.game?.result && p.game.result === p.prediction)
  const status = !allSettled ? "pending" : allCorrect ? "win" : "lose"

  const matches: PredictionMatch[] = predictions.map((p) => {
    const dbResult = p.game?.result
    const matchResult = dbResult ? (dbResult === p.prediction ? "win" : "lose") : "pending"
    const correctAnswer = dbResult ? SELECTION_MAP[dbResult] || dbResult : undefined
    return {
      league: "",
      home: p.game?.home_team_name || "",
      away: p.game?.away_team_name || "",
      selection: SELECTION_MAP[p.prediction] || p.prediction,
      odds: 0,
      result: matchResult,
      correctAnswer,
      gameType: p.game?.game_type || "일반",
    }
  })

  return [
    {
      slipId: "purchased",
      sport,
      date,
      status,
      matchCount: predictions.length,
      analysisTitle: null,
      totalOddsRange: "—",
      stake: 0,
      totalOdds: 0,
      profit: 0,
      matches,
      analysisText: null,
    },
  ]
}

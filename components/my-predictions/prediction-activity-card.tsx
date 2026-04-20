"use client"

import { useMemo, useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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

/**
 * 종목별 액센트 컬러 — 헤더 solid 블록 + 배지 텍스트 컬러 + 카드 섀도.
 * FIFA/NBA 카드 스타일: 헤더는 진한 종목 컬러, 본문은 흰색, 배지는 solid pill.
 */
const SPORT_COLOR: Record<
  string,
  {
    header: string // 헤더 블록 배경 (진한 solid)
    text: string // 흰 배지 위 종목 텍스트 컬러
    toggle: string // "내용 보기" 토글 텍스트
    cardShadow: string // 카드 외곽 컬러 섀도
    border: string // 카드 테두리 톤
  }
> = {
  축구: {
    header: "bg-emerald-500",
    text: "text-emerald-700",
    toggle: "text-emerald-600 hover:text-emerald-700",
    cardShadow: "shadow-lg shadow-emerald-500/20",
    border: "border-emerald-100",
  },
  야구: {
    header: "bg-sky-500",
    text: "text-sky-700",
    toggle: "text-sky-600 hover:text-sky-700",
    cardShadow: "shadow-lg shadow-sky-500/20",
    border: "border-sky-100",
  },
  농구: {
    header: "bg-orange-500",
    text: "text-orange-700",
    toggle: "text-orange-600 hover:text-orange-700",
    cardShadow: "shadow-lg shadow-orange-500/20",
    border: "border-orange-100",
  },
  배구: {
    header: "bg-purple-500",
    text: "text-purple-700",
    toggle: "text-purple-600 hover:text-purple-700",
    cardShadow: "shadow-lg shadow-purple-500/20",
    border: "border-purple-100",
  },
}
const SPORT_COLOR_DEFAULT: (typeof SPORT_COLOR)[string] = {
  header: "bg-slate-500",
  text: "text-slate-700",
  toggle: "text-slate-600 hover:text-slate-700",
  cardShadow: "shadow-lg shadow-slate-500/20",
  border: "border-slate-100",
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
    <div
      className={`overflow-hidden rounded-2xl border bg-white ${sportColor.border} ${sportColor.cardShadow}`}
    >
      {/* Header: 종목 컬러 solid 블록 + 흰 텍스트/배지 */}
      <div className={`${sportColor.header} px-4 py-4`}>
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 flex-shrink-0 ring-2 ring-white/70">
            <AvatarImage
              src={activity.profile.avatar_url || "/placeholder-user.jpg"}
              alt={activity.profile.nickname}
            />
            <AvatarFallback className={`text-sm font-bold ${sportColor.text} bg-white`}>
              {activity.profile.nickname?.[0] || "?"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[14px] font-bold text-white">{activity.profile.nickname}</span>
              {onFollow && (
                <button
                  type="button"
                  onClick={onFollow}
                  disabled={isFollowLoading}
                  className={`h-5 rounded-full px-2 text-[10px] font-semibold transition-colors ${
                    isFollowed
                      ? "bg-white/20 text-white/90 hover:bg-white/30"
                      : "bg-white text-gray-800 shadow-sm hover:bg-white/90"
                  }`}
                >
                  {isFollowLoading ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : isFollowed ? (
                    "팔로잉"
                  ) : (
                    "팔로우"
                  )}
                </button>
              )}
              {activity.stats && activity.stats.accuracy > 0 && (
                <span
                  className={`inline-flex h-5 items-center gap-0.5 rounded-full bg-white px-1.5 text-[10px] font-bold shadow-sm ${sportColor.text}`}
                >
                  <Target className="h-2.5 w-2.5" />
                  {activity.stats.accuracy.toFixed(1)}%
                </span>
              )}
              {activity.stats && activity.stats.current_streak > 0 && (
                <span className="inline-flex h-5 items-center gap-0.5 rounded-full bg-orange-400 px-1.5 text-[10px] font-bold text-white shadow-sm">
                  <Flame className="h-2.5 w-2.5" />
                  {activity.stats.current_streak}연승
                </span>
              )}
              {activity.stats && activity.stats.net_profit > 0 && (
                <span className="inline-flex h-5 items-center gap-0.5 rounded-full bg-emerald-400 px-1.5 text-[10px] font-bold text-white shadow-sm">
                  <TrendingUp className="h-2.5 w-2.5" />+{activity.stats.net_profit.toFixed(0)}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] font-medium text-white/80">
              {formatActivityDate(activity.created_at)} ·{" "}
              {formatRelativeTime(new Date(activity.created_at))}
            </p>
          </div>
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
              <div key={group.slipId} className="border-t border-gray-100 px-4 pt-4 pb-3">
                {/* Meta + 상태 pill */}
                <div className="mb-2.5 flex flex-wrap items-center gap-2">
                  <span className="text-[12px] font-semibold text-gray-500">
                    {sportEmoji} {sportLabel} {group.matchCount}경기
                  </span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
                      slipLocked ? "bg-gray-100 text-gray-600" : "bg-gray-900 text-white"
                    }`}
                  >
                    {oddsText}
                  </span>
                  {statusDot && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${statusDot.pillClass}`}
                    >
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${statusDot.dotClass}`}
                        aria-hidden="true"
                      />
                      {statusDot.label}
                    </span>
                  )}
                </div>

                {/* HERO: 분석글 제목 */}
                <h3 className="text-[16px] leading-snug font-bold tracking-tight text-gray-900">
                  {title}
                </h3>

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
                      className="bg-primary hover:bg-primary/90 shadow-primary/30 h-11 w-full gap-2 text-[14px] font-bold text-white shadow-md"
                    >
                      {isPurchasing ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          구매 중...
                        </>
                      ) : (
                        <>
                          <Lock className="h-4 w-4" />
                          500G로 열람
                        </>
                      )}
                    </Button>
                  ) : canExpand ? (
                    <button
                      type="button"
                      onClick={() => toggleSlip(group.slipId)}
                      className={`flex w-full items-center justify-center gap-1 rounded-lg py-2 text-[13px] font-bold transition-colors ${sportColor.toggle} hover:bg-gray-50`}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? (
                        <>
                          접기
                          <ChevronUp className="h-4 w-4" />
                        </>
                      ) : (
                        <>
                          내용 보기
                          <ChevronDown className="h-4 w-4" />
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

/** 상태 → pill/도트 컬러 + 라벨. 도박 신호(빨강) 피하기 위해 lose는 중성 slate. */
function getStatusDot(
  status: string
): { label: string; dotClass: string; pillClass: string } | null {
  switch (status) {
    case "win":
      return {
        label: "적중",
        dotClass: "bg-white",
        pillClass: "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30",
      }
    case "lose":
      return {
        label: "미적중",
        dotClass: "bg-slate-400",
        pillClass: "bg-slate-100 text-slate-600",
      }
    case "pending":
      return {
        label: "진행중",
        dotClass: "bg-white",
        pillClass: "bg-amber-500 text-white shadow-sm shadow-amber-500/30",
      }
    case "cancelled":
      return {
        label: "취소",
        dotClass: "bg-slate-400",
        pillClass: "bg-slate-100 text-slate-500",
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

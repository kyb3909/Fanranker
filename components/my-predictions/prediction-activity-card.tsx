"use client"

import { useMemo, useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Lock, Unlock, TrendingUp, Target, Flame, Loader2, Clock } from "lucide-react"
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
              <Badge variant="secondary" className="h-4 gap-0.5 px-1.5 py-0 text-[10px]">
                <Target className="h-2.5 w-2.5" />
                {activity.stats.accuracy.toFixed(1)}%
              </Badge>
            )}
            {activity.stats && activity.stats.current_streak > 0 && (
              <Badge
                variant="secondary"
                className="text-primary h-4 gap-0.5 px-1.5 py-0 text-[10px]"
              >
                <Flame className="h-2.5 w-2.5" />
                {activity.stats.current_streak}연승
              </Badge>
            )}
            {activity.stats && activity.stats.net_profit > 0 && (
              <Badge
                variant="secondary"
                className="text-primary h-4 gap-0.5 px-1.5 py-0 text-[10px]"
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

      {/* 슬립 섹션 루프 — 각 슬립이 인스타 카드 본체 */}
      {effectiveSlipGroups && effectiveSlipGroups.length > 0
        ? effectiveSlipGroups.map((group) => {
            const slipLocked = !contentUnlocked
            const title = group.analysisTitle || `${sportLabel} ${group.matchCount}경기 조합`
            const oddsText = slipLocked
              ? `배당 ${group.totalOddsRange}`
              : `배당 ${group.totalOdds.toFixed(2)}배`
            const statusMeta = !slipLocked ? getStatusMeta(group.status) : null

            return (
              <div key={group.slipId} className="border-border border-t px-3.5 py-3.5">
                {/* slip meta (종목 · 경기수 · 배당 · 상태) */}
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-muted-foreground flex items-center gap-1.5 text-[12px]">
                    <span aria-hidden="true">{sportEmoji}</span>
                    <span>
                      {sportLabel} {group.matchCount}경기
                    </span>
                    <span className="text-muted-foreground/60">·</span>
                    <span className={slipLocked ? "" : "text-foreground font-medium"}>
                      {oddsText}
                    </span>
                  </span>
                  {statusMeta && (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusMeta.className}`}
                    >
                      {statusMeta.label}
                    </span>
                  )}
                </div>

                {/* HERO: 분석글 제목 */}
                <h3 className="text-foreground text-[15px] leading-snug font-semibold">{title}</h3>

                {/* Locked: 잠금 안내 / Unlocked: 본문 */}
                {slipLocked ? (
                  <div className="bg-muted/40 text-muted-foreground mt-3 flex items-center gap-1.5 rounded-md px-3 py-2.5 text-[12px]">
                    <Lock className="h-3 w-3 flex-shrink-0" />
                    <span>본문과 예측 내역은 구매 후 열람할 수 있어요</span>
                  </div>
                ) : (
                  <>
                    {group.analysisText && (
                      <p className="text-muted-foreground mt-2 text-[13px] leading-relaxed whitespace-pre-line">
                        {group.analysisText}
                      </p>
                    )}
                    {/* 경기 압축 라인 */}
                    {group.matches.length > 0 && (
                      <div className="bg-muted/30 mt-3 space-y-1.5 rounded-md px-3 py-2.5">
                        {group.matches.map((m, i) => (
                          <PredictionMatchLine key={`${group.slipId}-match-${i}`} match={m} />
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* Footer: CTA (locked) / 상태 표시 (unlocked) */}
                <div className="mt-3">
                  {slipLocked ? (
                    <Button
                      onClick={handlePurchase}
                      disabled={isPurchasing}
                      variant="outline"
                      className="border-primary/30 text-primary hover:bg-primary/5 hover:text-primary w-full gap-2"
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
                  ) : (
                    <div className="text-primary flex items-center gap-1.5 text-[11px] font-medium">
                      {isFree && !isPurchased ? (
                        <>
                          <Clock className="h-3 w-3" />
                          경기 종료 - 무료 공개
                        </>
                      ) : (
                        <>
                          <Unlock className="h-3 w-3" />
                          열람 완료
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })
        : null}
    </div>
  )
}

function getStatusMeta(status: string): { label: string; className: string } | null {
  switch (status) {
    case "win":
      return { label: "적중", className: "bg-primary/10 text-primary" }
    case "lose":
      return { label: "미적중", className: "bg-muted text-muted-foreground" }
    case "pending":
      return { label: "진행중", className: "bg-muted text-muted-foreground" }
    case "cancelled":
      return { label: "취소", className: "bg-muted text-muted-foreground" }
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

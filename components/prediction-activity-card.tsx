"use client"

import { useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Lock, Unlock, TrendingUp, Target, Flame, Loader2, Clock } from "lucide-react"
import { formatRelativeTime } from "@/lib/utils/date"
import { PredictionSlipCard } from "@/components/betting/prediction-slip-card"
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
  stake: number
  totalOdds: number
  profit: number
  matches: PredictionMatch[]
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

export function PredictionActivityCard({
  activity,
  onPurchase,
}: {
  activity: ActivityData
  onPurchase: (activityId: string) => Promise<Prediction[] | null>
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
        // Purchase API doesn't return slipGroups, so build them from predictions
        setLocalSlipGroups(buildSlipGroupsFromPredictions(result, activity.sport))
      }
    } finally {
      setIsPurchasing(false)
    }
  }

  const sportLabel = SPORT_LABELS[activity.sport] || activity.sport
  const showContent = (isPurchased || isFree) && (localSlipGroups || localPredictions)
  const hasSlipGroups = localSlipGroups && localSlipGroups.length > 0

  return (
    <div className="bg-card border-border overflow-hidden rounded-xl border">
      {/* 상단: 프로필 + 스탯 */}
      <div className="flex items-start gap-3 p-4">
        <Avatar className="h-10 w-10 flex-shrink-0">
          <AvatarImage
            src={activity.profile.avatar_url || "/placeholder-user.jpg"}
            alt={activity.profile.nickname}
          />
          <AvatarFallback>{activity.profile.nickname?.[0] || "?"}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-foreground text-sm font-semibold">
              {activity.profile.nickname}
            </span>
            {activity.stats && (
              <div className="flex items-center gap-1.5">
                {activity.stats.accuracy > 0 && (
                  <Badge variant="secondary" className="h-5 gap-0.5 px-1.5 py-0 text-[11px]">
                    <Target className="h-3 w-3" />
                    {activity.stats.accuracy.toFixed(1)}%
                  </Badge>
                )}
                {activity.stats.current_streak > 0 && (
                  <Badge
                    variant="secondary"
                    className="h-5 gap-0.5 px-1.5 py-0 text-[11px] text-orange-600"
                  >
                    <Flame className="h-3 w-3" />
                    {activity.stats.current_streak}연승
                  </Badge>
                )}
                {activity.stats.net_profit > 0 && (
                  <Badge
                    variant="secondary"
                    className="h-5 gap-0.5 px-1.5 py-0 text-[11px] text-emerald-600"
                  >
                    <TrendingUp className="h-3 w-3" />+{activity.stats.net_profit.toFixed(0)}
                  </Badge>
                )}
              </div>
            )}
          </div>
          <p className="text-muted-foreground mt-0.5 text-[13px]">
            {sportLabel} {activity.prediction_count}경기 예측 등록
            {activity.round && (
              <span className="ml-1">
                ({activity.round.year}년 {activity.round.round}회차)
              </span>
            )}
          </p>
          <p className="text-muted-foreground mt-0.5 text-[11px]">
            {formatRelativeTime(new Date(activity.created_at))}
          </p>
        </div>
      </div>

      {/* 하단: 잠금/열람 */}
      {showContent ? (
        <div className="border-border border-t px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5">
            {isFree && !isPurchased ? (
              <>
                <Clock className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-[12px] font-medium text-blue-600">경기 종료 - 무료 공개</span>
              </>
            ) : (
              <>
                <Unlock className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-[12px] font-medium text-emerald-600">열람 완료</span>
              </>
            )}
          </div>
          {hasSlipGroups ? (
            <div className="space-y-2">
              {localSlipGroups!.map((group) => (
                <PredictionSlipCard
                  key={group.slipId}
                  sport={group.sport}
                  date={group.date}
                  status={group.status}
                  matches={group.matches}
                  stake={group.stake}
                  totalOdds={group.totalOdds}
                  profit={group.profit}
                />
              ))}
            </div>
          ) : localPredictions ? (
            <FallbackPredictionList predictions={localPredictions} />
          ) : null}
        </div>
      ) : (
        <div className="border-border border-t px-4 py-3">
          <PredictionSlipCard
            sport={activity.sport}
            date=""
            status="pending"
            matches={[]}
            stake={0}
            totalOdds={0}
            profit={0}
            locked
            matchCount={activity.prediction_count}
            lockedContent={
              <Button
                onClick={handlePurchase}
                disabled={isPurchasing}
                variant="outline"
                className="w-full gap-2 border-amber-300 text-amber-600 hover:bg-amber-50 hover:text-amber-700"
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
            }
          />
        </div>
      )}
    </div>
  )
}

// Fallback: purchase API가 slipGroups 없이 predictions만 반환할 때의 간단 리스트
function FallbackPredictionList({ predictions }: { predictions: Prediction[] }) {
  const PREDICTION_LABELS: Record<string, string> = {
    home: "홈",
    draw: "무",
    away: "원정",
    over: "오버",
    under: "언더",
  }

  return (
    <div className="space-y-1.5">
      {predictions.map((pred) => (
        <div
          key={pred.id}
          className="bg-muted/50 flex items-center justify-between rounded px-2 py-1 text-[13px]"
        >
          <span className="text-foreground flex-1 truncate">
            {pred.game?.home_team_name} vs {pred.game?.away_team_name}
          </span>
          <Badge
            variant={
              pred.status === "settled" && pred.game?.result === pred.prediction
                ? "default"
                : "secondary"
            }
            className="ml-2 h-5 shrink-0 px-1.5 py-0 text-[11px]"
          >
            {PREDICTION_LABELS[pred.prediction] || pred.prediction}
          </Badge>
        </div>
      ))}
    </div>
  )
}

// Purchase API 응답(predictions)으로부터 slipGroups 빌드
function buildSlipGroupsFromPredictions(
  predictions: Prediction[],
  activitySport: string
): SlipGroup[] {
  // Purchase API는 odds를 반환하지 않으므로, 가능한 정보로 구성
  // game에 odds가 있을 수 있음 (purchase API에서 betman_games join 확장 시)
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
    }
  })

  return [
    {
      slipId: "purchased",
      sport,
      date,
      status,
      stake: 0,
      totalOdds: 0,
      profit: 0,
      matches,
    },
  ]
}

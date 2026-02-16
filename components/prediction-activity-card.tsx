'use client'

import { useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Lock, Unlock, TrendingUp, Target, Flame, Loader2 } from 'lucide-react'

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
  predictions: Prediction[] | null
}

function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return "방금 전"
  if (diffMins < 60) return `${diffMins}분 전`
  if (diffHours < 24) return `${diffHours}시간 전`
  if (diffDays < 7) return `${diffDays}일 전`
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })
}

const SPORT_LABELS: Record<string, string> = {
  '축구': '축구',
  '야구': '야구',
  '농구': '농구',
  '배구': '배구',
}

const PREDICTION_LABELS: Record<string, string> = {
  home: '홈',
  draw: '무',
  away: '원정',
  over: '오버',
  under: '언더',
}

export function PredictionActivityCard({ activity, onPurchase }: {
  activity: ActivityData
  onPurchase: (activityId: string) => Promise<Prediction[] | null>
}) {
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [localPredictions, setLocalPredictions] = useState<Prediction[] | null>(activity.predictions)
  const [isPurchased, setIsPurchased] = useState(activity.is_purchased)

  const handlePurchase = async () => {
    setIsPurchasing(true)
    try {
      const preds = await onPurchase(activity.id)
      if (preds) {
        setLocalPredictions(preds)
        setIsPurchased(true)
      }
    } finally {
      setIsPurchasing(false)
    }
  }

  const sportLabel = SPORT_LABELS[activity.sport] || activity.sport

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* 상단: 프로필 + 스탯 */}
      <div className="p-4 flex items-start gap-3">
        <Avatar className="h-10 w-10 flex-shrink-0">
          <AvatarImage src={activity.profile.avatar_url || '/placeholder-user.jpg'} alt={activity.profile.nickname} />
          <AvatarFallback>{activity.profile.nickname?.[0] || '?'}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">{activity.profile.nickname}</span>
            {activity.stats && (
              <div className="flex items-center gap-1.5">
                {activity.stats.accuracy > 0 && (
                  <Badge variant="secondary" className="text-[11px] px-1.5 py-0 h-5 gap-0.5">
                    <Target className="h-3 w-3" />
                    {activity.stats.accuracy.toFixed(1)}%
                  </Badge>
                )}
                {activity.stats.current_streak > 0 && (
                  <Badge variant="secondary" className="text-[11px] px-1.5 py-0 h-5 gap-0.5 text-orange-600">
                    <Flame className="h-3 w-3" />
                    {activity.stats.current_streak}연승
                  </Badge>
                )}
                {activity.stats.net_profit > 0 && (
                  <Badge variant="secondary" className="text-[11px] px-1.5 py-0 h-5 gap-0.5 text-emerald-600">
                    <TrendingUp className="h-3 w-3" />
                    +{activity.stats.net_profit.toFixed(0)}
                  </Badge>
                )}
              </div>
            )}
          </div>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {sportLabel} {activity.prediction_count}경기 예측 등록
            {activity.round && (
              <span className="ml-1">
                ({activity.round.year}년 {activity.round.round}회차)
              </span>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {formatRelativeTime(new Date(activity.created_at))}
          </p>
        </div>
      </div>

      {/* 하단: 잠금/열람 */}
      {isPurchased && localPredictions ? (
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Unlock className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-[12px] font-medium text-emerald-600">열람 완료</span>
          </div>
          <div className="space-y-1.5">
            {localPredictions.map((pred) => (
              <div key={pred.id} className="flex items-center justify-between text-[13px] py-1 px-2 rounded bg-muted/50">
                <span className="text-foreground truncate flex-1">
                  {pred.game?.home_team_name} vs {pred.game?.away_team_name}
                </span>
                <Badge
                  variant={pred.status === 'settled' && pred.game?.result === pred.prediction ? 'default' : 'secondary'}
                  className="text-[11px] px-1.5 py-0 h-5 ml-2 shrink-0"
                >
                  {PREDICTION_LABELS[pred.prediction] || pred.prediction}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="border-t border-border px-4 py-3">
          <Button
            onClick={handlePurchase}
            disabled={isPurchasing}
            variant="outline"
            className="w-full gap-2 text-amber-600 border-amber-300 hover:bg-amber-50 hover:text-amber-700"
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
        </div>
      )}
    </div>
  )
}

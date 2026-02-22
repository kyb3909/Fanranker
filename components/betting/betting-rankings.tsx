"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Trophy, Target, Loader2 } from "lucide-react"
import type { RankingUser, MyRank } from "./betting-types"

interface BettingRankingsProps {
  rankings: RankingUser[]
  myRank: MyRank | null
  isLoading: boolean
  followedUsers: Set<string>
  followLoading: Set<string>
  onFollow: (userId: string) => void
}

export function BettingRankings({
  rankings,
  myRank,
  isLoading,
  followedUsers,
  followLoading,
  onFollow,
}: BettingRankingsProps) {
  return (
    <div className="space-y-2">
      {/* My rank card */}
      {myRank && (
        <Card className="overflow-hidden border-primary/30 bg-primary/5">
          <div className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold text-primary">내 순위</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">
                {myRank.rank ?? '-'}
              </div>
              <div className="flex-1">
                <div className="font-semibold text-sm">{myRank.nickname || '나'}</div>
                <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                  <span>
                    수익률 <span className={`font-medium ${(myRank.profit_rate || 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {(myRank.profit_rate || 0) >= 0 ? '+' : ''}{(myRank.profit_rate || 0).toFixed(1)}%
                    </span>
                  </span>
                  <span>
                    적중률 <span className="font-medium text-primary">{(myRank.accuracy || 0).toFixed(1)}%</span>
                  </span>
                  <span>
                    {myRank.correct_predictions || 0}/{myRank.total_predictions || 0}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-sm font-bold ${(myRank.net_profit || 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {(myRank.net_profit || 0) >= 0 ? '+' : ''}{(myRank.net_profit || 0).toFixed(2)}
                </div>
                <div className="text-[10px] text-muted-foreground">순수익</div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Ranking table header */}
      {rankings.length > 0 && (
        <div className="flex items-center px-3 py-1.5 text-[10px] text-muted-foreground font-medium">
          <span className="w-8 text-center">#</span>
          <span className="flex-1 ml-2">유저</span>
          <span className="w-14 text-right">수익률</span>
          <span className="w-14 text-right">적중률</span>
          <span className="w-16 text-right">순수익</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center items-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rankings.length === 0 ? (
        <div className="text-center py-8">
          <Trophy className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-muted-foreground text-sm">아직 랭킹 데이터가 없습니다.</p>
          <p className="text-muted-foreground/60 text-xs mt-1">예측에 참여하고 랭킹에 도전해보세요!</p>
        </div>
      ) : (
        rankings.map((user) => {
          const rank = user.rank
          const isTop3 = rank <= 3
          const medalColors = ["text-yellow-500", "text-gray-400", "text-amber-600"]
          const isFollowed = followedUsers.has(user.user_id)
          const isFollowLoading = followLoading.has(user.user_id)
          const streakText = user.current_streak > 0
            ? `${user.current_streak}연승`
            : user.current_streak < 0
              ? `${Math.abs(user.current_streak)}연패`
              : ''

          return (
            <Card
              key={user.user_id}
              className={`overflow-hidden transition-all hover:shadow-md ${isTop3 ? "border-l-4" : ""}`}
              style={
                isTop3 ? { borderLeftColor: rank === 1 ? "#EAB308" : rank === 2 ? "#9CA3AF" : "#D97706" } : {}
              }
            >
              <div className="p-2.5 space-y-2">
                {/* Row 1: Rank + Nickname + Follow */}
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 flex items-center justify-center rounded-full font-bold text-xs shrink-0 ${
                      isTop3 ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {isTop3 ? <Trophy className={`w-3.5 h-3.5 ${medalColors[rank - 1]}`} /> : rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm truncate">{user.nickname}</span>
                      {streakText && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                          user.current_streak > 0
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          🔥{streakText}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {user.correct_predictions}/{user.total_predictions}적중
                      {user.best_win_streak > 1 && (
                        <span className="ml-1.5 text-amber-600">최고 {user.best_win_streak}연승</span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={isFollowed ? "outline" : "default"}
                    onClick={() => onFollow(user.user_id)}
                    disabled={isFollowLoading}
                    className={`h-7 px-3 text-xs rounded-full shrink-0 ${
                      isFollowed
                        ? "text-muted-foreground hover:text-red-500 hover:border-red-300"
                        : "bg-gray-900 text-white hover:bg-gray-800"
                    }`}
                  >
                    {isFollowLoading ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : isFollowed ? '팔로잉' : '팔로우'}
                  </Button>
                </div>
                {/* Row 2: Profit Rate / Win Rate / Net Profit */}
                <div className="flex items-center gap-1 ml-9">
                  <div className="flex-1 text-center px-2 py-1 bg-muted/50 rounded">
                    <div className={`text-xs font-bold ${
                      (user.profit_rate || 0) >= 0 ? 'text-emerald-600' : 'text-red-500'
                    }`}>
                      {(user.profit_rate || 0) >= 0 ? '+' : ''}{(user.profit_rate || 0).toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-muted-foreground">수익률</div>
                  </div>
                  <div className="flex-1 text-center px-2 py-1 bg-muted/50 rounded">
                    <div className="text-xs font-bold text-primary">
                      {(user.accuracy || 0).toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-muted-foreground">적중률</div>
                  </div>
                  <div className="flex-1 text-center px-2 py-1 bg-muted/50 rounded">
                    <div className={`text-xs font-bold ${
                      (user.net_profit || 0) >= 0 ? 'text-emerald-600' : 'text-red-500'
                    }`}>
                      {(user.net_profit || 0) >= 0 ? '+' : ''}{(user.net_profit || 0).toFixed(2)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">순수익</div>
                  </div>
                </div>
              </div>
            </Card>
          )
        })
      )}
    </div>
  )
}

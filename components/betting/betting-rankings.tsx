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
        <Card className="border-primary/30 bg-primary/5 overflow-hidden">
          <div className="p-3">
            <div className="mb-2 flex items-center gap-2">
              <Target className="text-primary h-4 w-4" />
              <span className="text-primary text-xs font-semibold">내 순위</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="bg-primary text-primary-foreground flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold">
                {myRank.rank ?? "-"}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold">{myRank.nickname || "나"}</div>
                <div className="text-muted-foreground mt-0.5 flex gap-3 text-xs">
                  <span>
                    수익률{" "}
                    <span
                      className={`font-medium ${(myRank.profit_rate || 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}
                    >
                      {(myRank.profit_rate || 0) >= 0 ? "+" : ""}
                      {(myRank.profit_rate || 0).toFixed(1)}%
                    </span>
                  </span>
                  <span>
                    적중률{" "}
                    <span className="text-primary font-medium">
                      {(myRank.accuracy || 0).toFixed(1)}%
                    </span>
                  </span>
                  <span>
                    {myRank.correct_predictions || 0}/{myRank.total_predictions || 0}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div
                  className={`text-sm font-bold ${(myRank.net_profit || 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}
                >
                  {(myRank.net_profit || 0) >= 0 ? "+" : ""}
                  {(myRank.net_profit || 0).toFixed(2)}
                </div>
                <div className="text-muted-foreground text-[10px]">순수익</div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Ranking table header */}
      {rankings.length > 0 && (
        <div className="text-muted-foreground flex items-center px-3 py-1.5 text-[10px] font-medium">
          <span className="w-8 text-center">#</span>
          <span className="ml-2 flex-1">유저</span>
          <span className="w-14 text-right">수익률</span>
          <span className="w-14 text-right">적중률</span>
          <span className="w-16 text-right">순수익</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        </div>
      ) : rankings.length === 0 ? (
        <div className="py-8 text-center">
          <Trophy className="text-muted-foreground/30 mx-auto mb-2 h-10 w-10" />
          <p className="text-muted-foreground text-sm">아직 랭킹 데이터가 없습니다.</p>
          <p className="text-muted-foreground/60 mt-1 text-xs">
            예측에 참여하고 랭킹에 도전해보세요!
          </p>
        </div>
      ) : (
        rankings.map((user) => {
          const rank = user.rank
          const isTop3 = rank <= 3
          const medalColors = ["text-yellow-500", "text-muted-foreground", "text-amber-600"]
          const isFollowed = followedUsers.has(user.user_id)
          const isFollowLoading = followLoading.has(user.user_id)
          const streakText =
            user.current_streak > 0
              ? `${user.current_streak}연승`
              : user.current_streak < 0
                ? `${Math.abs(user.current_streak)}연패`
                : ""

          return (
            <Card
              key={user.user_id}
              className={`overflow-hidden transition-all hover:shadow-md ${isTop3 ? "border-l-4" : ""}`}
              style={
                isTop3
                  ? { borderLeftColor: rank === 1 ? "#EAB308" : rank === 2 ? "#9CA3AF" : "#D97706" }
                  : {}
              }
            >
              <div className="space-y-2 p-2.5">
                {/* Row 1: Rank + Nickname + Follow */}
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isTop3 ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isTop3 ? <Trophy className={`h-3.5 w-3.5 ${medalColors[rank - 1]}`} /> : rank}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{user.nickname}</span>
                      {streakText && (
                        <span
                          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                            user.current_streak > 0
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          🔥{streakText}
                        </span>
                      )}
                    </div>
                    <div className="text-muted-foreground mt-0.5 text-[11px]">
                      {user.correct_predictions}/{user.total_predictions}적중
                      {user.best_win_streak > 1 && (
                        <span className="ml-1.5 text-amber-600">
                          최고 {user.best_win_streak}연승
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={isFollowed ? "outline" : "default"}
                    onClick={() => onFollow(user.user_id)}
                    disabled={isFollowLoading}
                    className={`h-7 shrink-0 rounded-full px-3 text-xs ${
                      isFollowed
                        ? "text-muted-foreground hover:border-red-300 hover:text-red-500"
                        : "bg-foreground text-background hover:bg-foreground/90"
                    }`}
                  >
                    {isFollowLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : isFollowed ? (
                      "팔로잉"
                    ) : (
                      "팔로우"
                    )}
                  </Button>
                </div>
                {/* Row 2: Profit Rate / Win Rate / Net Profit */}
                <div className="ml-9 flex items-center gap-1">
                  <div className="bg-muted/50 flex-1 rounded px-2 py-1 text-center">
                    <div
                      className={`text-xs font-bold ${
                        (user.profit_rate || 0) >= 0 ? "text-emerald-600" : "text-red-500"
                      }`}
                    >
                      {(user.profit_rate || 0) >= 0 ? "+" : ""}
                      {(user.profit_rate || 0).toFixed(1)}%
                    </div>
                    <div className="text-muted-foreground text-[10px]">수익률</div>
                  </div>
                  <div className="bg-muted/50 flex-1 rounded px-2 py-1 text-center">
                    <div className="text-primary text-xs font-bold">
                      {(user.accuracy || 0).toFixed(1)}%
                    </div>
                    <div className="text-muted-foreground text-[10px]">적중률</div>
                  </div>
                  <div className="bg-muted/50 flex-1 rounded px-2 py-1 text-center">
                    <div
                      className={`text-xs font-bold ${
                        (user.net_profit || 0) >= 0 ? "text-emerald-600" : "text-red-500"
                      }`}
                    >
                      {(user.net_profit || 0) >= 0 ? "+" : ""}
                      {(user.net_profit || 0).toFixed(2)}
                    </div>
                    <div className="text-muted-foreground text-[10px]">순수익</div>
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

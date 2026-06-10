"use client"

import { Button } from "@/components/ui/button"
import { Trophy, Target, Loader2 } from "lucide-react"
import type { RankingUser, MyRank } from "@/types/betting"

interface BettingRankingsProps {
  rankings: RankingUser[]
  myRank: MyRank | null
  isLoading: boolean
  followedUsers: Set<string>
  followLoading: Set<string>
  onFollow: (userId: string) => void
}

const medalIcons = ["🏆", "🥈", "🥉"]
const medalRowBg = [
  "bg-yellow-50/80 dark:bg-yellow-950/20", // 금
  "bg-slate-100/60 dark:bg-slate-800/20", // 은
  "bg-orange-50/70 dark:bg-orange-950/20", // 동
]

export function BettingRankings({
  rankings,
  myRank,
  isLoading,
  followedUsers,
  followLoading,
  onFollow,
}: BettingRankingsProps) {
  return (
    <div className="space-y-3">
      {/* 내 순위 카드 */}
      {myRank && (
        <div
          className="overflow-hidden rounded-xl"
          style={{
            background: "var(--wc-card, #ffffff)",
            boxShadow: "var(--wc-shadow-1)",
          }}
        >
          <div
            className="flex items-center gap-2 px-4 py-3"
            style={{
              background: "var(--wc-soft, #f4ece6)",
              borderBottom: "1px solid var(--wc-line, #efe7e0)",
            }}
          >
            <Target className="h-4 w-4" style={{ color: "var(--wc-burgundy, #a0203b)" }} />
            <span
              className="text-[11px] font-bold uppercase"
              style={{
                color: "var(--wc-burgundy, #a0203b)",
                letterSpacing: "0.18em",
              }}
            >
              내 순위
            </span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums"
              style={{ background: "var(--wc-burgundy, #a0203b)", color: "white" }}
            >
              {myRank.rank ?? "-"}
            </div>
            <span className="text-sm font-bold" style={{ color: "var(--wc-ink, #1a1416)" }}>
              {myRank.nickname || "나"}
            </span>
            <div
              className="flex flex-1 items-center gap-3 text-xs"
              style={{ color: "var(--wc-mute, #7a6b65)" }}
            >
              <span>
                수익률{" "}
                <span
                  className="font-bold tabular-nums"
                  style={{
                    color:
                      (myRank.profit_rate || 0) >= 0
                        ? "var(--wc-go, #2f7d5b)"
                        : "var(--wc-down, #c03a3a)",
                  }}
                >
                  {(myRank.profit_rate || 0) >= 0 ? "+" : ""}
                  {(myRank.profit_rate || 0).toFixed(1)}%
                </span>
              </span>
              <span>
                적중률{" "}
                <span
                  className="font-bold tabular-nums"
                  style={{ color: "var(--wc-burgundy, #a0203b)" }}
                >
                  {(myRank.accuracy || 0).toFixed(1)}%
                </span>
              </span>
              <span className="tabular-nums">
                {myRank.correct_predictions || 0}/{myRank.total_predictions || 0}
              </span>
            </div>
            <div
              className="text-sm font-bold tabular-nums"
              style={{
                color:
                  (myRank.net_profit || 0) >= 0
                    ? "var(--wc-go, #2f7d5b)"
                    : "var(--wc-down, #c03a3a)",
              }}
            >
              {(myRank.net_profit || 0) >= 0 ? "+" : ""}
              {(myRank.net_profit || 0).toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {/* 랭킹 리스트 */}
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
        <div
          className="overflow-hidden rounded-xl"
          style={{
            background: "var(--wc-card, #ffffff)",
            boxShadow: "var(--wc-shadow-1)",
          }}
        >
          {/* 테이블 헤더 */}
          <div
            className="grid grid-cols-[2rem_1fr_3.5rem_4rem] items-center gap-1 px-3 py-2.5 text-[11px] font-bold uppercase sm:grid-cols-[2rem_1fr_3.5rem_3.5rem_3.5rem_4.5rem] sm:gap-2 sm:px-4"
            style={{
              background: "var(--wc-soft, #f4ece6)",
              color: "var(--wc-burgundy, #a0203b)",
              letterSpacing: "0.06em",
              borderBottom: "1px solid var(--wc-line, #efe7e0)",
            }}
          >
            <span className="text-center">#</span>
            <span>유저</span>
            <span className="text-right">수익률</span>
            <span className="hidden text-right sm:block">적중률</span>
            <span className="hidden text-right sm:block">순수익</span>
            <span />
          </div>

          {/* 랭킹 행 */}
          {rankings.map((user, index) => {
            const rank = user.rank
            const isTop3 = rank <= 3
            const isFollowed = followedUsers.has(user.user_id)
            const isFollowLoading = followLoading.has(user.user_id)

            return (
              <div
                key={user.user_id}
                className={`grid grid-cols-[2rem_1fr_3.5rem_4rem] items-center gap-1 px-3 py-3 transition-colors sm:grid-cols-[2rem_1fr_3.5rem_3.5rem_3.5rem_4.5rem] sm:gap-2 sm:px-4 ${
                  isTop3 ? `${medalRowBg[rank - 1]} hover:brightness-95` : "hover:bg-muted/40"
                } ${index > 0 ? "border-border/30 border-t" : ""}`}
              >
                {/* 순위 */}
                <div className="text-center">
                  {isTop3 ? (
                    <span className="text-base">{medalIcons[rank - 1]}</span>
                  ) : (
                    <span className="text-muted-foreground text-xs font-bold">{rank}</span>
                  )}
                </div>

                {/* 유저 정보 */}
                <div className="min-w-0">
                  <span className="truncate text-sm font-semibold">{user.nickname}</span>
                </div>

                {/* 수익률 */}
                <div className="text-right">
                  <span
                    className="text-xs font-bold tabular-nums"
                    style={{
                      color:
                        (user.profit_rate || 0) >= 0
                          ? "var(--wc-go, #2f7d5b)"
                          : "var(--wc-down, #c03a3a)",
                    }}
                  >
                    {(user.profit_rate || 0) >= 0 ? "+" : ""}
                    {(user.profit_rate || 0).toFixed(1)}%
                  </span>
                </div>

                {/* 적중률 */}
                <div className="hidden text-right sm:block">
                  <span
                    className="text-xs font-bold tabular-nums"
                    style={{ color: "var(--wc-burgundy, #a0203b)" }}
                  >
                    {(user.accuracy || 0).toFixed(1)}%
                  </span>
                </div>

                {/* 순수익 */}
                <div className="hidden text-right sm:block">
                  <span
                    className="text-xs font-bold tabular-nums"
                    style={{
                      color:
                        (user.net_profit || 0) >= 0
                          ? "var(--wc-go, #2f7d5b)"
                          : "var(--wc-down, #c03a3a)",
                    }}
                  >
                    {(user.net_profit || 0) >= 0 ? "+" : ""}
                    {(user.net_profit || 0).toFixed(2)}
                  </span>
                </div>

                {/* 팔로우 버튼 */}
                <div className="text-right">
                  <Button
                    size="sm"
                    variant={isFollowed ? "outline" : "default"}
                    onClick={() => onFollow(user.user_id)}
                    disabled={isFollowLoading}
                    className={`h-7 shrink-0 rounded-full px-3 text-xs ${
                      isFollowed
                        ? "text-muted-foreground hover:border-primary/50 hover:text-primary"
                        : "bg-primary text-primary-foreground hover:bg-primary/90"
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
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

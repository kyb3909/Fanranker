"use client"

import { Card } from "@/components/ui/card"
import { SPORT_ICONS } from "@/types/betting"
import type { CommunityStatsData } from "@/hooks/use-betting-community-stats"

interface StatsTabProps {
  stats: CommunityStatsData | null
  isLoading: boolean
}

function StatSkeleton() {
  return (
    <div className="space-y-4">
      <div className="bg-muted h-48 animate-pulse rounded-xl" />
      <div className="bg-muted h-32 animate-pulse rounded-xl" />
      <div className="bg-muted h-64 animate-pulse rounded-xl" />
    </div>
  )
}

function formatBalls(n: number): string {
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(1)}만`
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}천`
  return n.toLocaleString()
}

export function StatsTab({ stats, isLoading }: StatsTabProps) {
  if (isLoading || !stats) return <StatSkeleton />

  const { overall, bySport, dailyTrend } = stats
  const housePnl = overall.housePnl
  const usersWinning = housePnl < 0
  const totalGames = overall.correctPredictions + overall.wrongPredictions

  // 7일 추이에서 최대/최소 housePnl 계산 (바 차트 스케일링용)
  const trendHousePnls = dailyTrend.map((d) => d.housePnl)
  const maxAbsPnl = Math.max(...trendHousePnls.map(Math.abs), 1)

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 주인장 vs 유저 대결 보드 */}
      <Card
        className="overflow-hidden"
        style={{
          background: "var(--wc-card, #ffffff)",
          boxShadow: "var(--wc-shadow-1)",
        }}
      >
        <div className="p-4 sm:p-5">
          <div className="mb-4 text-center">
            <h3 className="text-foreground text-lg font-bold">주인장 vs 유저</h3>
            <p className="text-muted-foreground mt-0.5 text-sm">지금 누가 더 잘 예측하고 있을까?</p>
          </div>

          {/* 메인 대결 카드 */}
          <div
            className={`rounded-xl p-5 text-center ${
              usersWinning
                ? "bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30"
                : housePnl > 0
                  ? "bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/30"
                  : "bg-muted/50"
            }`}
          >
            <div className="mb-2 text-4xl">{usersWinning ? "🔥" : housePnl > 0 ? "😈" : "⚖️"}</div>
            <p
              className={`text-lg font-bold ${
                usersWinning
                  ? "text-emerald-700 dark:text-emerald-400"
                  : housePnl > 0
                    ? "text-red-700 dark:text-red-400"
                    : "text-muted-foreground"
              }`}
            >
              {usersWinning
                ? "유저들이 앞서고 있어요!"
                : housePnl > 0
                  ? "주인장이 웃고 있습니다…"
                  : "아직 팽팽해요!"}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              주인장 {usersWinning ? "손실" : "수익"}:{" "}
              <span className="font-semibold">
                {usersWinning ? "-" : "+"}
                {formatBalls(Math.abs(housePnl))} 볼
              </span>
            </p>
          </div>

          {/* 대결 스탯 */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="bg-muted/40 rounded-lg p-3 text-center">
              <p className="text-muted-foreground text-xs">유저 평균 수익률</p>
              <p
                className={`text-xl font-bold ${
                  (overall.avgProfitRate ?? 0) >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {overall.avgProfitRate !== null ? `${overall.avgProfitRate}%` : "-"}
              </p>
            </div>
            <div className="bg-muted/40 rounded-lg p-3 text-center">
              <p className="text-muted-foreground text-xs">유저 평균 적중률</p>
              <p className="text-foreground text-xl font-bold">
                {overall.avgAccuracy !== null ? `${overall.avgAccuracy}%` : "-"}
              </p>
            </div>
          </div>

          {/* 참여 통계 */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="bg-muted/40 rounded-lg p-2.5 text-center">
              <p className="text-muted-foreground text-[11px]">참여자</p>
              <p className="text-foreground text-sm font-semibold">{overall.totalParticipants}명</p>
            </div>
            <div className="bg-muted/40 rounded-lg p-2.5 text-center">
              <p className="text-muted-foreground text-[11px]">총 예측</p>
              <p className="text-foreground text-sm font-semibold">
                {totalGames.toLocaleString()}건
              </p>
            </div>
            <div className="bg-muted/40 rounded-lg p-2.5 text-center">
              <p className="text-muted-foreground text-[11px]">총 배팅</p>
              <p className="text-foreground text-sm font-semibold">
                {formatBalls(overall.totalWagered)} 볼
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* 종목별 통계 */}
      <Card
        className="overflow-hidden"
        style={{
          background: "var(--wc-card, #ffffff)",
          boxShadow: "var(--wc-shadow-1)",
        }}
      >
        <div className="p-4 sm:p-5">
          <h3 className="text-foreground mb-3 text-base font-bold">종목별 통계</h3>
          <div className="space-y-2">
            {bySport.map((s) => {
              const sportIcon = SPORT_ICONS[s.sport] ?? "🎯"
              const sportHouseLosing = s.housePnl < 0
              return (
                <div
                  key={s.sport}
                  className="bg-muted/30 hover:bg-muted/50 flex items-center gap-3 rounded-lg p-3 transition-colors"
                >
                  <span className="text-2xl">{sportIcon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground text-sm font-semibold">{s.sport}</span>
                      <span className="text-muted-foreground text-[11px]">
                        {s.participants}명 참여
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-[12px]">
                      <span className="text-muted-foreground">
                        적중률{" "}
                        <span className="text-foreground font-medium">
                          {s.avgAccuracy !== null ? `${s.avgAccuracy}%` : "-"}
                        </span>
                      </span>
                      <span className="text-muted-foreground">
                        수익률{" "}
                        <span
                          className={`font-medium ${
                            (s.avgProfitRate ?? 0) >= 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-600 dark:text-red-400"
                          }`}
                        >
                          {s.avgProfitRate !== null ? `${s.avgProfitRate}%` : "-"}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`text-sm font-bold ${
                        sportHouseLosing
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {sportHouseLosing ? "유저 승" : "주인장 승"}
                    </p>
                    <p className="text-muted-foreground text-[11px]">
                      {formatBalls(Math.abs(s.housePnl))} 볼
                    </p>
                  </div>
                </div>
              )
            })}
            {bySport.length === 0 && (
              <p className="text-muted-foreground py-8 text-center text-sm">
                아직 통계 데이터가 없습니다.
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* 최근 7일 전세 추이 */}
      <Card
        className="overflow-hidden"
        style={{
          background: "var(--wc-card, #ffffff)",
          boxShadow: "var(--wc-shadow-1)",
        }}
      >
        <div className="p-4 sm:p-5">
          <h3 className="text-foreground mb-1 text-base font-bold">최근 7일 전세</h3>
          <p className="text-muted-foreground mb-4 text-xs">
            위로 갈수록 주인장 유리, 아래로 갈수록 유저 유리
          </p>
          <div className="space-y-1.5">
            {dailyTrend.map((day) => {
              const barWidth = maxAbsPnl > 0 ? (Math.abs(day.housePnl) / maxAbsPnl) * 100 : 0
              const isHouseWin = day.housePnl > 0
              const dateLabel = day.date.slice(5).replace("-", "/")

              return (
                <div key={day.date} className="flex items-center gap-2">
                  <span className="text-muted-foreground w-12 shrink-0 text-right text-[12px] tabular-nums">
                    {dateLabel}
                  </span>
                  <div className="relative flex h-7 flex-1 items-center">
                    {/* 중앙 기준선 */}
                    <div className="bg-border absolute left-1/2 h-full w-px" />
                    {day.housePnl === 0 ? (
                      <div className="bg-muted absolute left-1/2 h-5 w-1 -translate-x-1/2 rounded" />
                    ) : isHouseWin ? (
                      /* 주인장 승: 오른쪽으로 (빨간) */
                      <div
                        className="absolute left-1/2 h-5 rounded-r bg-red-400/70 dark:bg-red-500/50"
                        style={{ width: `${barWidth / 2}%` }}
                      />
                    ) : (
                      /* 유저 승: 왼쪽으로 (초록) */
                      <div
                        className="absolute right-1/2 h-5 rounded-l bg-emerald-400/70 dark:bg-emerald-500/50"
                        style={{ width: `${barWidth / 2}%` }}
                      />
                    )}
                  </div>
                  <span
                    className={`w-16 shrink-0 text-[11px] font-medium tabular-nums ${
                      isHouseWin
                        ? "text-red-600 dark:text-red-400"
                        : day.housePnl < 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-muted-foreground"
                    }`}
                  >
                    {day.housePnl > 0 ? "+" : ""}
                    {formatBalls(day.housePnl)}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="mt-3 flex justify-between text-[11px]">
            <span className="text-emerald-600 dark:text-emerald-400">← 유저 유리</span>
            <span className="text-red-600 dark:text-red-400">주인장 유리 →</span>
          </div>
        </div>
      </Card>
    </div>
  )
}

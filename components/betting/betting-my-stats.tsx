"use client"

import { Card } from "@/components/ui/card"
import { Target, BarChart3, Loader2 } from "lucide-react"
import type { MyStatsData } from "@/types/betting"
import { BoardIcon } from "@/components/sidebar/board-icon"

interface BettingMyStatsProps {
  myStats: MyStatsData | null
  isLoading: boolean
}

export function BettingMyStats({ myStats, isLoading }: BettingMyStatsProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (!myStats?.summary) {
    return (
      <div className="py-8 text-center">
        <BarChart3 className="text-muted-foreground/30 mx-auto mb-2 h-10 w-10" />
        <p className="text-muted-foreground text-sm">아직 통계 데이터가 없습니다.</p>
        <p className="text-muted-foreground/60 mt-1 text-xs">예측에 참여하면 통계가 생성됩니다.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Overall stats summary */}
      <Card
        className="overflow-hidden"
        style={{
          background: "var(--wc-card, #ffffff)",
          boxShadow: "var(--wc-shadow-1)",
        }}
      >
        <div
          className="p-3"
          style={{
            background: "var(--wc-soft, #f2efea)",
            borderBottom: "1px solid var(--wc-line, #e8e5e0)",
          }}
        >
          <div className="flex items-center gap-2">
            <Target className="text-primary h-4 w-4" />
            <span className="text-sm font-semibold">전체 통계</span>
          </div>
        </div>
        <div className="p-3">
          {/* Key metrics 3-col */}
          <div className="mb-3 grid grid-cols-3 gap-2">
            <div className="bg-muted/40 rounded-lg p-2 text-center">
              <div
                className={`text-lg font-bold ${
                  (myStats.summary.profit_rate || 0) >= 0 ? "text-emerald-600" : "text-primary"
                }`}
              >
                {(myStats.summary.profit_rate || 0) >= 0 ? "+" : ""}
                {(myStats.summary.profit_rate || 0).toFixed(1)}%
              </div>
              <div className="text-muted-foreground mt-0.5 text-[10px]">수익률</div>
            </div>
            <div className="bg-muted/40 rounded-lg p-2 text-center">
              <div className="text-primary text-lg font-bold">
                {(myStats.summary.accuracy || 0).toFixed(1)}%
              </div>
              <div className="text-muted-foreground mt-0.5 text-[10px]">적중률</div>
            </div>
            <div className="bg-muted/40 rounded-lg p-2 text-center">
              <div
                className={`text-lg font-bold ${
                  (myStats.summary.net_profit || 0) >= 0 ? "text-emerald-600" : "text-primary"
                }`}
              >
                {(myStats.summary.net_profit || 0) >= 0 ? "+" : ""}
                {(myStats.summary.net_profit || 0).toFixed(2)}
              </div>
              <div className="text-muted-foreground mt-0.5 text-[10px]">순수익</div>
            </div>
          </div>
          {/* Detail info */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">총 예측</span>
              <span className="font-medium">{myStats.summary.total_predictions}건</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">적중/미적중</span>
              <span className="font-medium">
                <span className="text-emerald-600">{myStats.summary.correct_predictions}</span>/
                <span className="text-primary">{myStats.summary.wrong_predictions}</span>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">현재</span>
              <span
                className={`font-medium ${
                  (myStats.summary.current_streak || 0) > 0
                    ? "text-emerald-600"
                    : (myStats.summary.current_streak || 0) < 0
                      ? "text-primary"
                      : ""
                }`}
              >
                {myStats.summary.current_streak > 0
                  ? `${myStats.summary.current_streak}연승 🔥`
                  : myStats.summary.current_streak < 0
                    ? `${Math.abs(myStats.summary.current_streak)}연패`
                    : "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">최고 연승</span>
              <span className="font-medium text-amber-600">
                {myStats.summary.best_win_streak > 0
                  ? `${myStats.summary.best_win_streak}연승`
                  : "-"}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Per-sport stats */}
      {myStats.sports.length > 0 && (
        <Card className="overflow-hidden">
          <div className="bg-muted/30 border-b p-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="text-primary h-4 w-4" />
              <span className="text-sm font-semibold">종목별 통계</span>
            </div>
          </div>
          <div className="divide-y">
            {myStats.sports.map((sport) => {
              return (
                <div key={sport.sport} className="p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <BoardIcon slug={sport.sport} className="h-4 w-4" />
                      <span className="text-sm font-semibold">{sport.sport}</span>
                      <span className="text-muted-foreground ml-1 text-[10px]">
                        {sport.correct_predictions}/{sport.total_predictions}적중
                      </span>
                    </div>
                    {sport.current_streak !== 0 && (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          sport.current_streak > 0
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-primary/15 text-primary"
                        }`}
                      >
                        {sport.current_streak > 0
                          ? `${sport.current_streak}연승`
                          : `${Math.abs(sport.current_streak)}연패`}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <div className="bg-muted/40 rounded px-2 py-1.5 text-center">
                      <div
                        className={`text-xs font-bold ${
                          (sport.profit_rate || 0) >= 0 ? "text-emerald-600" : "text-primary"
                        }`}
                      >
                        {(sport.profit_rate || 0) >= 0 ? "+" : ""}
                        {(sport.profit_rate || 0).toFixed(1)}%
                      </div>
                      <div className="text-muted-foreground text-[10px]">수익률</div>
                    </div>
                    <div className="bg-muted/40 rounded px-2 py-1.5 text-center">
                      <div className="text-primary text-xs font-bold">
                        {(sport.accuracy || 0).toFixed(1)}%
                      </div>
                      <div className="text-muted-foreground text-[10px]">적중률</div>
                    </div>
                    <div className="bg-muted/40 rounded px-2 py-1.5 text-center">
                      <div
                        className={`text-xs font-bold ${
                          (sport.net_profit || 0) >= 0 ? "text-emerald-600" : "text-primary"
                        }`}
                      >
                        {(sport.net_profit || 0) >= 0 ? "+" : ""}
                        {(sport.net_profit || 0).toFixed(2)}
                      </div>
                      <div className="text-muted-foreground text-[10px]">순수익</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}

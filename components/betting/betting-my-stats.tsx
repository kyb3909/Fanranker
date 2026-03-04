"use client"

import { Card } from "@/components/ui/card"
import { Target, BarChart3, Loader2 } from "lucide-react"
import type { MyStatsData } from "./betting-types"
import { SPORT_ICONS } from "./betting-types"

interface BettingMyStatsProps {
  myStats: MyStatsData | null
  isLoading: boolean
}

export function BettingMyStats({ myStats, isLoading }: BettingMyStatsProps) {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!myStats?.summary) {
    return (
      <div className="text-center py-8">
        <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
        <p className="text-muted-foreground text-sm">아직 통계 데이터가 없습니다.</p>
        <p className="text-muted-foreground/60 text-xs mt-1">예측에 참여하면 통계가 생성됩니다.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Overall stats summary */}
      <Card className="overflow-hidden">
        <div className="p-3 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">전체 통계</span>
          </div>
        </div>
        <div className="p-3">
          {/* Key metrics 3-col */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="text-center p-2 bg-muted/40 rounded-lg">
              <div className={`text-lg font-bold ${
                (myStats.summary.profit_rate || 0) >= 0 ? 'text-emerald-600' : 'text-primary'
              }`}>
                {(myStats.summary.profit_rate || 0) >= 0 ? '+' : ''}{(myStats.summary.profit_rate || 0).toFixed(1)}%
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">수익률</div>
            </div>
            <div className="text-center p-2 bg-muted/40 rounded-lg">
              <div className="text-lg font-bold text-primary">
                {(myStats.summary.accuracy || 0).toFixed(1)}%
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">적중률</div>
            </div>
            <div className="text-center p-2 bg-muted/40 rounded-lg">
              <div className={`text-lg font-bold ${
                (myStats.summary.net_profit || 0) >= 0 ? 'text-emerald-600' : 'text-primary'
              }`}>
                {(myStats.summary.net_profit || 0) >= 0 ? '+' : ''}{(myStats.summary.net_profit || 0).toFixed(2)}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">순수익</div>
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
                <span className="text-emerald-600">{myStats.summary.correct_predictions}</span>
                /
                <span className="text-primary">{myStats.summary.wrong_predictions}</span>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">현재</span>
              <span className={`font-medium ${
                (myStats.summary.current_streak || 0) > 0 ? 'text-emerald-600' : (myStats.summary.current_streak || 0) < 0 ? 'text-primary' : ''
              }`}>
                {myStats.summary.current_streak > 0
                  ? `${myStats.summary.current_streak}연승 🔥`
                  : myStats.summary.current_streak < 0
                    ? `${Math.abs(myStats.summary.current_streak)}연패`
                    : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">최고 연승</span>
              <span className="font-medium text-amber-600">
                {myStats.summary.best_win_streak > 0 ? `${myStats.summary.best_win_streak}연승` : '-'}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Per-sport stats */}
      {myStats.sports.length > 0 && (
        <Card className="overflow-hidden">
          <div className="p-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">종목별 통계</span>
            </div>
          </div>
          <div className="divide-y">
            {myStats.sports.map((sport) => {
              const icon = SPORT_ICONS[sport.sport] || '🎯'
              return (
                <div key={sport.sport} className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{icon}</span>
                      <span className="text-sm font-semibold">{sport.sport}</span>
                      <span className="text-[10px] text-muted-foreground ml-1">
                        {sport.correct_predictions}/{sport.total_predictions}적중
                      </span>
                    </div>
                    {sport.current_streak !== 0 && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        sport.current_streak > 0
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-primary/15 text-primary'
                      }`}>
                        {sport.current_streak > 0 ? `${sport.current_streak}연승` : `${Math.abs(sport.current_streak)}연패`}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <div className="text-center px-2 py-1.5 bg-muted/40 rounded">
                      <div className={`text-xs font-bold ${
                        (sport.profit_rate || 0) >= 0 ? 'text-emerald-600' : 'text-primary'
                      }`}>
                        {(sport.profit_rate || 0) >= 0 ? '+' : ''}{(sport.profit_rate || 0).toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-muted-foreground">수익률</div>
                    </div>
                    <div className="text-center px-2 py-1.5 bg-muted/40 rounded">
                      <div className="text-xs font-bold text-primary">
                        {(sport.accuracy || 0).toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-muted-foreground">적중률</div>
                    </div>
                    <div className="text-center px-2 py-1.5 bg-muted/40 rounded">
                      <div className={`text-xs font-bold ${
                        (sport.net_profit || 0) >= 0 ? 'text-emerald-600' : 'text-primary'
                      }`}>
                        {(sport.net_profit || 0) >= 0 ? '+' : ''}{(sport.net_profit || 0).toFixed(2)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">순수익</div>
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

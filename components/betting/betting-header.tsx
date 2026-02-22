"use client"

import { TrendingUp, Target, Coins } from "lucide-react"
import { SPORT_TABS } from "./betting-types"

interface BettingHeaderProps {
  activeTab: "betting" | "ranking" | "mypage"
  setActiveTab: (tab: "betting" | "ranking" | "mypage") => void
  // Betting tab filters
  sportFilter: "all" | "축구" | "야구" | "농구" | "배구"
  setSportFilter: (filter: "all" | "축구" | "야구" | "농구" | "배구") => void
  selectedSport: string | null
  // Ranking tab filters
  rankingSportFilter: string
  setRankingSportFilter: (filter: string) => void
  rankingFilter: "profit" | "winRate" | "roi"
  setRankingFilter: (filter: "profit" | "winRate" | "roi") => void
  // MyPage sub-tabs
  myPageTab: "predictions" | "stats" | "gold" | "profile"
  setMyPageTab: (tab: "predictions" | "stats" | "gold" | "profile") => void
}

export function BettingHeader({
  activeTab,
  setActiveTab,
  sportFilter,
  setSportFilter,
  selectedSport,
  rankingSportFilter,
  setRankingSportFilter,
  rankingFilter,
  setRankingFilter,
  myPageTab,
  setMyPageTab,
}: BettingHeaderProps) {
  return (
    <div className="bg-card rounded-xl border border-border mb-3 sm:mb-4 overflow-hidden">
      {/* 1행: 오늘의 경기 | 랭킹 | 마이페이지 */}
      <div className="flex border-b border-border">
        {[
          { id: "betting", label: "오늘의 경기" },
          { id: "ranking", label: "랭킹" },
          { id: "mypage", label: "마이페이지" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as "betting" | "ranking" | "mypage")}
            className={`flex items-center justify-center gap-2 flex-1 px-4 py-3 text-[14px] font-semibold transition-all border-b-2 -mb-[1px] ${
              activeTab === tab.id
                ? "border-primary text-primary bg-rose-50 dark:bg-rose-950/30"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 2행: 종목/필터 탭 */}
      {activeTab === "betting" && (
        <>
          <div className="flex overflow-x-auto scrollbar-none border-b border-border">
            {SPORT_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSportFilter(tab.id as "all" | "축구" | "야구" | "농구" | "배구")}
                disabled={!!selectedSport && tab.id !== "all" && tab.id !== selectedSport}
                className={`flex items-center justify-center gap-1 flex-1 min-w-0 px-2 py-2.5 text-[13px] font-semibold transition-all border-b-2 -mb-[1px] whitespace-nowrap ${
                  sportFilter === tab.id
                    ? "border-primary text-primary bg-rose-50 dark:bg-rose-950/30"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
                } ${selectedSport && tab.id !== "all" && tab.id !== selectedSport ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <span className="text-sm">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
          {selectedSport && (
            <p className="text-[10px] text-orange-500 px-3 py-1.5 bg-orange-50/50">
              * {selectedSport} 경기만 선택 가능
            </p>
          )}
        </>
      )}

      {activeTab === "ranking" && (
        <>
          {/* 종목 필터 */}
          <div className="flex overflow-x-auto scrollbar-none border-b border-border">
            {[
              { id: "전체", label: "전체", icon: "🎯" },
              { id: "축구", label: "축구", icon: "⚽" },
              { id: "야구", label: "야구", icon: "⚾" },
              { id: "농구", label: "농구", icon: "🏀" },
              { id: "배구", label: "배구", icon: "🏐" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setRankingSportFilter(tab.id)}
                className={`flex items-center justify-center gap-1 flex-1 min-w-0 px-2 py-2.5 text-[13px] font-semibold transition-all border-b-2 -mb-[1px] whitespace-nowrap ${
                  rankingSportFilter === tab.id
                    ? "border-primary text-primary bg-rose-50 dark:bg-rose-950/30"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                <span className="text-sm">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
          {/* 정렬 필터 */}
          <div className="flex border-b border-border">
            {[
              { id: "roi", label: "수익률", icon: TrendingUp },
              { id: "winRate", label: "적중률", icon: Target },
              { id: "profit", label: "수익금", icon: Coins },
            ].map((filter) => (
              <button
                key={filter.id}
                onClick={() => setRankingFilter(filter.id as "profit" | "winRate" | "roi")}
                className={`flex items-center justify-center gap-1.5 flex-1 px-3 py-2 text-[12px] font-semibold transition-all border-b-2 -mb-[1px] whitespace-nowrap ${
                  rankingFilter === filter.id
                    ? "border-primary text-primary bg-rose-50 dark:bg-rose-950/30"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                <filter.icon className="w-3.5 h-3.5 shrink-0" />
                {filter.label}
              </button>
            ))}
          </div>
        </>
      )}

      {activeTab === "mypage" && (
        <div className="flex border-b border-border">
          {[
            { id: "predictions", label: "예측 내역" },
            { id: "stats", label: "내 통계" },
            { id: "gold", label: "골드 내역" },
            { id: "profile", label: "개인정보" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setMyPageTab(tab.id as "predictions" | "stats" | "gold" | "profile")}
              className={`flex items-center justify-center flex-1 px-4 py-2.5 text-[13px] font-semibold transition-all border-b-2 -mb-[1px] ${
                myPageTab === tab.id
                  ? "border-primary text-primary bg-rose-50 dark:bg-rose-950/30"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

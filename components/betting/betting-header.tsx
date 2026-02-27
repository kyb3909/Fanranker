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
    <div className="bg-card border-border mb-3 overflow-hidden rounded-xl border sm:mb-4">
      {/* 1행: 오늘의 경기 | 랭킹 | 마이페이지 */}
      <div className="border-border flex border-b" role="tablist" aria-label="승부 예측">
        {[
          { id: "betting", label: "오늘의 경기" },
          { id: "ranking", label: "랭킹" },
          { id: "mypage", label: "마이페이지" },
        ].map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id as "betting" | "ranking" | "mypage")}
            className={`relative flex flex-1 items-center justify-center gap-2 px-4 py-3.5 text-[15px] font-semibold transition-colors ${
              activeTab === tab.id
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="bg-primary absolute bottom-0 left-1/2 h-[3px] w-12 -translate-x-1/2 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* 2행: 종목/필터 탭 */}
      {activeTab === "betting" && (
        <>
          <div className="scrollbar-none border-border flex overflow-x-auto border-b">
            {SPORT_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSportFilter(tab.id as "all" | "축구" | "야구" | "농구" | "배구")}
                disabled={!!selectedSport && tab.id !== "all" && tab.id !== selectedSport}
                className={`-mb-[1px] flex min-w-0 flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-3 text-[14px] font-semibold whitespace-nowrap transition-all ${
                  sportFilter === tab.id
                    ? "border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border-transparent"
                } ${selectedSport && tab.id !== "all" && tab.id !== selectedSport ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <span className="text-base">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
          {selectedSport && (
            <p className="bg-orange-50/50 px-3 py-2 text-[11px] text-orange-500">
              * {selectedSport} 경기만 선택 가능
            </p>
          )}
        </>
      )}

      {activeTab === "ranking" && (
        <>
          {/* 종목 필터 */}
          <div className="border-border flex border-b">
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
                className={`-mb-[1px] flex min-w-0 flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-3 text-[14px] font-semibold whitespace-nowrap transition-all ${
                  rankingSportFilter === tab.id
                    ? "border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border-transparent"
                }`}
              >
                <span className="text-base">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
          {/* 정렬 필터 */}
          <div className="flex justify-center gap-2 px-3 py-2.5">
            {[
              { id: "roi", label: "수익률", icon: TrendingUp },
              { id: "winRate", label: "적중률", icon: Target },
              { id: "profit", label: "수익금", icon: Coins },
            ].map((filter) => (
              <button
                key={filter.id}
                onClick={() => setRankingFilter(filter.id as "profit" | "winRate" | "roi")}
                className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold whitespace-nowrap transition-all ${
                  rankingFilter === filter.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
              >
                <filter.icon className="h-3.5 w-3.5 shrink-0" />
                {filter.label}
              </button>
            ))}
          </div>
        </>
      )}

      {activeTab === "mypage" && (
        <div className="border-border flex border-b">
          {[
            { id: "predictions", label: "예측 내역" },
            { id: "stats", label: "내 통계" },
            { id: "gold", label: "골드 내역" },
            { id: "profile", label: "개인정보" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setMyPageTab(tab.id as "predictions" | "stats" | "gold" | "profile")}
              className={`relative flex flex-1 items-center justify-center px-4 py-3 text-[14px] font-semibold transition-colors ${
                myPageTab === tab.id
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}
            >
              {tab.label}
              {myPageTab === tab.id && (
                <span className="bg-primary absolute bottom-0 left-1/2 h-[3px] w-12 -translate-x-1/2 rounded-full" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

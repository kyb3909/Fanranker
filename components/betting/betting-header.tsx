"use client"

import { TrendingUp, Target, Coins } from "lucide-react"
import { SPORT_TABS } from "@/types/betting"

interface BettingHeaderProps {
  activeTab: "betting" | "ranking" | "stats" | "mypage"
  setActiveTab: (tab: "betting" | "ranking" | "stats" | "mypage") => void
  // Betting tab filters
  sportFilter: "all" | "축구" | "야구" | "농구" | "배구"
  setSportFilter: (filter: "all" | "축구" | "야구" | "농구" | "배구") => void
  selectedSport: string | null
  // League filter
  leagueFilter: "all" | string
  setLeagueFilter: (filter: "all" | string) => void
  availableLeagues: string[]
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
  leagueFilter,
  setLeagueFilter,
  availableLeagues,
  rankingSportFilter,
  setRankingSportFilter,
  rankingFilter,
  setRankingFilter,
  myPageTab,
  setMyPageTab,
}: BettingHeaderProps) {
  const hasSubFilters = activeTab === "betting" || activeTab === "ranking" || activeTab === "mypage"

  return (
    <>
      {/* 1행: 메인 4탭 — wc-games-tabs (시안 .games-tabs) */}
      <div className="wc-games-tabs" role="tablist" aria-label="경기 예측">
        {[
          { id: "betting", label: "오늘의 경기" },
          { id: "ranking", label: "랭킹" },
          { id: "stats", label: "통계" },
          { id: "mypage", label: "마이페이지" },
        ].map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id as "betting" | "ranking" | "stats" | "mypage")}
            className={activeTab === tab.id ? "on" : ""}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 서브 필터 영역 — wc-underline-tabs (sub) + wc-lb-tabs (ranking sort pill) */}
      {hasSubFilters && (
        <div
          className="mb-3 overflow-hidden rounded-md sm:mb-4"
          style={{
            background: "var(--wc-card)",
            boxShadow: "var(--wc-shadow-1)",
          }}
        >
          {/* 베팅: 종목 row + (선택시) 리그 row */}
          {activeTab === "betting" && (
            <>
              <div className="wc-underline-tabs">
                {SPORT_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() =>
                      setSportFilter(tab.id as "all" | "축구" | "야구" | "농구" | "배구")
                    }
                    disabled={!!selectedSport && tab.id !== "all" && tab.id !== selectedSport}
                    className={sportFilter === tab.id ? "on" : ""}
                  >
                    <span className="text-base">{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>
              {sportFilter !== "all" && availableLeagues.length > 0 && (
                <div className="wc-underline-tabs scroll">
                  {[
                    { id: "all", label: "전체" },
                    ...availableLeagues.map((l) => ({ id: l, label: l })),
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setLeagueFilter(tab.id)}
                      className={leagueFilter === tab.id ? "on" : ""}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* 랭킹: 종목 row + 정렬 pill */}
          {activeTab === "ranking" && (
            <>
              <div className="wc-underline-tabs">
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
                    className={rankingSportFilter === tab.id ? "on" : ""}
                  >
                    <span className="text-base">{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>
              {/* 정렬 pill — wc-lb-tabs */}
              <div className="wc-lb-tabs justify-center px-3 py-2.5" style={{ marginBottom: 0 }}>
                {[
                  { id: "roi", label: "수익률", icon: TrendingUp },
                  { id: "winRate", label: "적중률", icon: Target },
                  { id: "profit", label: "수익금", icon: Coins },
                ].map((filter) => (
                  <button
                    key={filter.id}
                    onClick={() => setRankingFilter(filter.id as "profit" | "winRate" | "roi")}
                    className={`inline-flex items-center gap-1.5 ${rankingFilter === filter.id ? "on" : ""}`}
                  >
                    <filter.icon className="h-3.5 w-3.5 shrink-0" />
                    {filter.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* 마이페이지 sub */}
          {activeTab === "mypage" && (
            <div className="wc-underline-tabs">
              {[
                { id: "predictions", label: "예측 내역" },
                { id: "stats", label: "내 통계" },
                { id: "gold", label: "골드 내역" },
                { id: "profile", label: "개인정보" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() =>
                    setMyPageTab(tab.id as "predictions" | "stats" | "gold" | "profile")
                  }
                  className={myPageTab === tab.id ? "on" : ""}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

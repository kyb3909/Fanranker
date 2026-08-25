"use client"

import { TrendingUp, Target, Coins, LayoutGrid } from "lucide-react"
import { BoardIcon } from "@/components/sidebar/board-icon"
import { SPORT_TABS } from "@/types/betting"
import { leagueLabel } from "@/lib/match/leagues"

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

interface SportLeagueFilterProps {
  sportFilter: "all" | "축구" | "야구" | "농구" | "배구"
  setSportFilter: (filter: "all" | "축구" | "야구" | "농구" | "배구") => void
  selectedSport: string | null
  leagueFilter: "all" | string
  setLeagueFilter: (filter: "all" | string) => void
  availableLeagues: string[]
}

/** 베팅 탭 종목/리그 필터 rows — BettingHeader 내부 + bettingOnly 임베드(홈 담벼락)에서 공용 */
export function SportLeagueFilter({
  sportFilter,
  setSportFilter,
  selectedSport,
  leagueFilter,
  setLeagueFilter,
  availableLeagues,
}: SportLeagueFilterProps) {
  return (
    <>
      {/* 종목 = 4탭 아래 종속 필터 → 칩 한 줄 (담벼락 정렬 칩과 같은 문법).
          단일 종목 운영 중(축구만, 2026-08-14)에는 고를 게 없으므로 줄 자체를 감춘다 —
          "축구" 칩 하나만 덩그러니 켜져 있는 건 필터가 아니라 노이즈다. */}
      {SPORT_TABS.length > 1 && (
        <div className="wc-chip-tabs" role="group" aria-label="종목 필터">
          {SPORT_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSportFilter(tab.id as "all" | "축구" | "야구" | "농구" | "배구")}
              disabled={!!selectedSport && tab.id !== "all" && tab.id !== selectedSport}
              className={sportFilter === tab.id ? "on" : ""}
            >
              {tab.id === "all" ? (
                <LayoutGrid className="h-4 w-4" />
              ) : (
                <BoardIcon slug={tab.id} className="h-4 w-4" />
              )}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      )}
      {sportFilter !== "all" && availableLeagues.length > 0 && (
        <div className="wc-chip-tabs sub" role="group" aria-label="리그 필터">
          {[
            { id: "all", label: "전체" },
            /* ⚠️ id 는 betman 코드 그대로(필터 키), **label 만** 지면 표기로 바꾼다
               (2026-08-25). 종전엔 코드를 그대로 찍어서 "잉리그컵"·"프리그1"·"분데스리"
               같은 내부 약어가 유저에게 노출됐다. `leagueLabel()` 이 이미 있는데
               이 지면만 안 쓰고 있었다 — 한 줄로 전 리그가 같이 고쳐진다. */
            ...availableLeagues.map((l) => ({ id: l, label: leagueLabel(l) })),
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
  )
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
  // 베팅 종목 필터는 카드 밖 칩 한 줄로 강등 — 4탭(페이지 전환)과 같은 무게의 흰 카드가
  // 두 장 쌓여 뭐가 상위인지 안 보였다. 카드 래핑은 랭킹/마이페이지 서브필터에만 남긴다.
  const hasSubFilters = activeTab === "ranking" || activeTab === "mypage"

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

      {/* 베팅 종목/리그 — 카드 없이 칩 한 줄 (4탭 아래 종속 필터임을 무게로 표시) */}
      {activeTab === "betting" && (
        <SportLeagueFilter
          sportFilter={sportFilter}
          setSportFilter={setSportFilter}
          selectedSport={selectedSport}
          leagueFilter={leagueFilter}
          setLeagueFilter={setLeagueFilter}
          availableLeagues={availableLeagues}
        />
      )}

      {/* 서브 필터 영역 — wc-underline-tabs (sub) + wc-lb-tabs (ranking sort pill) */}
      {hasSubFilters && (
        <div
          className="mb-3 overflow-hidden rounded-md sm:mb-4"
          style={{
            background: "var(--wc-card)",
            boxShadow: "var(--wc-shadow-1)",
          }}
        >
          {/* 랭킹: 종목 row + 정렬 pill */}
          {activeTab === "ranking" && (
            <>
              {/* 랭킹 종목 탭 — 경기 목록이 축구 전용인데 여기만 4종목이면 화면이 어긋난다.
                  SPORT_TABS 를 따라간다 ("전체"는 종목이 하나면 축구와 같은 뜻이라 제외). */}
              <div className="wc-underline-tabs">
                {[
                  ...(SPORT_TABS.length > 1 ? [{ id: "전체", label: "전체", icon: "🎯" }] : []),
                  ...SPORT_TABS.filter((t) => t.id !== "all"),
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setRankingSportFilter(tab.id)}
                    className={rankingSportFilter === tab.id ? "on" : ""}
                  >
                    {tab.id === "전체" ? (
                      <LayoutGrid className="h-4 w-4" />
                    ) : (
                      <BoardIcon slug={tab.id} className="h-4 w-4" />
                    )}
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>
              {/* 정렬 pill — wc-lb-tabs */}
              <div className="wc-lb-tabs justify-center px-3 py-2.5" style={{ marginBottom: 0 }}>
                {[
                  { id: "roi", label: "수익률", icon: TrendingUp },
                  { id: "winRate", label: "적중률", icon: Target },
                  { id: "profit", label: "순수익", icon: Coins },
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
                // 골드 내역 탭 잠시 숨김 (launch): { id: "gold", label: "골드 내역" },
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

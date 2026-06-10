"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { useBettingMatches } from "@/hooks/use-betting-matches"
import { useBettingSlip } from "@/hooks/use-betting-slip"
import { useBettingRankings } from "@/hooks/use-betting-rankings"
import { useBettingMyPage } from "@/hooks/use-betting-mypage"
import { useBettingCommunityStats } from "@/hooks/use-betting-community-stats"
import { BettingHeader } from "./betting-header"
import { BettingTab } from "./betting-tab"
import { RankingTab } from "./ranking-tab"
import { StatsTab } from "./stats-tab"
import { MypageTab } from "./mypage-tab"
import { BettingSlip } from "./betting-slip"
import { BettingAlertDialog } from "./betting-alert-dialog"

const VALID_TABS = new Set(["betting", "ranking", "stats", "mypage"] as const)
type BettingTabType = "betting" | "ranking" | "stats" | "mypage"

interface BettingPageProps {
  /** 이벤트 슬립으로 들어갈 때 (예: 월드컵). 슬립 INSERT 시 event_slug 첨부됨. */
  eventSlug?: string
  /** 이벤트 모드 시 노출할 league_code 화이트리스트 (필터). 비우면 전체 노출. */
  leagueCodes?: string[]
  /** 이벤트 모드 시 베팅 탭만 노출 (랭킹/통계/마이페이지 숨김). */
  bettingOnly?: boolean
}

export default function BettingPage({
  eventSlug,
  leagueCodes,
  bettingOnly,
}: BettingPageProps = {}) {
  const searchParams = useSearchParams()
  const initialTab = searchParams.get("tab")
  const [activeTab, setActiveTab] = useState<BettingTabType>(
    initialTab && VALID_TABS.has(initialTab as BettingTabType)
      ? (initialTab as BettingTabType)
      : "betting"
  )
  const [myPageTab, setMyPageTab] = useState<"predictions" | "stats" | "gold" | "profile">(
    "predictions"
  )

  const matches = useBettingMatches(eventSlug)
  const slip = useBettingSlip(matches.groupedMatches, matches.loadMatches, { eventSlug })

  // 이벤트 모드: league_code 화이트리스트 필터 (UI 단계, 서버에서도 검증)
  const effectiveFilteredMatches =
    leagueCodes && leagueCodes.length > 0
      ? matches.filteredMatches.filter((m) => leagueCodes.includes(m.leagueCode))
      : matches.filteredMatches
  const rankings = useBettingRankings(activeTab === "ranking")
  const communityStats = useBettingCommunityStats(activeTab === "stats")
  const myPage = useBettingMyPage(activeTab === "mypage", myPageTab)

  return (
    <div className="w-full">
      {!bettingOnly && (
        <BettingHeader
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          sportFilter={matches.sportFilter}
          setSportFilter={matches.setSportFilter}
          selectedSport={slip.selectedSport}
          leagueFilter={matches.leagueFilter}
          setLeagueFilter={matches.setLeagueFilter}
          availableLeagues={matches.availableLeagues}
          rankingSportFilter={rankings.rankingSportFilter}
          setRankingSportFilter={rankings.setRankingSportFilter}
          rankingFilter={rankings.rankingFilter}
          setRankingFilter={rankings.setRankingFilter}
          myPageTab={myPageTab}
          setMyPageTab={setMyPageTab}
        />
      )}

      <div className="space-y-2 sm:space-y-4">
        {(activeTab === "betting" || bettingOnly) && (
          <BettingTab
            lastUpdated={matches.lastUpdated}
            isLoading={matches.isLoading}
            error={matches.error}
            filteredMatches={effectiveFilteredMatches}
            selectedBets={slip.selectedBets}
            selectedSport={slip.selectedSport}
            onBetSelection={slip.handleBetSelection}
            onRefresh={matches.loadMatches}
          />
        )}

        {!bettingOnly && activeTab === "ranking" && (
          <RankingTab
            rankings={rankings.rankings}
            myRank={rankings.myRank}
            isLoading={rankings.isLoadingRankings}
            followedUsers={rankings.followedUsers}
            followLoading={rankings.followLoading}
            onFollow={rankings.handleFollow}
          />
        )}

        {!bettingOnly && activeTab === "stats" && (
          <StatsTab stats={communityStats.stats} isLoading={communityStats.isLoading} />
        )}

        {!bettingOnly && activeTab === "mypage" && (
          <MypageTab
            myPageTab={myPageTab}
            predictionHistory={myPage.predictionHistory}
            isLoadingHistory={myPage.isLoadingHistory}
            myStats={myPage.myStats}
            isLoadingMyStats={myPage.isLoadingMyStats}
          />
        )}
      </div>

      {(activeTab === "betting" || bettingOnly) && (
        <BettingSlip
          selectedBets={slip.selectedBets}
          groupedMatches={matches.groupedMatches}
          isSlipExpanded={slip.isSlipExpanded}
          setIsSlipExpanded={slip.setIsSlipExpanded}
          betAmount={slip.betAmount}
          setBetAmount={slip.setBetAmount}
          userBalls={slip.userBalls}
          totalOdds={slip.totalOdds}
          expectedReturn={slip.expectedReturn}
          isSubmitting={slip.isSubmittingPrediction}
          onRemoveBet={slip.removeBet}
          onClearAllBets={slip.clearAllBets}
          onSubmit={slip.handleSubmitPrediction}
          isJournalist={slip.isJournalist}
          analysisTitle={slip.analysisTitle}
          setAnalysisTitle={slip.setAnalysisTitle}
          analysisText={slip.analysisText}
          setAnalysisText={slip.setAnalysisText}
        />
      )}

      <BettingAlertDialog alertModal={slip.alertModal} onClose={slip.closeAlert} />
    </div>
  )
}

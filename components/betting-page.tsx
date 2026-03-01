"use client"

import { useBetting } from "@/hooks/use-betting"
import { BettingHeader } from "./betting/betting-header"
import { BettingTab } from "./betting/betting-tab"
import { RankingTab } from "./betting/ranking-tab"
import { MypageTab } from "./betting/mypage-tab"
import { BettingSlip } from "./betting/betting-slip"
import { BettingAlertDialog } from "./betting/betting-alert-dialog"

export default function BettingPage() {
  const b = useBetting()

  return (
    <div className="w-full">
      <BettingHeader
        activeTab={b.activeTab}
        setActiveTab={b.setActiveTab}
        sportFilter={b.sportFilter}
        setSportFilter={b.setSportFilter}
        selectedSport={b.selectedSport}
        leagueFilter={b.leagueFilter}
        setLeagueFilter={b.setLeagueFilter}
        availableLeagues={b.availableLeagues}
        rankingSportFilter={b.rankingSportFilter}
        setRankingSportFilter={b.setRankingSportFilter}
        rankingFilter={b.rankingFilter}
        setRankingFilter={b.setRankingFilter}
        myPageTab={b.myPageTab}
        setMyPageTab={b.setMyPageTab}
      />

      <div className="space-y-2 sm:space-y-4">
        {b.activeTab === "betting" && (
          <BettingTab
            lastUpdated={b.lastUpdated}
            isLoading={b.isLoading}
            error={b.error}
            filteredMatches={b.filteredMatches}
            selectedBets={b.selectedBets}
            selectedSport={b.selectedSport}
            onBetSelection={b.handleBetSelection}
            onRefresh={b.loadMatches}
          />
        )}

        {b.activeTab === "ranking" && (
          <RankingTab
            rankings={b.rankings}
            myRank={b.myRank}
            isLoading={b.isLoadingRankings}
            followedUsers={b.followedUsers}
            followLoading={b.followLoading}
            onFollow={b.handleFollow}
          />
        )}

        {b.activeTab === "mypage" && (
          <MypageTab
            myPageTab={b.myPageTab}
            predictionHistory={b.predictionHistory}
            isLoadingHistory={b.isLoadingHistory}
            myStats={b.myStats}
            isLoadingMyStats={b.isLoadingMyStats}
          />
        )}
      </div>

      {b.activeTab === "betting" && (
        <BettingSlip
          selectedBets={b.selectedBets}
          groupedMatches={b.groupedMatches}
          isSlipExpanded={b.isSlipExpanded}
          setIsSlipExpanded={b.setIsSlipExpanded}
          betAmount={b.betAmount}
          setBetAmount={b.setBetAmount}
          userBalls={b.userBalls}
          totalOdds={b.totalOdds}
          expectedReturn={b.expectedReturn}
          isSubmitting={b.isSubmittingPrediction}
          onRemoveBet={b.removeBet}
          onClearAllBets={b.clearAllBets}
          onSubmit={b.handleSubmitPrediction}
          isJournalist={b.isJournalist}
          analysisTitle={b.analysisTitle}
          setAnalysisTitle={b.setAnalysisTitle}
          analysisText={b.analysisText}
          setAnalysisText={b.setAnalysisText}
        />
      )}

      <BettingAlertDialog alertModal={b.alertModal} onClose={b.closeAlert} />
    </div>
  )
}

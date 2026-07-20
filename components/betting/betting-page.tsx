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
import { WorldcupRulesCard } from "@/components/worldcup/worldcup-rules-card"
import { BettingAlertDialog } from "./betting-alert-dialog"
import { PredictionSuccessDialog } from "./prediction-success-dialog"

const VALID_TABS = new Set(["betting", "ranking", "stats", "mypage"] as const)
type BettingTabType = "betting" | "ranking" | "stats" | "mypage"

interface BettingPageProps {
  /** 이벤트 슬립으로 들어갈 때 (예: 월드컵). 슬립 INSERT 시 event_slug 첨부됨. */
  eventSlug?: string
  /** 이벤트 모드 시 노출할 league_code 화이트리스트 (필터). 비우면 전체 노출. */
  leagueCodes?: string[]
  /** 이벤트 모드 시 베팅 탭만 노출 (랭킹/통계/마이페이지 숨김). */
  bettingOnly?: boolean
  /** 좌측 sticky 레일 모드 — desktop(lg+)에서 슬립을 레일로, 모바일은 기존 하단 슬립 유지. */
  railMode?: boolean
}

export default function BettingPage({
  eventSlug,
  leagueCodes,
  bettingOnly,
  railMode,
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

  const bettingHeader = !bettingOnly ? (
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
  ) : null

  const tabsContent = (
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
        <>
          {/* 월드컵 결산 보드 — 다음 대회에서 보강 후 재노출 예정 (베팅 색채 정리 중)
              <WorldcupRecapBoard /> */}
          <StatsTab stats={communityStats.stats} isLoading={communityStats.isLoading} />
        </>
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
  )

  const slipProps = {
    selectedBets: slip.selectedBets,
    groupedMatches: matches.groupedMatches,
    isSlipExpanded: slip.isSlipExpanded,
    setIsSlipExpanded: slip.setIsSlipExpanded,
    betAmount: slip.betAmount,
    setBetAmount: slip.setBetAmount,
    userBalls: slip.userBalls,
    totalOdds: slip.totalOdds,
    expectedReturn: slip.expectedReturn,
    isSubmitting: slip.isSubmittingPrediction,
    onRemoveBet: slip.removeBet,
    onClearAllBets: slip.clearAllBets,
    onSubmit: slip.handleSubmitPrediction,
    isJournalist: slip.isJournalist,
    analysisTitle: slip.analysisTitle,
    setAnalysisTitle: slip.setAnalysisTitle,
    analysisText: slip.analysisText,
    setAnalysisText: slip.setAnalysisText,
  }

  return (
    <div className="w-full">
      {railMode ? (
        <>
          {/* Desktop(lg+): 좌측 slip 레일 + 우측 베팅 컨텐츠 */}
          <div className="lg:grid lg:grid-cols-12 lg:gap-6">
            <div className="hidden lg:col-span-4 lg:block">
              <div className="sticky" style={{ top: 76 }}>
                <BettingSlip variant="rail" {...slipProps} />
                {eventSlug && <WorldcupRulesCard />}
              </div>
            </div>
            <div className="col-span-12 lg:col-span-8">
              {bettingHeader}
              {tabsContent}
            </div>
          </div>
          {/* 모바일: 기존 하단 sticky 슬립 */}
          {(activeTab === "betting" || bettingOnly) && (
            <div className="lg:hidden">
              <BettingSlip {...slipProps} />
              {eventSlug && <WorldcupRulesCard />}
            </div>
          )}
        </>
      ) : (
        <>
          {bettingHeader}
          {tabsContent}
          {(activeTab === "betting" || bettingOnly) && <BettingSlip {...slipProps} />}
        </>
      )}

      <BettingAlertDialog alertModal={slip.alertModal} onClose={slip.closeAlert} />
      <PredictionSuccessDialog state={slip.successModal} onClose={slip.closeSuccessModal} />
    </div>
  )
}

"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useState, useEffect, useCallback, useMemo } from "react"
import { useAuth } from "@clerk/nextjs"
import {
  Loader2,
  RefreshCw,
  Calendar,
  Clock,
  User,
} from "lucide-react"
import { getMsUntilReset } from '@/lib/betman/daily-round'

// Sub-components
import { BettingHeader } from "./betting/betting-header"
import { BettingMatchCard } from "./betting/betting-match-card"
import { BettingRankings } from "./betting/betting-rankings"
import { BettingMyStats } from "./betting/betting-my-stats"
import { BettingPredictionHistory } from "./betting/betting-prediction-history"
import { BettingSlip } from "./betting/betting-slip"
import { BettingAlertDialog } from "./betting/betting-alert-dialog"

// Types
import type {
  TodayInfo,
  DailyRoundInfo,
  BettingWindowInfo,
  GroupedMatch,
  WindowInfo,
  SelectedBet,
  AlertModalState,
  RankingUser,
  MyRank,
  MyStatsData,
  PredictionHistoryItem,
} from "./betting/betting-types"

export default function BettingPage() {
  const { isSignedIn } = useAuth()
  const [activeTab, setActiveTab] = useState<"betting" | "ranking" | "mypage">("betting")
  const [sportFilter, setSportFilter] = useState<"all" | "축구" | "야구" | "농구" | "배구">("all")
  const [selectedBets, setSelectedBets] = useState<SelectedBet[]>([])
  const [isSlipExpanded, setIsSlipExpanded] = useState(false)
  const [betAmount, setBetAmount] = useState<number>(1)
  const [userBalls, setUserBalls] = useState<number>(10)
  const [followedUsers, setFollowedUsers] = useState<Set<string>>(new Set())
  const [followLoading, setFollowLoading] = useState<Set<string>>(new Set())
  const [rankingFilter, setRankingFilter] = useState<"profit" | "winRate" | "roi">("profit")
  const [myPageTab, setMyPageTab] = useState<"predictions" | "stats" | "gold" | "profile">("predictions")

  // Betman API data state
  const [todayInfo, setTodayInfo] = useState<TodayInfo | null>(null)
  const [, setDailyRound] = useState<DailyRoundInfo | null>(null)
  const [, setBettingWindow] = useState<BettingWindowInfo | null>(null)
  const [groupedMatches, setGroupedMatches] = useState<GroupedMatch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [deadlineCountdown, setDeadlineCountdown] = useState<string | null>(null)
  const [earliestBetClose, setEarliestBetClose] = useState<string | null>(null)
  const [, setWindowInfo] = useState<WindowInfo | null>(null)

  const [selectedSport, setSelectedSport] = useState<string | null>(null)

  // Rankings state
  const [rankings, setRankings] = useState<RankingUser[]>([])
  const [isLoadingRankings, setIsLoadingRankings] = useState(false)
  const [rankingSportFilter, setRankingSportFilter] = useState<string>("전체")
  const [myRank, setMyRank] = useState<MyRank | null>(null)

  // My stats state
  const [myStats, setMyStats] = useState<MyStatsData | null>(null)
  const [isLoadingMyStats, setIsLoadingMyStats] = useState(false)

  // Prediction history state
  const [predictionHistory, setPredictionHistory] = useState<PredictionHistoryItem[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // Submit state
  const [isSubmittingPrediction, setIsSubmittingPrediction] = useState(false)

  // Current time (refreshed every 30s for auto-filtering started matches)
  const [currentTime, setCurrentTime] = useState(() => new Date())

  // Alert modal state
  const [alertModal, setAlertModal] = useState<AlertModalState>({
    isOpen: false,
    type: 'error',
    title: '',
    message: '',
  })

  // ============================================================
  // Data Loading Functions
  // ============================================================

  const loadMatches = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const sportParam = sportFilter !== 'all' ? `&sport=${sportFilter}` : ''
      const res = await fetch(`/api/betman/games?${sportParam}`)
      const data = await res.json()

      if (data.today) setTodayInfo(data.today)
      if (data.dailyRound) setDailyRound(data.dailyRound)
      if (data.bettingWindow) setBettingWindow(data.bettingWindow)
      if (data.groupedGames) setGroupedMatches(data.groupedGames)
      if (data.window) setWindowInfo(data.window)
      setEarliestBetClose(data.earliestBetClose || null)
      setLastUpdated(new Date())
    } catch {
      setError("경기 데이터를 불러오는데 실패했습니다.")
    } finally {
      setIsLoading(false)
    }
  }, [sportFilter])

  const loadUserBalls = useCallback(async () => {
    if (!isSignedIn) return
    try {
      const res = await fetch('/api/tokens/balance')
      if (res.ok) {
        const data = await res.json()
        setUserBalls(data.balance || 10)
      }
    } catch { /* Silent fail */ }
  }, [isSignedIn])

  const loadFollows = useCallback(async () => {
    if (!isSignedIn) return
    try {
      const res = await fetch('/api/follow')
      if (res.ok) {
        const data = await res.json()
        setFollowedUsers(new Set(data.following || []))
      }
    } catch { /* Silent fail */ }
  }, [isSignedIn])

  const loadMyStats = useCallback(async () => {
    if (!isSignedIn) return
    setIsLoadingMyStats(true)
    try {
      const res = await fetch('/api/betman/my-stats')
      if (res.ok) {
        const data = await res.json()
        setMyStats(data)
      }
    } catch { /* Silent fail */ }
    finally { setIsLoadingMyStats(false) }
  }, [isSignedIn])

  const loadRankings = useCallback(async () => {
    setIsLoadingRankings(true)
    try {
      const sortMap: Record<string, string> = {
        profit: 'net_profit',
        winRate: 'accuracy',
        roi: 'profit_rate',
      }
      const sortParam = sortMap[rankingFilter] || 'profit_rate'
      const response = await fetch(
        `/api/betman/rankings?sport=${encodeURIComponent(rankingSportFilter)}&sort=${sortParam}&limit=50`
      )
      if (!response.ok) {
        setRankings([])
        setMyRank(null)
        return
      }
      const data = await response.json()
      setRankings(data?.rankings || [])
      setMyRank(data?.my_rank || null)
    } catch {
      setRankings([])
      setMyRank(null)
    } finally {
      setIsLoadingRankings(false)
    }
  }, [rankingFilter, rankingSportFilter])

  const loadPredictionHistory = useCallback(async () => {
    if (!isSignedIn) return
    setIsLoadingHistory(true)
    try {
      const response = await fetch('/api/betman/prediction?status=all')
      if (!response.ok) throw new Error('Failed to load prediction history')
      const predictions = await response.json()

      interface PredictionMatch {
        match_time?: string
        sport_type?: string
        league?: { name_ko?: string; name?: string }
        home_team?: { name_ko?: string; name?: string }
        away_team?: { name_ko?: string; name?: string }
      }
      const transformed = predictions.map((pred: {
        id: string
        matches?: PredictionMatch | PredictionMatch[]
        is_correct: boolean | null
        predicted_value: string
        odds_at_prediction: number | null
        points_earned: number | null
      }) => {
        const match = Array.isArray(pred.matches) ? pred.matches[0] : pred.matches
        const matchTime = match?.match_time ? new Date(match.match_time) : new Date()
        const dateStr = `${String(matchTime.getMonth() + 1).padStart(2, '0')}/${String(matchTime.getDate()).padStart(2, '0')} ${String(matchTime.getHours()).padStart(2, '0')}:${String(matchTime.getMinutes()).padStart(2, '0')}`

        const sportTypeMap: Record<string, string> = {
          football: '축구', soccer: '축구', baseball: '야구', basketball: '농구', volleyball: '배구',
        }
        const sportName = sportTypeMap[match?.sport_type || 'soccer'] || '축구'

        let status = 'pending'
        if (pred.is_correct === true) status = 'win'
        else if (pred.is_correct === false) status = 'lose'

        const selectionMap: Record<string, string> = {
          home: '홈팀', away: '원정팀', draw: '무',
        }

        return {
          id: pred.id,
          date: dateStr,
          sport: sportName,
          matches: [{
            league: match?.league?.name_ko || match?.league?.name || '기타',
            home: match?.home_team?.name_ko || match?.home_team?.name || '홈팀',
            away: match?.away_team?.name_ko || match?.away_team?.name || '원정팀',
            selection: selectionMap[pred.predicted_value] || pred.predicted_value,
            odds: pred.odds_at_prediction || 0,
            result: status,
          }],
          totalOdds: pred.odds_at_prediction || 0,
          stake: 100,
          status,
          profit: pred.points_earned || (status === 'pending' ? 0 : status === 'win' ? 100 * (pred.odds_at_prediction || 1) : -100),
        }
      })

      setPredictionHistory(transformed)
    } catch { /* Silent fail */ }
    finally { setIsLoadingHistory(false) }
  }, [isSignedIn])

  // ============================================================
  // Effects
  // ============================================================

  useEffect(() => {
    loadMatches()
    loadUserBalls()
    loadFollows()
  }, [loadMatches, loadUserBalls, loadFollows])

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => { loadMatches() }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [loadMatches])

  // Refresh currentTime every 30s
  useEffect(() => {
    const timer = setInterval(() => { setCurrentTime(new Date()) }, 30000)
    return () => clearInterval(timer)
  }, [])

  // Deadline countdown timer
  useEffect(() => {
    if (!earliestBetClose) { setDeadlineCountdown(null); return }
    const updateCountdown = () => {
      const now = new Date()
      const close = new Date(earliestBetClose)
      const diff = close.getTime() - now.getTime()
      if (diff <= 0) { setDeadlineCountdown('마감됨'); return }
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)
      if (hours > 0) setDeadlineCountdown(`${hours}시간 ${minutes}분`)
      else if (minutes > 0) setDeadlineCountdown(`${minutes}분 ${seconds}초`)
      else setDeadlineCountdown(`${seconds}초`)
    }
    updateCountdown()
    const timer = setInterval(updateCountdown, 1000)
    return () => clearInterval(timer)
  }, [earliestBetClose])

  // 23:00 KST daily round reset
  useEffect(() => {
    const scheduleReset = () => {
      const ms = getMsUntilReset()
      return setTimeout(() => {
        setSelectedBets([])
        setSelectedSport(null)
        loadMatches()
        loadUserBalls()
        window.dispatchEvent(new CustomEvent('dailyRoundReset'))
        showAlert('success', '일일 리셋', '23:00 새로운 라운드가 시작되었습니다.\n볼이 충전되었습니다.')
      }, ms)
    }
    const timerId = scheduleReset()
    return () => clearTimeout(timerId)
  }, [loadMatches, loadUserBalls]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tab visibility refresh
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') { loadMatches(); loadUserBalls() }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [loadMatches, loadUserBalls])

  // Load rankings when ranking tab is active
  useEffect(() => {
    if (activeTab === 'ranking') loadRankings()
  }, [activeTab, rankingFilter, rankingSportFilter, loadRankings])

  // Load prediction history when mypage predictions tab is active
  useEffect(() => {
    if (activeTab === 'mypage' && myPageTab === 'predictions') loadPredictionHistory()
  }, [activeTab, myPageTab, loadPredictionHistory])

  // Load my stats when mypage stats tab is active
  useEffect(() => {
    if (activeTab === 'mypage' && myPageTab === 'stats') loadMyStats()
  }, [activeTab, myPageTab, loadMyStats])

  // ============================================================
  // Handlers
  // ============================================================

  const showAlert = (type: 'error' | 'warning' | 'success', title: string, message: string) => {
    setAlertModal({ isOpen: true, type, title, message })
  }

  const handleSubmitPrediction = async () => {
    if (selectedBets.length === 0) { showAlert('warning', '경기를 선택해주세요', '예측할 경기를 먼저 선택해주세요.'); return }
    if (betAmount <= 0) { showAlert('warning', '베팅 금액 확인', '베팅할 볼 수를 입력해주세요.'); return }
    if (betAmount > userBalls) { showAlert('warning', '볼 부족', `보유 볼이 부족합니다.\n현재 보유: ${userBalls}볼`); return }

    setIsSubmittingPrediction(true)
    try {
      const predictionsArray = selectedBets.map(bet => ({ game_id: bet.gameId, prediction: bet.selection }))
      const res = await fetch('/api/betman/prediction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ predictions: predictionsArray, betAmount }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '예측 저장에 실패했습니다.')

      showAlert('success', '예측 완료!', data.message || `${selectedBets.length}경기 예측이 성공적으로 등록되었습니다.`)
      setSelectedBets([])
      setIsSlipExpanded(false)
      setSelectedSport(null)
      setBetAmount(1)
      loadMatches()
      loadUserBalls()
      window.dispatchEvent(new CustomEvent('ballBalanceUpdate'))
    } catch (error) {
      showAlert('error', '예측 실패', error instanceof Error ? error.message : '예측 저장 중 오류가 발생했습니다.')
    } finally {
      setIsSubmittingPrediction(false)
    }
  }

  const handleBetSelection = (
    gameId: string, matchKey: string, selection: string, sport: string,
    gameType: string, handicap: number | null, overUnderLine: number | null, odds?: number
  ) => {
    const match = groupedMatches.find(m => m.matchKey === matchKey)
    if (match) {
      const matchTime = new Date(match.matchTime)
      const now = new Date()
      if (matchTime <= now) { showAlert('warning', '이미 시작된 경기입니다', '이미 시작된 경기에는 예측할 수 없습니다.'); return }
      const game = match.games.find(g => g.id === gameId)
      if (game?.bet_close_at && new Date(game.bet_close_at) <= now) { showAlert('warning', '이미 시작된 경기입니다', '베팅 마감 시간이 지났습니다.'); return }
    }

    const existingMatchBet = selectedBets.find((b) => b.matchKey === matchKey)
    const existingGameBet = selectedBets.find((b) => b.gameId === gameId)

    if (existingGameBet) {
      if (existingGameBet.selection === selection) {
        const newBets = selectedBets.filter((b) => b.gameId !== gameId)
        setSelectedBets(newBets)
        if (newBets.length === 0) setSelectedSport(null)
      } else {
        setSelectedBets(selectedBets.map((b) => b.gameId === gameId ? { ...b, selection, odds } : b))
      }
    } else if (existingMatchBet) {
      const newBets = selectedBets.filter((b) => b.matchKey !== matchKey)
      newBets.push({ gameId, matchKey, selection, sport, gameType, handicap, overUnderLine, odds })
      setSelectedBets(newBets)
    } else {
      if (selectedBets.length === 0) {
        setSelectedSport(sport)
        setSelectedBets([{ gameId, matchKey, selection, sport, gameType, handicap, overUnderLine, odds }])
      } else {
        if (sport !== selectedSport) {
          showAlert('warning', '종목 조합 불가', `다른 종목은 조합할 수 없습니다.\n이미 "${selectedSport}" 종목이 선택되었습니다.`)
          return
        }
        setSelectedBets([...selectedBets, { gameId, matchKey, selection, sport, gameType, handicap, overUnderLine, odds }])
      }
    }
  }

  const removeBet = (gameId: string) => {
    const newBets = selectedBets.filter((b) => b.gameId !== gameId)
    setSelectedBets(newBets)
    if (newBets.length === 0) setSelectedSport(null)
  }

  const clearAllBets = () => { setSelectedBets([]); setSelectedSport(null) }

  const handleFollow = async (userId: string) => {
    setFollowLoading(prev => new Set(prev).add(userId))
    try {
      const res = await fetch('/api/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
      if (res.ok) {
        const data = await res.json()
        setFollowedUsers(prev => {
          const newSet = new Set(prev)
          if (data.action === 'followed') newSet.add(userId)
          else newSet.delete(userId)
          return newSet
        })
      }
    } catch { /* Silent fail */ }
    finally {
      setFollowLoading(prev => { const newSet = new Set(prev); newSet.delete(userId); return newSet })
    }
  }

  // ============================================================
  // Computed Values
  // ============================================================

  const totalOdds = selectedBets.reduce((acc, bet) => acc * (bet.odds || 1), 1)
  const expectedReturn = Math.floor(betAmount * totalOdds)

  const filteredMatches = useMemo(() => {
    return groupedMatches
      .filter((m) => new Date(m.matchTime) > currentTime)
      .filter((m) => sportFilter === "all" || m.sport === sportFilter)
  }, [groupedMatches, sportFilter, currentTime])

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="w-full">
      {/* Navigation Header */}
      <BettingHeader
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        sportFilter={sportFilter}
        setSportFilter={setSportFilter}
        selectedSport={selectedSport}
        rankingSportFilter={rankingSportFilter}
        setRankingSportFilter={setRankingSportFilter}
        rankingFilter={rankingFilter}
        setRankingFilter={setRankingFilter}
        myPageTab={myPageTab}
        setMyPageTab={setMyPageTab}
      />

      {/* Main Content */}
      <div className="space-y-2 sm:space-y-4">
        {/* Betting Tab */}
        {activeTab === "betting" && (
          <div className="space-y-2">
            {/* Today's matches header + deadline countdown */}
            <Card className="bg-accent/5 border border-accent/30 py-1.5 px-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-full bg-accent/10 shrink-0">
                    <Calendar className="h-3.5 w-3.5 text-accent" />
                  </div>
                  <span className="font-semibold text-[13px] text-accent">오늘의 경기</span>
                  {todayInfo && (
                    <span className="text-[11px] text-muted-foreground">({todayInfo.label})</span>
                  )}
                </div>
                {deadlineCountdown && deadlineCountdown !== '마감됨' && (
                  <div className="flex items-center gap-1 text-[11px] text-orange-600 font-medium">
                    <Clock className="h-3 w-3" />
                    <span>다음 마감 {deadlineCountdown}</span>
                  </div>
                )}
                {deadlineCountdown === '마감됨' && (
                  <span className="text-[11px] text-red-500 font-medium">베팅 마감</span>
                )}
              </div>
            </Card>

            {/* Loading/Error/Refresh status */}
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
              <div className="flex items-center gap-2">
                {lastUpdated && (
                  <span>마지막 업데이트: {lastUpdated.toLocaleTimeString("ko-KR")}</span>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={loadMatches} disabled={isLoading} className="h-7 px-2">
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isLoading ? "animate-spin" : ""}`} />
                새로고침
              </Button>
            </div>

            {/* Loading state */}
            {isLoading && groupedMatches.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin mb-2" />
                <p>경기 정보를 불러오는 중...</p>
              </div>
            )}

            {/* Error state */}
            {error && (
              <div className="flex flex-col items-center justify-center py-8 text-destructive">
                <p>{error}</p>
                <Button variant="outline" size="sm" onClick={loadMatches} className="mt-2">다시 시도</Button>
              </div>
            )}

            {/* Empty state */}
            {!isLoading && !error && filteredMatches.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <p>베팅 가능한 경기가 없습니다.</p>
              </div>
            )}

            {/* Match cards */}
            {filteredMatches.map((groupedMatch) => (
              <BettingMatchCard
                key={groupedMatch.matchKey}
                groupedMatch={groupedMatch}
                selectedBets={selectedBets}
                selectedSport={selectedSport}
                onBetSelection={handleBetSelection}
              />
            ))}
          </div>
        )}

        {/* Ranking Tab */}
        {activeTab === "ranking" && (
          <BettingRankings
            rankings={rankings}
            myRank={myRank}
            isLoading={isLoadingRankings}
            followedUsers={followedUsers}
            followLoading={followLoading}
            onFollow={handleFollow}
          />
        )}

        {/* My Page Tab - Not signed in */}
        {activeTab === "mypage" && !isSignedIn && (
          <div className="p-8 text-center">
            <p className="text-sm text-muted-foreground mb-3">로그인이 필요한 기능입니다.</p>
            <Button variant="default" size="sm" onClick={() => window.location.href = '/sign-up'}>로그인하기</Button>
          </div>
        )}

        {/* My Page Tab - Signed in */}
        {activeTab === "mypage" && isSignedIn && (
          <div className="space-y-4">
            {myPageTab === "predictions" && (
              <BettingPredictionHistory
                predictionHistory={predictionHistory}
                isLoading={isLoadingHistory}
              />
            )}
            {myPageTab === "stats" && (
              <BettingMyStats myStats={myStats} isLoading={isLoadingMyStats} />
            )}
            {myPageTab === "gold" && (
              <div className="p-6 text-center">
                <p className="text-sm text-muted-foreground">골드 내역 기능 준비중입니다.</p>
              </div>
            )}
            {myPageTab === "profile" && (
              <div className="space-y-4">
                <Card className="p-4">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                      <User className="w-10 h-10 text-muted-foreground" />
                    </div>
                    <div className="w-full space-y-3">
                      <div>
                        <label className="text-xs text-muted-foreground">닉네임</label>
                        <Input placeholder="닉네임을 입력하세요" className="mt-1" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">이메일</label>
                        <Input type="email" placeholder="이메일을 입력하세요" className="mt-1" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">소개</label>
                        <Input placeholder="자기소개를 입력하세요" className="mt-1" />
                      </div>
                      <Button className="w-full">저장하기</Button>
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sticky Betting Slip */}
      {activeTab === "betting" && (
        <BettingSlip
          selectedBets={selectedBets}
          groupedMatches={groupedMatches}
          isSlipExpanded={isSlipExpanded}
          setIsSlipExpanded={setIsSlipExpanded}
          betAmount={betAmount}
          setBetAmount={setBetAmount}
          userBalls={userBalls}
          totalOdds={totalOdds}
          expectedReturn={expectedReturn}
          isSubmitting={isSubmittingPrediction}
          onRemoveBet={removeBet}
          onClearAllBets={clearAllBets}
          onSubmit={handleSubmitPrediction}
        />
      )}

      {/* Alert Dialog */}
      <BettingAlertDialog
        alertModal={alertModal}
        onClose={() => setAlertModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  )
}

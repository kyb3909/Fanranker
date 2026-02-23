import { useState, useEffect, useCallback, useMemo } from "react"
import { useAuth } from "@clerk/nextjs"
import { getMsUntilReset } from "@/lib/betman/daily-round"

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
} from "@/components/betting/betting-types"

interface PredictionMatch {
  match_time?: string
  sport_type?: string
  league?: { name_ko?: string; name?: string }
  home_team?: { name_ko?: string; name?: string }
  away_team?: { name_ko?: string; name?: string }
}

export function useBetting() {
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

  const [rankings, setRankings] = useState<RankingUser[]>([])
  const [isLoadingRankings, setIsLoadingRankings] = useState(false)
  const [rankingSportFilter, setRankingSportFilter] = useState<string>("전체")
  const [myRank, setMyRank] = useState<MyRank | null>(null)

  const [myStats, setMyStats] = useState<MyStatsData | null>(null)
  const [isLoadingMyStats, setIsLoadingMyStats] = useState(false)

  const [predictionHistory, setPredictionHistory] = useState<PredictionHistoryItem[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  const [isSubmittingPrediction, setIsSubmittingPrediction] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => new Date())

  const [alertModal, setAlertModal] = useState<AlertModalState>({
    isOpen: false,
    type: "error",
    title: "",
    message: "",
  })

  const showAlert = useCallback((type: "error" | "warning" | "success", title: string, message: string) => {
    setAlertModal({ isOpen: true, type, title, message })
  }, [])

  const closeAlert = useCallback(() => {
    setAlertModal((prev) => ({ ...prev, isOpen: false }))
  }, [])

  // ============================================================
  // Data Loading
  // ============================================================

  const loadMatches = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const sportParam = sportFilter !== "all" ? `&sport=${sportFilter}` : ""
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
      const res = await fetch("/api/tokens/balance")
      if (res.ok) {
        const data = await res.json()
        setUserBalls(data.balance || 10)
      }
    } catch { /* Silent fail */ }
  }, [isSignedIn])

  const loadFollows = useCallback(async () => {
    if (!isSignedIn) return
    try {
      const res = await fetch("/api/follow")
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
      const res = await fetch("/api/betman/my-stats")
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
        profit: "net_profit",
        winRate: "accuracy",
        roi: "profit_rate",
      }
      const sortParam = sortMap[rankingFilter] || "profit_rate"
      const response = await fetch(
        `/api/betman/rankings?sport=${encodeURIComponent(rankingSportFilter)}&sort=${sortParam}&limit=50`
      )
      if (!response.ok) { setRankings([]); setMyRank(null); return }
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
      const response = await fetch("/api/betman/prediction?status=all")
      if (!response.ok) throw new Error("Failed to load prediction history")
      const predictions = await response.json()

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
        const dateStr = `${String(matchTime.getMonth() + 1).padStart(2, "0")}/${String(matchTime.getDate()).padStart(2, "0")} ${String(matchTime.getHours()).padStart(2, "0")}:${String(matchTime.getMinutes()).padStart(2, "0")}`

        const sportTypeMap: Record<string, string> = {
          football: "축구", soccer: "축구", baseball: "야구", basketball: "농구", volleyball: "배구",
        }
        const sportName = sportTypeMap[match?.sport_type || "soccer"] || "축구"

        let status = "pending"
        if (pred.is_correct === true) status = "win"
        else if (pred.is_correct === false) status = "lose"

        const selectionMap: Record<string, string> = {
          home: "홈팀", away: "원정팀", draw: "무",
        }

        return {
          id: pred.id,
          date: dateStr,
          sport: sportName,
          matches: [{
            league: match?.league?.name_ko || match?.league?.name || "기타",
            home: match?.home_team?.name_ko || match?.home_team?.name || "홈팀",
            away: match?.away_team?.name_ko || match?.away_team?.name || "원정팀",
            selection: selectionMap[pred.predicted_value] || pred.predicted_value,
            odds: pred.odds_at_prediction || 0,
            result: status,
          }],
          totalOdds: pred.odds_at_prediction || 0,
          stake: 100,
          status,
          profit: pred.points_earned || (status === "pending" ? 0 : status === "win" ? 100 * (pred.odds_at_prediction || 1) : -100),
        }
      })

      setPredictionHistory(transformed)
    } catch { /* Silent fail */ }
    finally { setIsLoadingHistory(false) }
  }, [isSignedIn])

  // ============================================================
  // Effects
  // ============================================================

  useEffect(() => { loadMatches(); loadUserBalls(); loadFollows() }, [loadMatches, loadUserBalls, loadFollows])
  useEffect(() => { const i = setInterval(() => { loadMatches() }, 5 * 60 * 1000); return () => clearInterval(i) }, [loadMatches])
  useEffect(() => { const t = setInterval(() => { setCurrentTime(new Date()) }, 30000); return () => clearInterval(t) }, [])

  useEffect(() => {
    if (!earliestBetClose) { setDeadlineCountdown(null); return }
    const updateCountdown = () => {
      const now = new Date()
      const close = new Date(earliestBetClose)
      const diff = close.getTime() - now.getTime()
      if (diff <= 0) { setDeadlineCountdown("마감됨"); return }
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

  useEffect(() => {
    const scheduleReset = () => {
      const ms = getMsUntilReset()
      return setTimeout(() => {
        setSelectedBets([]); setSelectedSport(null); loadMatches(); loadUserBalls()
        window.dispatchEvent(new CustomEvent("dailyRoundReset"))
        showAlert("success", "일일 리셋", "23:00 새로운 라운드가 시작되었습니다.\n볼이 충전되었습니다.")
      }, ms)
    }
    const timerId = scheduleReset()
    return () => clearTimeout(timerId)
  }, [loadMatches, loadUserBalls, showAlert])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") { loadMatches(); loadUserBalls() }
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => document.removeEventListener("visibilitychange", handleVisibility)
  }, [loadMatches, loadUserBalls])

  useEffect(() => { if (activeTab === "ranking") loadRankings() }, [activeTab, rankingFilter, rankingSportFilter, loadRankings])
  useEffect(() => { if (activeTab === "mypage" && myPageTab === "predictions") loadPredictionHistory() }, [activeTab, myPageTab, loadPredictionHistory])
  useEffect(() => { if (activeTab === "mypage" && myPageTab === "stats") loadMyStats() }, [activeTab, myPageTab, loadMyStats])

  // ============================================================
  // Handlers
  // ============================================================

  const handleSubmitPrediction = useCallback(async () => {
    if (selectedBets.length === 0) { showAlert("warning", "경기를 선택해주세요", "예측할 경기를 먼저 선택해주세요."); return }
    if (betAmount <= 0) { showAlert("warning", "베팅 금액 확인", "베팅할 볼 수를 입력해주세요."); return }
    if (betAmount > userBalls) { showAlert("warning", "볼 부족", `보유 볼이 부족합니다.\n현재 보유: ${userBalls}볼`); return }

    setIsSubmittingPrediction(true)
    try {
      const predictionsArray = selectedBets.map((bet) => ({ game_id: bet.gameId, prediction: bet.selection }))
      const res = await fetch("/api/betman/prediction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ predictions: predictionsArray, betAmount }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "예측 저장에 실패했습니다.")

      showAlert("success", "예측 완료!", data.message || `${selectedBets.length}경기 예측이 성공적으로 등록되었습니다.`)
      setSelectedBets([]); setIsSlipExpanded(false); setSelectedSport(null); setBetAmount(1)
      loadMatches(); loadUserBalls()
      window.dispatchEvent(new CustomEvent("ballBalanceUpdate"))
    } catch (err) {
      showAlert("error", "예측 실패", err instanceof Error ? err.message : "예측 저장 중 오류가 발생했습니다.")
    } finally {
      setIsSubmittingPrediction(false)
    }
  }, [selectedBets, betAmount, userBalls, showAlert, loadMatches, loadUserBalls])

  const handleBetSelection = useCallback((
    gameId: string, matchKey: string, selection: string, sport: string,
    gameType: string, handicap: number | null, overUnderLine: number | null, odds?: number
  ) => {
    const match = groupedMatches.find((m) => m.matchKey === matchKey)
    if (match) {
      const matchTime = new Date(match.matchTime)
      const now = new Date()
      if (matchTime <= now) { showAlert("warning", "이미 시작된 경기입니다", "이미 시작된 경기에는 예측할 수 없습니다."); return }
      const game = match.games.find((g) => g.id === gameId)
      if (game?.bet_close_at && new Date(game.bet_close_at) <= now) { showAlert("warning", "이미 시작된 경기입니다", "베팅 마감 시간이 지났습니다."); return }
    }

    setSelectedBets((prev) => {
      const existingMatchBet = prev.find((b) => b.matchKey === matchKey)
      const existingGameBet = prev.find((b) => b.gameId === gameId)

      if (existingGameBet) {
        if (existingGameBet.selection === selection) {
          const newBets = prev.filter((b) => b.gameId !== gameId)
          if (newBets.length === 0) setSelectedSport(null)
          return newBets
        }
        return prev.map((b) => (b.gameId === gameId ? { ...b, selection, odds } : b))
      }
      if (existingMatchBet) {
        const newBets = prev.filter((b) => b.matchKey !== matchKey)
        newBets.push({ gameId, matchKey, selection, sport, gameType, handicap, overUnderLine, odds })
        return newBets
      }
      if (prev.length === 0) {
        setSelectedSport(sport)
        return [{ gameId, matchKey, selection, sport, gameType, handicap, overUnderLine, odds }]
      }
      if (sport !== selectedSport) {
        showAlert("warning", "종목 조합 불가", `다른 종목은 조합할 수 없습니다.\n이미 "${selectedSport}" 종목이 선택되었습니다.`)
        return prev
      }
      return [...prev, { gameId, matchKey, selection, sport, gameType, handicap, overUnderLine, odds }]
    })
  }, [groupedMatches, selectedSport, showAlert])

  const removeBet = useCallback((gameId: string) => {
    setSelectedBets((prev) => {
      const newBets = prev.filter((b) => b.gameId !== gameId)
      if (newBets.length === 0) setSelectedSport(null)
      return newBets
    })
  }, [])

  const clearAllBets = useCallback(() => { setSelectedBets([]); setSelectedSport(null) }, [])

  const handleFollow = useCallback(async (userId: string) => {
    setFollowLoading((prev) => new Set(prev).add(userId))
    try {
      const res = await fetch("/api/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      })
      if (res.ok) {
        const data = await res.json()
        setFollowedUsers((prev) => {
          const newSet = new Set(prev)
          if (data.action === "followed") newSet.add(userId)
          else newSet.delete(userId)
          return newSet
        })
      }
    } catch { /* Silent fail */ }
    finally {
      setFollowLoading((prev) => { const s = new Set(prev); s.delete(userId); return s })
    }
  }, [])

  // ============================================================
  // Computed
  // ============================================================

  const totalOdds = selectedBets.reduce((acc, bet) => acc * (bet.odds || 1), 1)
  const expectedReturn = Math.floor(betAmount * totalOdds)

  const filteredMatches = useMemo(() => {
    return groupedMatches
      .filter((m) => new Date(m.matchTime) > currentTime)
      .filter((m) => sportFilter === "all" || m.sport === sportFilter)
  }, [groupedMatches, sportFilter, currentTime])

  return {
    // Tab state
    activeTab, setActiveTab,
    sportFilter, setSportFilter,
    myPageTab, setMyPageTab,
    rankingFilter, setRankingFilter,
    rankingSportFilter, setRankingSportFilter,

    // Betting state
    selectedBets, selectedSport,
    isSlipExpanded, setIsSlipExpanded,
    betAmount, setBetAmount,
    userBalls,
    totalOdds, expectedReturn,
    isSubmittingPrediction,

    // Match data
    todayInfo, groupedMatches, filteredMatches,
    isLoading, error, lastUpdated,
    deadlineCountdown,

    // Rankings
    rankings, myRank, isLoadingRankings,
    followedUsers, followLoading,

    // My page
    myStats, isLoadingMyStats,
    predictionHistory, isLoadingHistory,

    // Alert
    alertModal, closeAlert,

    // Handlers
    loadMatches,
    handleBetSelection,
    removeBet, clearAllBets,
    handleSubmitPrediction,
    handleFollow,
  }
}

import { useState, useEffect, useCallback, useMemo } from "react"
import { useAuth } from "@clerk/nextjs"
import useSWR from "swr"
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

const fetcher = (url: string) => fetch(url).then((r) => r.json())

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
  const [sportFilter, setSportFilterRaw] = useState<"all" | "축구" | "야구" | "농구" | "배구">(
    "all"
  )
  const [leagueFilter, setLeagueFilter] = useState<"all" | string>("all")
  const [selectedBets, setSelectedBets] = useState<SelectedBet[]>([])
  const [isSlipExpanded, setIsSlipExpanded] = useState(false)
  const [betAmount, setBetAmount] = useState<number>(1)
  const [userBalls, setUserBalls] = useState<number>(10)
  const [followedUsers, setFollowedUsers] = useState<Set<string>>(new Set())
  const [followLoading, setFollowLoading] = useState<Set<string>>(new Set())
  const [rankingFilter, setRankingFilter] = useState<"profit" | "winRate" | "roi">("profit")
  const [myPageTab, setMyPageTab] = useState<"predictions" | "stats" | "gold" | "profile">(
    "predictions"
  )

  const [todayInfo, setTodayInfo] = useState<TodayInfo | null>(null)
  const [, setDailyRound] = useState<DailyRoundInfo | null>(null)
  const [, setBettingWindow] = useState<BettingWindowInfo | null>(null)
  const [groupedMatches, setGroupedMatches] = useState<GroupedMatch[]>([])
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
  const [analysisTitle, setAnalysisTitle] = useState("")
  const [analysisText, setAnalysisText] = useState("")
  const [isJournalist, setIsJournalist] = useState(false)

  const setSportFilter = useCallback((filter: "all" | "축구" | "야구" | "농구" | "배구") => {
    setSportFilterRaw(filter)
    setLeagueFilter("all")
  }, [])

  const [alertModal, setAlertModal] = useState<AlertModalState>({
    isOpen: false,
    type: "error",
    title: "",
    message: "",
  })

  const showAlert = useCallback(
    (type: "error" | "warning" | "success", title: string, message: string) => {
      setAlertModal({ isOpen: true, type, title, message })
    },
    []
  )

  const closeAlert = useCallback(() => {
    setAlertModal((prev) => ({ ...prev, isOpen: false }))
  }, [])

  // ============================================================
  // Data Loading (SWR - auto deduplication & revalidation)
  // ============================================================

  const gamesKey = `/api/betman/games?${sportFilter !== "all" ? `sport=${sportFilter}` : ""}`
  const {
    data: gamesData,
    error: gamesError,
    isLoading: gamesLoading,
    isValidating: gamesValidating,
    mutate: mutateGames,
  } = useSWR(gamesKey, fetcher, {
    refreshInterval: 5 * 60 * 1000, // 5분마다 자동 갱신
    revalidateOnFocus: true, // 탭 복귀 시 자동 갱신
    dedupingInterval: 10_000, // 10초 내 중복 요청 방지
  })

  // SWR 데이터를 기존 state에 동기화
  useEffect(() => {
    if (!gamesData) return
    if (gamesData.today) setTodayInfo(gamesData.today)
    if (gamesData.dailyRound) setDailyRound(gamesData.dailyRound)
    if (gamesData.bettingWindow) setBettingWindow(gamesData.bettingWindow)
    if (gamesData.groupedGames) setGroupedMatches(gamesData.groupedGames)
    if (gamesData.window) setWindowInfo(gamesData.window)
    setEarliestBetClose(gamesData.earliestBetClose || null)
    setLastUpdated(new Date())
  }, [gamesData])

  useEffect(() => {
    if (gamesError) setError("경기 데이터를 불러오는데 실패했습니다.")
    else setError(null)
  }, [gamesError])

  const isLoading = gamesLoading || (gamesValidating && !gamesData)

  const loadMatches = useCallback(() => {
    mutateGames()
  }, [mutateGames])

  const loadUserBalls = useCallback(async () => {
    if (!isSignedIn) return
    try {
      const res = await fetch("/api/tokens/balance")
      if (res.ok) {
        const data = await res.json()
        setUserBalls(data.balance || 10)
      }
    } catch {
      /* Silent fail */
    }
  }, [isSignedIn])

  const loadJournalistStatus = useCallback(async () => {
    if (!isSignedIn) return
    try {
      const res = await fetch("/api/profile/me")
      if (res.ok) {
        const data = await res.json()
        setIsJournalist(!!data.is_journalist)
      }
    } catch {
      /* Silent fail */
    }
  }, [isSignedIn])

  const loadFollows = useCallback(async () => {
    if (!isSignedIn) return
    try {
      const res = await fetch("/api/follow")
      if (res.ok) {
        const data = await res.json()
        setFollowedUsers(new Set(data.following || []))
      }
    } catch {
      /* Silent fail */
    }
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
    } catch {
      /* Silent fail */
    } finally {
      setIsLoadingMyStats(false)
    }
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
      const response = await fetch("/api/betman/prediction?status=all")
      if (!response.ok) throw new Error("Failed to load prediction history")
      const data = await response.json()
      const slips = data.slips || []

      const transformed: PredictionHistoryItem[] = slips.map(
        (slip: {
          id: string
          date: string
          sport: string
          stake: number
          totalOdds: number
          status: string
          profit: number
          matches: PredictionMatch[]
        }) => {
          const dateObj = new Date(slip.date)
          const dateStr = `${String(dateObj.getMonth() + 1).padStart(2, "0")}/${String(dateObj.getDate()).padStart(2, "0")} ${String(dateObj.getHours()).padStart(2, "0")}:${String(dateObj.getMinutes()).padStart(2, "0")}`

          return {
            id: slip.id,
            date: dateStr,
            sport: slip.sport,
            matches: slip.matches,
            totalOdds: slip.totalOdds,
            stake: slip.stake,
            status: slip.status,
            profit: slip.profit,
          }
        }
      )

      setPredictionHistory(transformed)
    } catch {
      /* Silent fail */
    } finally {
      setIsLoadingHistory(false)
    }
  }, [isSignedIn])

  // ============================================================
  // Effects
  // ============================================================

  useEffect(() => {
    loadUserBalls()
    loadFollows()
    loadJournalistStatus()
  }, [loadUserBalls, loadFollows, loadJournalistStatus])
  // SWR handles: initial fetch, 5-min polling, visibility revalidation
  useEffect(() => {
    const t = setInterval(() => {
      setCurrentTime(new Date())
    }, 30000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!earliestBetClose) {
      setDeadlineCountdown(null)
      return
    }
    const updateCountdown = () => {
      const now = new Date()
      const close = new Date(earliestBetClose)
      const diff = close.getTime() - now.getTime()
      if (diff <= 0) {
        setDeadlineCountdown("마감됨")
        return
      }
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
        setSelectedBets([])
        setSelectedSport(null)
        loadMatches()
        loadUserBalls()
        window.dispatchEvent(new CustomEvent("dailyRoundReset"))
        showAlert(
          "success",
          "일일 리셋",
          "23:00 새로운 라운드가 시작되었습니다.\n볼이 충전되었습니다."
        )
      }, ms)
    }
    const timerId = scheduleReset()
    return () => clearTimeout(timerId)
  }, [loadMatches, loadUserBalls, showAlert])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        // SWR handles games revalidation via revalidateOnFocus
        loadUserBalls()
      }
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => document.removeEventListener("visibilitychange", handleVisibility)
  }, [loadUserBalls])

  useEffect(() => {
    if (activeTab === "ranking") loadRankings()
  }, [activeTab, rankingFilter, rankingSportFilter, loadRankings])
  useEffect(() => {
    if (activeTab === "mypage" && myPageTab === "predictions") loadPredictionHistory()
  }, [activeTab, myPageTab, loadPredictionHistory])
  useEffect(() => {
    if (activeTab === "mypage" && myPageTab === "stats") loadMyStats()
  }, [activeTab, myPageTab, loadMyStats])

  // ============================================================
  // Handlers
  // ============================================================

  const handleSubmitPrediction = useCallback(async () => {
    if (selectedBets.length === 0) {
      showAlert("warning", "경기를 선택해주세요", "예측할 경기를 먼저 선택해주세요.")
      return
    }
    if (betAmount <= 0) {
      showAlert("warning", "베팅 금액 확인", "베팅할 볼 수를 입력해주세요.")
      return
    }
    if (betAmount > userBalls) {
      showAlert("warning", "볼 부족", `보유 볼이 부족합니다.\n현재 보유: ${userBalls}볼`)
      return
    }

    setIsSubmittingPrediction(true)
    try {
      const predictionsArray = selectedBets.map((bet) => ({
        game_id: bet.gameId,
        prediction: bet.selection,
      }))
      const payload: Record<string, unknown> = { predictions: predictionsArray, betAmount }
      if (isJournalist && analysisText.trim()) {
        if (analysisTitle.trim()) payload.analysis_title = analysisTitle.trim()
        payload.analysis_text = analysisText.trim()
      }
      const res = await fetch("/api/betman/prediction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "예측 저장에 실패했습니다.")

      showAlert(
        "success",
        "예측 완료!",
        data.message || `${selectedBets.length}경기 예측이 성공적으로 등록되었습니다.`
      )
      setSelectedBets([])
      setIsSlipExpanded(false)
      setSelectedSport(null)
      setBetAmount(1)
      setAnalysisTitle("")
      setAnalysisText("")
      loadMatches()
      loadUserBalls()
      window.dispatchEvent(new CustomEvent("ballBalanceUpdate"))
    } catch (err) {
      showAlert(
        "error",
        "예측 실패",
        err instanceof Error ? err.message : "예측 저장 중 오류가 발생했습니다."
      )
    } finally {
      setIsSubmittingPrediction(false)
    }
  }, [
    selectedBets,
    betAmount,
    userBalls,
    showAlert,
    loadMatches,
    loadUserBalls,
    isJournalist,
    analysisTitle,
    analysisText,
  ])

  const handleBetSelection = useCallback(
    (
      gameId: string,
      matchKey: string,
      selection: string,
      sport: string,
      gameType: string,
      handicap: number | null,
      overUnderLine: number | null,
      odds?: number
    ) => {
      const match = groupedMatches.find((m) => m.matchKey === matchKey)
      if (match) {
        const matchTime = new Date(match.matchTime)
        const now = new Date()
        if (matchTime <= now) {
          showAlert("warning", "이미 시작된 경기입니다", "이미 시작된 경기에는 예측할 수 없습니다.")
          return
        }
        const game = match.games.find((g) => g.id === gameId)
        if (game?.bet_close_at && new Date(game.bet_close_at) <= now) {
          showAlert("warning", "이미 시작된 경기입니다", "베팅 마감 시간이 지났습니다.")
          return
        }
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
          newBets.push({
            gameId,
            matchKey,
            selection,
            sport,
            gameType,
            handicap,
            overUnderLine,
            odds,
          })
          return newBets
        }
        if (prev.length === 0) {
          setSelectedSport(sport)
          return [{ gameId, matchKey, selection, sport, gameType, handicap, overUnderLine, odds }]
        }
        if (sport !== selectedSport) {
          showAlert(
            "warning",
            "종목 조합 불가",
            `다른 종목은 조합할 수 없습니다.\n이미 "${selectedSport}" 종목이 선택되었습니다.`
          )
          return prev
        }
        return [
          ...prev,
          { gameId, matchKey, selection, sport, gameType, handicap, overUnderLine, odds },
        ]
      })
    },
    [groupedMatches, selectedSport, showAlert]
  )

  const removeBet = useCallback((gameId: string) => {
    setSelectedBets((prev) => {
      const newBets = prev.filter((b) => b.gameId !== gameId)
      if (newBets.length === 0) setSelectedSport(null)
      return newBets
    })
  }, [])

  const clearAllBets = useCallback(() => {
    setSelectedBets([])
    setSelectedSport(null)
  }, [])

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
    } catch {
      /* Silent fail */
    } finally {
      setFollowLoading((prev) => {
        const s = new Set(prev)
        s.delete(userId)
        return s
      })
    }
  }, [])

  // ============================================================
  // Computed
  // ============================================================

  const totalOdds = selectedBets.reduce((acc, bet) => acc * (bet.odds || 1), 1)
  const expectedReturn = Math.floor(betAmount * totalOdds)

  const availableLeagues = useMemo(() => {
    if (sportFilter === "all") return []
    const leagues = new Set<string>()
    for (const m of groupedMatches) {
      if (m.sport === sportFilter && new Date(m.matchTime) > currentTime) {
        leagues.add(m.leagueCode)
      }
    }
    return Array.from(leagues).sort()
  }, [groupedMatches, sportFilter, currentTime])

  const filteredMatches = useMemo(() => {
    return groupedMatches
      .filter((m) => new Date(m.matchTime) > currentTime)
      .filter((m) => sportFilter === "all" || m.sport === sportFilter)
      .filter((m) => leagueFilter === "all" || m.leagueCode === leagueFilter)
  }, [groupedMatches, sportFilter, leagueFilter, currentTime])

  return {
    // Tab state
    activeTab,
    setActiveTab,
    sportFilter,
    setSportFilter,
    leagueFilter,
    setLeagueFilter,
    availableLeagues,
    myPageTab,
    setMyPageTab,
    rankingFilter,
    setRankingFilter,
    rankingSportFilter,
    setRankingSportFilter,

    // Betting state
    selectedBets,
    selectedSport,
    isSlipExpanded,
    setIsSlipExpanded,
    betAmount,
    setBetAmount,
    userBalls,
    totalOdds,
    expectedReturn,
    isSubmittingPrediction,

    // Match data
    todayInfo,
    groupedMatches,
    filteredMatches,
    isLoading,
    error,
    lastUpdated,
    deadlineCountdown,

    // Rankings
    rankings,
    myRank,
    isLoadingRankings,
    followedUsers,
    followLoading,

    // My page
    myStats,
    isLoadingMyStats,
    predictionHistory,
    isLoadingHistory,

    // Alert
    alertModal,
    closeAlert,

    // Journalist
    isJournalist,
    analysisTitle,
    setAnalysisTitle,
    analysisText,
    setAnalysisText,

    // Handlers
    loadMatches,
    handleBetSelection,
    removeBet,
    clearAllBets,
    handleSubmitPrediction,
    handleFollow,
  }
}

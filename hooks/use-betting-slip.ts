import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@clerk/nextjs"
import { useSWRConfig } from "swr"
import type { SelectedBet, GroupedMatch } from "@/components/betting/betting-types"
import { useAlertModal } from "./use-alert-modal"
import { trackEvent } from "@/lib/analytics/events"

export function useBettingSlip(
  groupedMatches: GroupedMatch[],
  loadMatches: () => void,
  options?: { eventSlug?: string }
) {
  const eventSlug = options?.eventSlug
  const { isSignedIn } = useAuth()
  const { mutate: globalMutate } = useSWRConfig()
  const { alertModal, showAlert, closeAlert } = useAlertModal()

  const [selectedBets, setSelectedBets] = useState<SelectedBet[]>([])
  const [selectedSport, setSelectedSport] = useState<string | null>(null)
  const [isSlipExpanded, setIsSlipExpanded] = useState(false)
  const [betAmount, setBetAmount] = useState<number>(1)
  const [userBalls, setUserBalls] = useState<number>(10)
  const [isSubmittingPrediction, setIsSubmittingPrediction] = useState(false)

  // Journalist analysis fields
  const [isJournalist, setIsJournalist] = useState(false)
  const [analysisTitle, setAnalysisTitle] = useState("")
  const [analysisText, setAnalysisText] = useState("")

  // Load user balance
  const loadUserBalls = useCallback(async () => {
    if (!isSignedIn) return
    try {
      const res = await fetch("/api/tokens/balance")
      if (res.ok) {
        const data = await res.json()
        setUserBalls(data.balance || 10)
      }
    } catch (err) {
      console.error("Failed to load user balls:", err)
    }
  }, [isSignedIn])

  // Initial data load — fetch balance and profile in parallel
  useEffect(() => {
    if (!isSignedIn) return
    const loadInitialData = async () => {
      const [balanceRes, profileRes] = await Promise.all([
        fetch("/api/tokens/balance").catch((err) => {
          console.error("Failed to load user balls:", err)
          return null
        }),
        fetch("/api/profile/me").catch((err) => {
          console.error("Failed to load journalist status:", err)
          return null
        }),
      ])
      if (balanceRes?.ok) {
        const data = await balanceRes.json()
        setUserBalls(data.balance || 10)
      }
      if (profileRes?.ok) {
        const data = await profileRes.json()
        setIsJournalist(!!data.is_journalist)
      }
    }
    loadInitialData()
  }, [isSignedIn])

  // Reload balance on visibility change
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") loadUserBalls()
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => document.removeEventListener("visibilitychange", handleVisibility)
  }, [loadUserBalls])

  // Reset on daily round reset
  useEffect(() => {
    const handleReset = () => {
      setSelectedBets([])
      setSelectedSport(null)
      loadUserBalls()
      showAlert(
        "success",
        "일일 리셋",
        "23:00 새로운 라운드가 시작되었습니다.\n볼이 충전되었습니다."
      )
    }
    window.addEventListener("dailyRoundReset", handleReset)
    return () => window.removeEventListener("dailyRoundReset", handleReset)
  }, [loadUserBalls, showAlert])

  // Computed
  const totalOdds = selectedBets.reduce((acc, bet) => acc * (bet.odds || 1), 1)
  const expectedReturn = Math.floor(betAmount * totalOdds)

  // Handlers
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
      // Validate match time
      const match = groupedMatches.find((m) => m.matchKey === matchKey)
      if (match) {
        const now = new Date()
        if (new Date(match.matchTime) <= now) {
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
        const existingGameBet = prev.find((b) => b.gameId === gameId)
        const existingMatchBet = prev.find((b) => b.matchKey === matchKey)

        // Toggle off same selection
        if (existingGameBet) {
          if (existingGameBet.selection === selection) {
            const newBets = prev.filter((b) => b.gameId !== gameId)
            if (newBets.length === 0) {
              setSelectedSport(null)
            }
            return newBets
          }
          return prev.map((b) => (b.gameId === gameId ? { ...b, selection, odds } : b))
        }

        // Replace existing bet for same match
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

        // First bet — lock sport
        if (prev.length === 0) {
          setSelectedSport(sport)
          return [{ gameId, matchKey, selection, sport, gameType, handicap, overUnderLine, odds }]
        }

        // Cross-sport block
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

  const handleSubmitPrediction = useCallback(async () => {
    if (selectedBets.length === 0) {
      showAlert("warning", "경기를 선택해주세요", "예측할 경기를 먼저 선택해주세요.")
      return
    }
    if (betAmount <= 0) {
      showAlert("warning", "베팅 금액 확인", "베팅할 볼 수를 입력해주세요.")
      return
    }
    const MAX_BET = 10
    if (betAmount > MAX_BET) {
      showAlert("warning", "베팅 금액 초과", `베팅 금액은 최대 ${MAX_BET}볼입니다.`)
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
      const idempotencyKey = crypto.randomUUID()
      const payload: Record<string, unknown> = {
        predictions: predictionsArray,
        betAmount,
        idempotency_key: idempotencyKey,
      }
      if (isJournalist && analysisText.trim()) {
        if (analysisTitle.trim()) payload.analysis_title = analysisTitle.trim()
        payload.analysis_text = analysisText.trim()
      }
      if (eventSlug) payload.event_slug = eventSlug
      const res = await fetch("/api/sports/prediction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "예측 저장에 실패했습니다.")

      trackEvent({
        name: "prediction_submit",
        params: { sport: selectedSport || "unknown", stake: betAmount },
      })
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
      globalMutate("/api/tokens/balance")
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
    selectedSport,
    betAmount,
    userBalls,
    showAlert,
    loadMatches,
    loadUserBalls,
    globalMutate,
    isJournalist,
    analysisTitle,
    analysisText,
    eventSlug,
  ])

  return {
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

    isJournalist,
    analysisTitle,
    setAnalysisTitle,
    analysisText,
    setAnalysisText,

    alertModal,
    closeAlert,

    handleBetSelection,
    removeBet,
    clearAllBets,
    handleSubmitPrediction,
  }
}

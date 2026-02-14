"use client"

import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useRef, useState, useEffect, useCallback } from "react"
import type React from "react"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  MoreVertical,
  ChevronDown,
  ChevronUp,
  Trophy,
  TrendingUp,
  Target,
  Coins,
  User,
  LogOut,
  Settings,
  Loader2,
  RefreshCw,
  AlertCircle,
  Circle,
  X,
  Calendar,
  Clock,
  CheckCircle2,
  BarChart3,
} from "lucide-react"

// Betman Types
interface TodayInfo {
  date: string
  label: string
}

interface BetmanGame {
  id: string
  round_id: string
  game_no: number
  match_time: string
  sport: '축구' | '농구'
  league_code: string
  game_type: string
  home_team_name: string
  away_team_name: string
  handicap: number | null  // 핸디캡 스프레드 (핸디캡 게임용)
  over_under_line: number | null  // 언오버 기준선 (언오버 게임용)
  venue: string
  status: string
  // 배당률 (API에서 제공 시)
  home_odds?: number
  draw_odds?: number
  away_odds?: number
  over_odds?: number
  under_odds?: number
  odd_odds?: number   // SUM 홀수
  even_odds?: number  // SUM 짝수
}

interface GroupedMatch {
  matchKey: string
  sport: string
  leagueCode: string
  homeTeam: string
  awayTeam: string
  matchTime: string
  venue: string
  games: BetmanGame[]
}

// Game type labels
const gameTypeLabels: Record<string, string> = {
  '일반': '승무패',
  'S일반': '승무패',
  '핸디캡': '핸디캡',
  'S핸디캡': '핸디캡',
  '언더오버': '언오버',
  'S언더오버': '언오버',
  'SUM': '합계',
}

// Sport colors definition (supports both English and Korean keys)
const sportColors: Record<string, { bg: string; text: string; border: string }> = {
  soccer: { bg: "bg-gradient-to-r from-rose-50 to-pink-50", text: "text-rose-900", border: "border-rose-200" },
  "축구": { bg: "bg-gradient-to-r from-emerald-50 to-teal-50", text: "text-emerald-900", border: "border-emerald-200" },
  "야구": { bg: "bg-gradient-to-r from-blue-50 to-indigo-50", text: "text-blue-900", border: "border-blue-200" },
  baseball: { bg: "bg-gradient-to-r from-blue-50 to-indigo-50", text: "text-blue-900", border: "border-blue-200" },
  basketball: { bg: "bg-gradient-to-r from-orange-50 to-amber-50", text: "text-orange-900", border: "border-orange-200" },
  "농구": { bg: "bg-gradient-to-r from-orange-50 to-amber-50", text: "text-orange-900", border: "border-orange-200" },
  "배구": { bg: "bg-gradient-to-r from-purple-50 to-violet-50", text: "text-purple-900", border: "border-purple-200" },
  volleyball: { bg: "bg-gradient-to-r from-purple-50 to-violet-50", text: "text-purple-900", border: "border-purple-200" },
}

const sportColorFill: Record<string, { bg: string; text: string; border: string }> = {
  soccer: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  "축구": { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  "야구": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  baseball: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  basketball: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  "농구": { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  "배구": { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  volleyball: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
}
const SPORT_ICONS: Record<string, string> = { "축구": "⚽", "야구": "⚾", "농구": "🏀", "배구": "🏐" }

// Format match time
function formatMatchTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).replace(". ", ".").replace(". ", " ")
}

// Format deadline
function formatDeadline(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// matches 데이터는 이제 API에서 가져옵니다 (betting-api.ts 참조)



// Main BettingPage Component
export default function BettingPage() {
  const [activeTab, setActiveTab] = useState<"betting" | "ranking" | "mypage">("betting")
  const [sportFilter, setSportFilter] = useState<"all" | "축구" | "야구" | "농구" | "배구">("all")
  const [selectedBets, setSelectedBets] = useState<
    { gameId: string; matchKey: string; selection: string; sport: string; gameType: string; handicap: number | null; overUnderLine: number | null; odds?: number }[]
  >([])
  const [isSlipExpanded, setIsSlipExpanded] = useState(false)
  const [betAmount, setBetAmount] = useState<number>(1) // 기본 베팅 금액 (1볼)
  const [userBalls, setUserBalls] = useState<number>(10) // 사용자 보유 볼 (하루 10볼)
  const [followedUsers, setFollowedUsers] = useState<Set<string>>(new Set())
  const [followLoading, setFollowLoading] = useState<Set<string>>(new Set())
  const [rankingFilter, setRankingFilter] = useState<"profit" | "winRate" | "roi">("profit")
  const [myPageTab, setMyPageTab] = useState<"predictions" | "stats" | "gold" | "profile">("predictions")

  // Betman API 데이터 상태
  const [todayInfo, setTodayInfo] = useState<TodayInfo | null>(null)
  const [groupedMatches, setGroupedMatches] = useState<GroupedMatch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Track selected sport for single-sport restriction
  const [selectedSport, setSelectedSport] = useState<string | null>(null)

  // Rankings 상태
  const [rankings, setRankings] = useState<any[]>([])
  const [isLoadingRankings, setIsLoadingRankings] = useState(false)
  const [rankingSportFilter, setRankingSportFilter] = useState<string>("전체")
  const [myRank, setMyRank] = useState<any>(null)

  // My stats 상태
  const [myStats, setMyStats] = useState<{ summary: any; sports: any[] } | null>(null)
  const [isLoadingMyStats, setIsLoadingMyStats] = useState(false)

  // Prediction history 상태
  const [predictionHistory, setPredictionHistory] = useState<any[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // 예측 제출 상태
  const [isSubmittingPrediction, setIsSubmittingPrediction] = useState(false)

  // 알림 모달 상태
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean
    type: 'error' | 'warning' | 'success'
    title: string
    message: string
  }>({
    isOpen: false,
    type: 'error',
    title: '',
    message: '',
  })

  // 베트맨 경기 데이터 로드
  const loadMatches = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const sportParam = sportFilter !== 'all' ? `&sport=${sportFilter}` : ''
      const res = await fetch(`/api/betman/games?${sportParam}`)
      const data = await res.json()

      if (data.today) {
        setTodayInfo(data.today)
      }
      if (data.groupedGames) {
        setGroupedMatches(data.groupedGames)
      }
      setLastUpdated(new Date())
    } catch (err) {
      setError("경기 데이터를 불러오는데 실패했습니다.")
      console.error("Failed to fetch betman games:", err)
    } finally {
      setIsLoading(false)
    }
  }, [sportFilter])

  // 사용자 볼 잔액 로드
  const loadUserBalls = useCallback(async () => {
    try {
      const res = await fetch('/api/tokens/balance')
      if (res.ok) {
        const data = await res.json()
        setUserBalls(data.balance || 10)
      }
    } catch (err) {
      console.error('Failed to fetch user balls:', err)
    }
  }, [])

  // 팔로우 목록 로드
  const loadFollows = useCallback(async () => {
    try {
      const res = await fetch('/api/follow')
      if (res.ok) {
        const data = await res.json()
        setFollowedUsers(new Set(data.following || []))
      }
    } catch (err) {
      console.error('Failed to load follows:', err)
    }
  }, [])

  // 내 통계 로드
  const loadMyStats = useCallback(async () => {
    setIsLoadingMyStats(true)
    try {
      const res = await fetch('/api/betman/my-stats')
      if (res.ok) {
        const data = await res.json()
        setMyStats(data)
      }
    } catch (err) {
      console.error('Failed to load my stats:', err)
    } finally {
      setIsLoadingMyStats(false)
    }
  }, [])

  // 컴포넌트 마운트 시 데이터 로드
  useEffect(() => {
    loadMatches()
    loadUserBalls()
    loadFollows()
  }, [loadMatches, loadUserBalls, loadFollows])

  // 자동 새로고침 (5분마다)
  useEffect(() => {
    const interval = setInterval(() => {
      loadMatches()
    }, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [loadMatches])

  // Load rankings
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
    } catch (err) {
      console.error('Failed to load rankings:', err)
      setRankings([])
      setMyRank(null)
    } finally {
      setIsLoadingRankings(false)
    }
  }, [rankingFilter, rankingSportFilter])

  // Load prediction history
  const loadPredictionHistory = useCallback(async () => {
    setIsLoadingHistory(true)
    try {
      const response = await fetch('/api/prediction?status=all')
      if (!response.ok) throw new Error('Failed to load prediction history')
      const predictions = await response.json()
      
      // Transform predictions to match the expected format
      const transformed = predictions.map((pred: any) => {
        const match = pred.matches?.[0] || pred.matches
        const matchTime = match?.match_time ? new Date(match.match_time) : new Date()
        const dateStr = `${String(matchTime.getMonth() + 1).padStart(2, '0')}/${String(matchTime.getDate()).padStart(2, '0')} ${String(matchTime.getHours()).padStart(2, '0')}:${String(matchTime.getMinutes()).padStart(2, '0')}`
        
        const sportTypeMap: Record<string, string> = {
          football: '축구',
          soccer: '축구',
          baseball: '야구',
          basketball: '농구',
          volleyball: '배구',
        }
        const sportName = sportTypeMap[match?.sport_type || 'soccer'] || '축구'
        
        // Determine status
        let status = 'pending'
        if (pred.is_correct === true) status = 'win'
        else if (pred.is_correct === false) status = 'lose'
        
        // Map predicted_value to Korean selection
        const selectionMap: Record<string, string> = {
          home: '홈팀',
          away: '원정팀',
          draw: '무',
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
          stake: 100, // Default stake (TODO: get from token_transactions)
          status,
          profit: pred.points_earned || (status === 'pending' ? 0 : status === 'win' ? 100 * (pred.odds_at_prediction || 1) : -100),
        }
      })
      
      setPredictionHistory(transformed)
    } catch (err) {
      console.error('Failed to load prediction history:', err)
    } finally {
      setIsLoadingHistory(false)
    }
  }, [])

  // Load rankings when ranking tab is active or filters change
  useEffect(() => {
    if (activeTab === 'ranking') {
      loadRankings()
    }
  }, [activeTab, rankingFilter, rankingSportFilter, loadRankings])

  // Load prediction history when mypage tab is active
  useEffect(() => {
    if (activeTab === 'mypage' && myPageTab === 'predictions') {
      loadPredictionHistory()
    }
  }, [activeTab, myPageTab, loadPredictionHistory])

  // Load my stats when mypage stats tab is active
  useEffect(() => {
    if (activeTab === 'mypage' && myPageTab === 'stats') {
      loadMyStats()
    }
  }, [activeTab, myPageTab, loadMyStats])

  // 알림 모달 표시 헬퍼 함수
  const showAlert = (type: 'error' | 'warning' | 'success', title: string, message: string) => {
    setAlertModal({ isOpen: true, type, title, message })
  }

  // 베트맨 예측 제출 함수
  const handleSubmitPrediction = async () => {
    if (selectedBets.length === 0) {
      showAlert('warning', '경기를 선택해주세요', '예측할 경기를 먼저 선택해주세요.')
      return
    }

    if (betAmount <= 0) {
      showAlert('warning', '베팅 금액 확인', '베팅할 볼 수를 입력해주세요.')
      return
    }

    if (betAmount > userBalls) {
      showAlert('warning', '볼 부족', `보유 볼이 부족합니다.\n현재 보유: ${userBalls}볼`)
      return
    }

    setIsSubmittingPrediction(true)
    try {
      const predictionsArray = selectedBets.map(bet => ({
        game_id: bet.gameId,
        prediction: bet.selection,
      }))

      const res = await fetch('/api/betman/prediction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          predictions: predictionsArray,
          betAmount: betAmount,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '예측 저장에 실패했습니다.')
      }

      showAlert('success', '예측 완료!', data.message || `${selectedBets.length}경기 예측이 성공적으로 등록되었습니다.`)

      // 상태 초기화
      setSelectedBets([])
      setIsSlipExpanded(false)
      setSelectedSport(null)
      setBetAmount(1) // 기본값으로 리셋
      loadMatches() // Refresh to show saved predictions
      loadUserBalls() // 볼 잔액 새로고침

      // 헤더의 BallBalance 컴포넌트 업데이트를 위한 이벤트 발생
      window.dispatchEvent(new CustomEvent('ballBalanceUpdate'))
    } catch (error: any) {
      showAlert('error', '예측 실패', error.message || '예측 저장 중 오류가 발생했습니다.')
    } finally {
      setIsSubmittingPrediction(false)
    }
  }

  // 베트맨 게임 선택 핸들러
  const handleBetSelection = (gameId: string, matchKey: string, selection: string, sport: string, gameType: string, handicap: number | null, overUnderLine: number | null, odds?: number) => {
    // 같은 물리적 경기에서 이미 선택된 게임이 있는지 확인
    const existingMatchBet = selectedBets.find((b) => b.matchKey === matchKey)
    const existingGameBet = selectedBets.find((b) => b.gameId === gameId)

    if (existingGameBet) {
      // 같은 게임을 다시 클릭
      if (existingGameBet.selection === selection) {
        // 같은 선택을 다시 클릭하면 취소
        const newBets = selectedBets.filter((b) => b.gameId !== gameId)
        setSelectedBets(newBets)
        if (newBets.length === 0) {
          setSelectedSport(null)
        }
      } else {
        // 다른 선택으로 변경
        const newBets = selectedBets.map((b) =>
          b.gameId === gameId ? { ...b, selection, odds } : b
        )
        setSelectedBets(newBets)
      }
    } else if (existingMatchBet) {
      // 같은 물리적 경기의 다른 게임 타입 선택 - 교체
      const newBets = selectedBets.filter((b) => b.matchKey !== matchKey)
      newBets.push({ gameId, matchKey, selection, sport, gameType, handicap, overUnderLine, odds })
      setSelectedBets(newBets)
    } else {
      // 새로운 경기 추가
      if (selectedBets.length === 0) {
        // 첫 경기 선택 - 종목 락인
        setSelectedSport(sport)
        setSelectedBets([{ gameId, matchKey, selection, sport, gameType, handicap, overUnderLine, odds }])
      } else {
        // 추가 경기 선택 - 종목 검증
        if (sport !== selectedSport) {
          showAlert('warning', '종목 조합 불가', `다른 종목은 조합할 수 없습니다.\n이미 "${selectedSport}" 종목이 선택되었습니다.`)
          return
        }
        setSelectedBets([...selectedBets, { gameId, matchKey, selection, sport, gameType, handicap, overUnderLine, odds }])
      }
    }
  }

  // 총 배당률 계산 (조합 배당)
  const totalOdds = selectedBets.reduce((acc, bet) => {
    return acc * (bet.odds || 1)
  }, 1)

  // 예상 획득 점수 계산
  const expectedReturn = Math.floor(betAmount * totalOdds)

  // 선택한 베팅 삭제 함수
  const removeBet = (gameId: string) => {
    const newBets = selectedBets.filter((b) => b.gameId !== gameId)
    setSelectedBets(newBets)
    if (newBets.length === 0) {
      setSelectedSport(null)
    }
  }

  // 모든 베팅 초기화 함수
  const clearAllBets = () => {
    setSelectedBets([])
    setSelectedSport(null)
  }

  // 팔로우/언팔로우 토글
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
          if (data.action === 'followed') {
            newSet.add(userId)
          } else {
            newSet.delete(userId)
          }
          return newSet
        })
      }
    } catch (err) {
      console.error('Follow error:', err)
    } finally {
      setFollowLoading(prev => {
        const newSet = new Set(prev)
        newSet.delete(userId)
        return newSet
      })
    }
  }

  // 필터링된 경기 목록 (이미 시작된 경기는 제외)
  const now = new Date()
  const filteredMatches = groupedMatches
    .filter((m) => {
      // 아직 시작되지 않은 경기만 표시
      const matchTime = new Date(m.matchTime)
      return matchTime > now
    })
    .filter((m) => sportFilter === "all" || m.sport === sportFilter)

  // 베트맨 종목 탭 (축구 야구 농구 배구 순서)
  const sportTabs = [
    { id: "all", label: "전체", icon: "🎯" },
    { id: "축구", label: "축구", icon: "⚽" },
    { id: "야구", label: "야구", icon: "⚾" },
    { id: "농구", label: "농구", icon: "🏀" },
    { id: "배구", label: "배구", icon: "🏐" },
  ]

  return (
    <div className="w-full">
      {/* Internal Navigation - 탭 스타일 */}
      <div className="bg-card rounded-xl border border-border mb-3 sm:mb-4 overflow-hidden">
        {/* 1행: 오늘의 경기 | 랭킹 | 마이페이지 */}
        <div className="flex border-b border-border">
          {[
            { id: "betting", label: "오늘의 경기" },
            { id: "ranking", label: "랭킹" },
            { id: "mypage", label: "마이페이지" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as "betting" | "ranking" | "mypage")}
              className={`flex items-center justify-center gap-2 flex-1 px-4 py-3 text-[14px] font-semibold transition-all border-b-2 -mb-[1px] ${
                activeTab === tab.id
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 2행: 종목/필터 탭 */}
        {activeTab === "betting" && (
          <>
            <div className="flex border-b border-border">
              {sportTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSportFilter(tab.id as "all" | "축구" | "야구" | "농구" | "배구")}
                  disabled={!!selectedSport && tab.id !== "all" && tab.id !== selectedSport}
                  className={`flex items-center justify-center gap-1.5 flex-1 px-3 py-2.5 text-[13px] font-semibold transition-all border-b-2 -mb-[1px] ${
                    sportFilter === tab.id
                      ? "border-primary text-primary bg-primary/5"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  } ${selectedSport && tab.id !== "all" && tab.id !== selectedSport ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <span className="text-sm">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
            {selectedSport && (
              <p className="text-[10px] text-orange-500 px-3 py-1.5 bg-orange-50/50">
                * {selectedSport} 경기만 선택 가능
              </p>
            )}
          </>
        )}

        {activeTab === "ranking" && (
          <>
            {/* 종목 필터 */}
            <div className="flex border-b border-border">
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
                  className={`flex items-center justify-center gap-1 flex-1 px-2 py-2.5 text-[13px] font-semibold transition-all border-b-2 -mb-[1px] ${
                    rankingSportFilter === tab.id
                      ? "border-primary text-primary bg-primary/5"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <span className="text-sm">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
            {/* 정렬 필터 */}
            <div className="flex border-b border-border">
              {[
                { id: "roi", label: "수익률", icon: TrendingUp },
                { id: "winRate", label: "적중률", icon: Target },
                { id: "profit", label: "수익금", icon: Coins },
              ].map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setRankingFilter(filter.id as "profit" | "winRate" | "roi")}
                  className={`flex items-center justify-center gap-2 flex-1 px-4 py-2 text-[12px] font-semibold transition-all border-b-2 -mb-[1px] ${
                    rankingFilter === filter.id
                      ? "border-primary text-primary bg-primary/5"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <filter.icon className="w-3.5 h-3.5" />
                  {filter.label}
                </button>
              ))}
            </div>
          </>
        )}

        {activeTab === "mypage" && (
          <div className="flex border-b border-border">
            {[
              { id: "predictions", label: "예측 내역" },
              { id: "stats", label: "내 통계" },
              { id: "gold", label: "골드 내역" },
              { id: "profile", label: "개인정보" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setMyPageTab(tab.id as "predictions" | "stats" | "gold" | "profile")}
                className={`flex items-center justify-center flex-1 px-4 py-2.5 text-[13px] font-semibold transition-all border-b-2 -mb-[1px] ${
                  myPageTab === tab.id
                    ? "border-primary text-primary bg-primary/5"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="space-y-2 sm:space-y-4">
        {/* Betting Tab */}
        {activeTab === "betting" && (
          <div className="space-y-2">
            {/* 오늘 날짜 표시 (블루 계열) - 콤팩트 */}
            {todayInfo && (
              <Card className="bg-accent/5 border border-accent/30 py-1.5 px-3">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-full bg-accent/10 shrink-0">
                    <Calendar className="h-3.5 w-3.5 text-accent" />
                  </div>
                  <span className="font-semibold text-[13px] text-accent">
                    {todayInfo.label}
                  </span>
                </div>
              </Card>
            )}

            {/* 로딩/에러/새로고침 상태 표시 */}
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
              <div className="flex items-center gap-2">
                {lastUpdated && (
                  <span>마지막 업데이트: {lastUpdated.toLocaleTimeString("ko-KR")}</span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={loadMatches}
                disabled={isLoading}
                className="h-7 px-2"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isLoading ? "animate-spin" : ""}`} />
                새로고침
              </Button>
            </div>

            {/* 로딩 상태 */}
            {isLoading && groupedMatches.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin mb-2" />
                <p>경기 정보를 불러오는 중...</p>
              </div>
            )}

            {/* 에러 상태 */}
            {error && (
              <div className="flex flex-col items-center justify-center py-8 text-destructive">
                <p>{error}</p>
                <Button variant="outline" size="sm" onClick={loadMatches} className="mt-2">
                  다시 시도
                </Button>
              </div>
            )}

            {/* 경기 목록 */}
            {!isLoading && !error && filteredMatches.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <p>{todayInfo ? '오늘 예정된 경기가 없습니다.' : '경기 정보를 불러올 수 없습니다.'}</p>
              </div>
            )}

            {/* 그룹화된 경기 목록 */}
            {filteredMatches.map((groupedMatch) => {
              const sportColor = sportColors[groupedMatch.sport] || sportColors['축구']
              const fillColor = sportColorFill[groupedMatch.sport] || sportColorFill['축구']
              const hasSelectionFromThisMatch = selectedBets.some(b => b.matchKey === groupedMatch.matchKey)

              return (
                <Card key={groupedMatch.matchKey} className={`overflow-hidden border-0 shadow-sm ${hasSelectionFromThisMatch ? 'ring-2 ring-primary' : ''}`}>
                  {/* Match Header */}
                  <div className="bg-accent-surface text-accent-surface-foreground px-3 py-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{SPORT_ICONS[groupedMatch.sport] || "⚽"}</span>
                      <span className="text-xs font-medium">{groupedMatch.leagueCode}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-accent-surface-foreground/90">
                      <Clock className="h-3 w-3" />
                      <span>{formatMatchTime(groupedMatch.matchTime)}</span>
                    </div>
                  </div>

                  {/* Teams */}
                  <div className="px-2 pb-1">
                    <div className="flex items-center justify-center gap-2 py-1">
                      <span className="font-bold text-sm">{groupedMatch.homeTeam}</span>
                      <span className="text-gray-400 text-xs">vs</span>
                      <span className="font-bold text-sm">{groupedMatch.awayTeam}</span>
                    </div>
                  </div>

                  {/* Game Types */}
                  <div className="px-2 pb-2 space-y-1.5">
                    {groupedMatch.games.map((game) => {
                        const isSUM = game.game_type === 'SUM' || game.game_type === 'SSUM'
                        const isOverUnder = game.game_type.includes('언더오버')
                        const isBasketball = game.sport === '농구'
                        const gameTypeLabel = gameTypeLabels[game.game_type] || game.game_type
                        const selectedBet = selectedBets.find(b => b.gameId === game.id)
                        const sportMismatch = selectedSport !== null && selectedSport !== game.sport
                        const isDisabled = sportMismatch || (hasSelectionFromThisMatch && !selectedBet)

                        // 배당률 옵션 생성 - 게임 타입별로 분기
                        let options: Array<{ value: string; label: string; odds?: number }>
                        if (isSUM) {
                          // SUM: 홀/짝
                          options = [
                            { value: 'odd', label: '홀', odds: game.odd_odds },
                            { value: 'even', label: '짝', odds: game.even_odds }
                          ]
                        } else if (isOverUnder) {
                          // 언더오버
                          options = [
                            { value: 'over', label: '오버', odds: game.over_odds },
                            { value: 'under', label: '언더', odds: game.under_odds }
                          ]
                        } else {
                          // 일반/핸디캡
                          options = [
                            { value: 'home', label: groupedMatch.homeTeam.slice(0, 4), odds: game.home_odds },
                            ...(!isBasketball ? [{ value: 'draw', label: '무', odds: game.draw_odds }] : []),
                            { value: 'away', label: groupedMatch.awayTeam.slice(0, 4), odds: game.away_odds },
                          ]
                        }

                        const isTwoColumn = isSUM || isOverUnder || isBasketball

                        return (
                          <div key={game.id} className="border rounded-lg p-1.5 bg-gray-50/50">
                            <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
                              <div className="flex items-center gap-1">
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {gameTypeLabel}
                                </Badge>
                                {/* 핸디캡: 어느 팀에게 핸디인지 표시 */}
                                {game.game_type.includes('핸디캡') && (
                                  game.handicap !== null && game.handicap !== 0 ? (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-50 text-blue-600 border-blue-200">
                                      {groupedMatch.homeTeam.slice(0, 3)} {game.handicap > 0 ? '+' : ''}{game.handicap}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-gray-50 text-gray-400 border-gray-200">
                                      핸디캡 정보 없음
                                    </Badge>
                                  )
                                )}
                                {/* 언더오버: 기준선 표시 */}
                                {game.game_type.includes('언더오버') && (
                                  game.over_under_line !== null && game.over_under_line !== undefined ? (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-50 text-purple-600 border-purple-200">
                                      기준 {game.over_under_line}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-gray-50 text-gray-400 border-gray-200">
                                      기준선 정보 없음
                                    </Badge>
                                  )
                                )}
                              </div>
                              {sportMismatch && (
                                <span className="text-[10px] text-orange-500">다른 종목</span>
                              )}
                            </div>
                            <div className={`grid gap-1 ${isTwoColumn ? 'grid-cols-2' : 'grid-cols-3'}`}>
                              {options.map((opt) => (
                                <button
                                  key={opt.value}
                                  className={`py-1 px-1.5 rounded-md text-center transition-all ${
                                    selectedBet?.selection === opt.value
                                      ? `${fillColor.bg} ${fillColor.text} border ${fillColor.border}`
                                      : "bg-white border hover:bg-gray-100"
                                  } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  onClick={() => !isDisabled && handleBetSelection(
                                    game.id,
                                    groupedMatch.matchKey,
                                    opt.value,
                                    game.sport,
                                    game.game_type,
                                    game.handicap,
                                    game.over_under_line,
                                    opt.odds
                                  )}
                                  disabled={isDisabled}
                                >
                                  <div className="text-[10px] text-gray-500 truncate">{opt.label}</div>
                                  <div className={`text-xs font-bold ${selectedBet?.selection === opt.value ? '' : 'text-gray-900'}`}>
                                    {opt.odds ? opt.odds.toFixed(2) : '-'}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                  </div>

                  {/* Selection Status */}
                  {hasSelectionFromThisMatch && (
                    <div className="px-2 pb-1.5">
                      <div className="flex items-center justify-center gap-1.5 py-1 bg-emerald-50 rounded text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" />
                        <span className="text-[10px] font-medium">선택됨</span>
                      </div>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        )}

        {/* Ranking Tab */}
        {activeTab === "ranking" && (
          <div className="space-y-2">
            {/* 내 순위 카드 */}
            {myRank && (
              <Card className="overflow-hidden border-primary/30 bg-primary/5">
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-4 h-4 text-primary" />
                    <span className="text-xs font-semibold text-primary">내 순위</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 flex items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">
                      {myRank.rank ?? '-'}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{myRank.nickname || '나'}</div>
                      <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                        <span>
                          수익률 <span className={`font-medium ${(myRank.profit_rate || 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {(myRank.profit_rate || 0) >= 0 ? '+' : ''}{(myRank.profit_rate || 0).toFixed(1)}%
                          </span>
                        </span>
                        <span>
                          적중률 <span className="font-medium text-blue-600">{(myRank.accuracy || 0).toFixed(1)}%</span>
                        </span>
                        <span>
                          {myRank.correct_predictions || 0}/{myRank.total_predictions || 0}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold ${(myRank.net_profit || 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {(myRank.net_profit || 0) >= 0 ? '+' : ''}{(myRank.net_profit || 0).toFixed(2)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">순수익</div>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* 랭킹 테이블 헤더 */}
            {rankings.length > 0 && (
              <div className="flex items-center px-3 py-1.5 text-[10px] text-muted-foreground font-medium">
                <span className="w-8 text-center">#</span>
                <span className="flex-1 ml-2">유저</span>
                <span className="w-14 text-right">수익률</span>
                <span className="w-14 text-right">적중률</span>
                <span className="w-16 text-right">순수익</span>
              </div>
            )}

            {isLoadingRankings ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : rankings.length === 0 ? (
              <div className="text-center py-8">
                <Trophy className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-muted-foreground text-sm">아직 랭킹 데이터가 없습니다.</p>
                <p className="text-muted-foreground/60 text-xs mt-1">예측에 참여하고 랭킹에 도전해보세요!</p>
              </div>
            ) : (
              rankings.map((user) => {
                const rank = user.rank
                const isTop3 = rank <= 3
                const medalColors = ["text-yellow-500", "text-gray-400", "text-amber-600"]
                const isFollowed = followedUsers.has(user.user_id)
                const isFollowLoading = followLoading.has(user.user_id)
                const streakText = user.current_streak > 0
                  ? `${user.current_streak}연승`
                  : user.current_streak < 0
                    ? `${Math.abs(user.current_streak)}연패`
                    : ''

                return (
                  <Card
                    key={user.user_id}
                    className={`overflow-hidden transition-all hover:shadow-md ${isTop3 ? "border-l-4" : ""}`}
                    style={
                      isTop3 ? { borderLeftColor: rank === 1 ? "#EAB308" : rank === 2 ? "#9CA3AF" : "#D97706" } : {}
                    }
                  >
                    <div className="p-2.5 space-y-2">
                      {/* 1행: 순위 + 닉네임 + 팔로우 */}
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-7 h-7 flex items-center justify-center rounded-full font-bold text-xs shrink-0 ${
                            isTop3 ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {isTop3 ? <Trophy className={`w-3.5 h-3.5 ${medalColors[rank - 1]}`} /> : rank}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-sm truncate">{user.nickname}</span>
                            {streakText && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                                user.current_streak > 0
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-red-100 text-red-700'
                              }`}>
                                🔥{streakText}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {user.correct_predictions}/{user.total_predictions}적중
                            {user.best_win_streak > 1 && (
                              <span className="ml-1.5 text-amber-600">최고 {user.best_win_streak}연승</span>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant={isFollowed ? "outline" : "default"}
                          onClick={() => handleFollow(user.user_id)}
                          disabled={isFollowLoading}
                          className={`h-7 px-3 text-xs rounded-full shrink-0 ${
                            isFollowed
                              ? "text-muted-foreground hover:text-red-500 hover:border-red-300"
                              : "bg-gray-900 text-white hover:bg-gray-800"
                          }`}
                        >
                          {isFollowLoading ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : isFollowed ? '팔로잉' : '팔로우'}
                        </Button>
                      </div>
                      {/* 2행: 수익률 / 적중률 / 순수익 */}
                      <div className="flex items-center gap-1 ml-9">
                        <div className="flex-1 text-center px-2 py-1 bg-muted/50 rounded">
                          <div className={`text-xs font-bold ${
                            (user.profit_rate || 0) >= 0 ? 'text-emerald-600' : 'text-red-500'
                          }`}>
                            {(user.profit_rate || 0) >= 0 ? '+' : ''}{(user.profit_rate || 0).toFixed(1)}%
                          </div>
                          <div className="text-[10px] text-muted-foreground">수익률</div>
                        </div>
                        <div className="flex-1 text-center px-2 py-1 bg-muted/50 rounded">
                          <div className="text-xs font-bold text-blue-600">
                            {(user.accuracy || 0).toFixed(1)}%
                          </div>
                          <div className="text-[10px] text-muted-foreground">적중률</div>
                        </div>
                        <div className="flex-1 text-center px-2 py-1 bg-muted/50 rounded">
                          <div className={`text-xs font-bold ${
                            (user.net_profit || 0) >= 0 ? 'text-emerald-600' : 'text-red-500'
                          }`}>
                            {(user.net_profit || 0) >= 0 ? '+' : ''}{(user.net_profit || 0).toFixed(2)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">순수익</div>
                        </div>
                      </div>
                    </div>
                  </Card>
                )
              })
            )}
          </div>
        )}


        {/* My Page Tab */}
        {activeTab === "mypage" && (
          <div className="space-y-4">
            {myPageTab === "predictions" && (
              <div className="space-y-2">
                {isLoadingHistory ? (
                  <div className="flex justify-center items-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : predictionHistory.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">예측 내역이 없습니다.</p>
                ) : (
                  predictionHistory.map((pred) => {
                    return (
                  <Card key={pred.id} className="overflow-hidden border-0 shadow-sm">
                    <div
                      className={`p-2 text-xs flex items-center justify-between ${
                        pred.sport === "축구"
                          ? "bg-rose-50"
                          : pred.sport === "야구"
                            ? "bg-blue-50"
                            : pred.sport === "농구"
                              ? "bg-orange-50"
                              : "bg-purple-50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-semibold ${
                            pred.sport === "축구"
                              ? "text-rose-700"
                              : pred.sport === "야구"
                                ? "text-blue-700"
                                : pred.sport === "농구"
                                  ? "text-orange-700"
                                  : "text-purple-700"
                          }`}
                        >
                          {pred.sport === "축구"
                            ? "⚽"
                            : pred.sport === "야구"
                              ? "⚾"
                              : pred.sport === "농구"
                                ? "🏀"
                                : "🏐"}{" "}
                          {pred.sport}
                        </span>
                        <span className="text-gray-500">{pred.date}</span>
                      </div>
                      <div
                        className={`text-xs font-semibold px-2 py-0.5 rounded ${
                          pred.status === "win"
                            ? "bg-green-100 text-green-700"
                            : pred.status === "lose"
                              ? "bg-red-100 text-red-700"
                              : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {pred.status === "win" ? "적중" : pred.status === "lose" ? "미적중" : "대기중"}
                      </div>
                    </div>
                    <div className="p-3 space-y-2">
                      {pred.matches.map((match: { league: string; home: string; away: string; selection: string; odds: number; result: string }, idx: number) => {
                        const sportKey = pred.sport === "축구" ? "soccer" : pred.sport === "야구" ? "baseball" : pred.sport === "농구" ? "basketball" : "volleyball"
                        const fillColor = sportColorFill[sportKey]
                        const hasDrawOdds = pred.sport === "축구"

                        return (
                          <div key={idx} className="bg-white rounded-lg border overflow-hidden">
                            <div className="px-3 py-1.5 bg-gray-100 flex justify-between text-xs text-gray-600">
                              <span>{match.league}</span>
                            </div>
                            <div className={`p-2 grid ${hasDrawOdds ? 'grid-cols-3' : 'grid-cols-2'} gap-1`}>
                              <div
                                className={`rounded-lg p-2 text-center ${
                                  match.selection === "홈팀"
                                    ? `${fillColor.bg} ${fillColor.border} border`
                                    : "bg-gray-50"
                                }`}
                              >
                                <div className={`text-xs truncate ${match.selection === "홈팀" ? fillColor.text : "text-gray-600"}`}>
                                  {match.home}
                                </div>
                                <div className={`font-bold text-sm ${match.selection === "홈팀" ? fillColor.text : "text-gray-900"}`}>
                                  {match.odds}
                                </div>
                              </div>
                              {hasDrawOdds && (
                                <div
                                  className={`rounded-lg p-2 text-center ${
                                    match.selection === "무"
                                      ? `${fillColor.bg} ${fillColor.border} border`
                                      : "bg-gray-50"
                                  }`}
                                >
                                  <div className={`text-xs ${match.selection === "무" ? fillColor.text : "text-gray-600"}`}>
                                    무
                                  </div>
                                  <div className={`font-bold text-sm ${match.selection === "무" ? fillColor.text : "text-gray-900"}`}>
                                    {match.odds}
                                  </div>
                                </div>
                              )}
                              <div
                                className={`rounded-lg p-2 text-center ${
                                  match.selection === "원정팀"
                                    ? `${fillColor.bg} ${fillColor.border} border`
                                    : "bg-gray-50"
                                }`}
                              >
                                <div className={`text-xs truncate ${match.selection === "원정팀" ? fillColor.text : "text-gray-600"}`}>
                                  {match.away}
                                </div>
                                <div className={`font-bold text-sm ${match.selection === "원정팀" ? fillColor.text : "text-gray-900"}`}>
                                  {match.odds}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                      <div className="mt-3 pt-3 border-t flex justify-between items-center">
                        <div className="text-xs text-gray-600">
                          배팅금: {pred.stake.toLocaleString()}G | 총배당: {pred.totalOdds}배
                        </div>
                        <div
                          className={`text-sm font-semibold ${
                            pred.status === "win"
                              ? "text-green-600"
                              : pred.status === "lose"
                                ? "text-red-600"
                                : "text-gray-600"
                          }`}
                        >
                          {pred.status === "pending"
                            ? "대기중"
                            : `${pred.profit > 0 ? "+" : ""}${pred.profit.toLocaleString()}G`}
                        </div>
                      </div>
                    </div>
                  </Card>
                  )
                  })
                )}
              </div>
            )}
            {myPageTab === "stats" && (
              <div className="space-y-3">
                {isLoadingMyStats ? (
                  <div className="flex justify-center items-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !myStats?.summary ? (
                  <div className="text-center py-8">
                    <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
                    <p className="text-muted-foreground text-sm">아직 통계 데이터가 없습니다.</p>
                    <p className="text-muted-foreground/60 text-xs mt-1">예측에 참여하면 통계가 생성됩니다.</p>
                  </div>
                ) : (
                  <>
                    {/* 전체 통계 요약 */}
                    <Card className="overflow-hidden">
                      <div className="p-3 border-b bg-muted/30">
                        <div className="flex items-center gap-2">
                          <Target className="w-4 h-4 text-primary" />
                          <span className="text-sm font-semibold">전체 통계</span>
                        </div>
                      </div>
                      <div className="p-3">
                        {/* 주요 지표 3열 */}
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <div className="text-center p-2 bg-muted/40 rounded-lg">
                            <div className={`text-lg font-bold ${
                              (myStats.summary.profit_rate || 0) >= 0 ? 'text-emerald-600' : 'text-red-500'
                            }`}>
                              {(myStats.summary.profit_rate || 0) >= 0 ? '+' : ''}{(myStats.summary.profit_rate || 0).toFixed(1)}%
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">수익률</div>
                          </div>
                          <div className="text-center p-2 bg-muted/40 rounded-lg">
                            <div className="text-lg font-bold text-blue-600">
                              {(myStats.summary.accuracy || 0).toFixed(1)}%
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">적중률</div>
                          </div>
                          <div className="text-center p-2 bg-muted/40 rounded-lg">
                            <div className={`text-lg font-bold ${
                              (myStats.summary.net_profit || 0) >= 0 ? 'text-emerald-600' : 'text-red-500'
                            }`}>
                              {(myStats.summary.net_profit || 0) >= 0 ? '+' : ''}{(myStats.summary.net_profit || 0).toFixed(2)}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">순수익</div>
                          </div>
                        </div>
                        {/* 세부 정보 */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">총 예측</span>
                            <span className="font-medium">{myStats.summary.total_predictions}건</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">적중/미적중</span>
                            <span className="font-medium">
                              <span className="text-emerald-600">{myStats.summary.correct_predictions}</span>
                              /
                              <span className="text-red-500">{myStats.summary.wrong_predictions}</span>
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">현재</span>
                            <span className={`font-medium ${
                              (myStats.summary.current_streak || 0) > 0 ? 'text-emerald-600' : (myStats.summary.current_streak || 0) < 0 ? 'text-red-500' : ''
                            }`}>
                              {myStats.summary.current_streak > 0
                                ? `${myStats.summary.current_streak}연승 🔥`
                                : myStats.summary.current_streak < 0
                                  ? `${Math.abs(myStats.summary.current_streak)}연패`
                                  : '-'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">최고 연승</span>
                            <span className="font-medium text-amber-600">
                              {myStats.summary.best_win_streak > 0 ? `${myStats.summary.best_win_streak}연승` : '-'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Card>

                    {/* 종목별 통계 */}
                    {myStats.sports.length > 0 && (
                      <Card className="overflow-hidden">
                        <div className="p-3 border-b bg-muted/30">
                          <div className="flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 text-primary" />
                            <span className="text-sm font-semibold">종목별 통계</span>
                          </div>
                        </div>
                        <div className="divide-y">
                          {myStats.sports.map((sport: any) => {
                            const icon = SPORT_ICONS[sport.sport] || '🎯'
                            return (
                              <div key={sport.sport} className="p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-sm">{icon}</span>
                                    <span className="text-sm font-semibold">{sport.sport}</span>
                                    <span className="text-[10px] text-muted-foreground ml-1">
                                      {sport.correct_predictions}/{sport.total_predictions}적중
                                    </span>
                                  </div>
                                  {sport.current_streak !== 0 && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                      sport.current_streak > 0
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-red-100 text-red-700'
                                    }`}>
                                      {sport.current_streak > 0 ? `${sport.current_streak}연승` : `${Math.abs(sport.current_streak)}연패`}
                                    </span>
                                  )}
                                </div>
                                <div className="grid grid-cols-3 gap-1.5">
                                  <div className="text-center px-2 py-1.5 bg-muted/40 rounded">
                                    <div className={`text-xs font-bold ${
                                      (sport.profit_rate || 0) >= 0 ? 'text-emerald-600' : 'text-red-500'
                                    }`}>
                                      {(sport.profit_rate || 0) >= 0 ? '+' : ''}{(sport.profit_rate || 0).toFixed(1)}%
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">수익률</div>
                                  </div>
                                  <div className="text-center px-2 py-1.5 bg-muted/40 rounded">
                                    <div className="text-xs font-bold text-blue-600">
                                      {(sport.accuracy || 0).toFixed(1)}%
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">적중률</div>
                                  </div>
                                  <div className="text-center px-2 py-1.5 bg-muted/40 rounded">
                                    <div className={`text-xs font-bold ${
                                      (sport.net_profit || 0) >= 0 ? 'text-emerald-600' : 'text-red-500'
                                    }`}>
                                      {(sport.net_profit || 0) >= 0 ? '+' : ''}{(sport.net_profit || 0).toFixed(2)}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">순수익</div>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </Card>
                    )}
                  </>
                )}
              </div>
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
                    <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center">
                      <User className="w-10 h-10 text-gray-400" />
                    </div>
                    <div className="w-full space-y-3">
                      <div>
                        <label className="text-xs text-gray-500">닉네임</label>
                        <Input placeholder="닉네임을 입력하세요" className="mt-1" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">이메일</label>
                        <Input type="email" placeholder="이메일을 입력하세요" className="mt-1" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">소개</label>
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

      {/* Sticky Betting Slip - stays at bottom while scrolling */}
      {selectedBets.length > 0 && activeTab === "betting" && (
        <div className="sticky bottom-0 z-40 pt-2 sm:pt-4 -mx-0 bg-gradient-to-t from-background via-background to-transparent pb-0">
          <Card className="rounded-lg shadow-lg border bg-card">
            <div
              className="flex items-center justify-between p-2 sm:p-3 cursor-pointer"
              onClick={() => setIsSlipExpanded(!isSlipExpanded)}
            >
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-medium text-xs sm:text-sm">{selectedBets.length}경기 선택</span>
                {selectedBets.length > 0 && selectedBets[0].sport && (
                  <span className="text-[10px] sm:text-xs text-muted-foreground bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                    {selectedBets[0].sport === "축구" ? "⚽ 축구" : "🏀 농구"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                {isSlipExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
              </div>
            </div>

            {isSlipExpanded && (
              <div className="border-t px-3 py-2">
                {/* 전체 삭제 버튼 */}
                <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-border">
                  <span className="text-xs text-muted-foreground">선택한 경기 {selectedBets.length}개</span>
                  <button
                    onClick={clearAllBets}
                    className="text-xs text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 font-medium"
                  >
                    전체 삭제
                  </button>
                </div>

                {/* 경기 목록 - 컴팩트 디자인 */}
                <div className="divide-y divide-gray-100 dark:divide-border">
                  {selectedBets.map((bet) => {
                    const groupedMatch = groupedMatches.find((m) => m.matchKey === bet.matchKey)
                    const game = groupedMatch?.games.find((g) => g.id === bet.gameId)
                    if (!groupedMatch || !game) return null
                    return (
                      <div key={bet.gameId} className="py-2 relative group">
                        {/* 삭제 버튼 */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            removeBet(bet.gameId)
                          }}
                          className="absolute top-2 right-0 w-5 h-5 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 flex items-center justify-center transition-colors"
                          title="삭제"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        {/* 리그 & 시간 */}
                        <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-muted-foreground mb-0.5 flex-wrap">
                          <span>{groupedMatch.leagueCode}</span>
                          <span className="text-gray-300 dark:text-gray-600">|</span>
                          <span>{formatMatchTime(groupedMatch.matchTime)}</span>
                          <span className="text-gray-300 dark:text-gray-600">|</span>
                          <span className="text-primary">{gameTypeLabels[bet.gameType] || bet.gameType}</span>
                          {/* 핸디캡 정보 */}
                          {bet.gameType.includes('핸디캡') && bet.handicap !== null && (
                            <span className="text-blue-600 font-medium">
                              ({groupedMatch.homeTeam.slice(0, 4)} {bet.handicap > 0 ? '+' : ''}{bet.handicap})
                            </span>
                          )}
                          {/* 언더오버 기준선 */}
                          {bet.gameType.includes('언더오버') && bet.overUnderLine != null && (
                            <span className="text-purple-600 font-medium">
                              (기준 {bet.overUnderLine})
                            </span>
                          )}
                        </div>
                        {/* 팀 */}
                        <div className="text-sm text-gray-800 dark:text-foreground mb-1 pr-6">
                          {groupedMatch.homeTeam} vs {groupedMatch.awayTeam}
                        </div>
                        {/* 선택 & 배당률 */}
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-primary font-medium">
                            선택: {bet.selection === "home" || bet.selection === "1"
                              ? groupedMatch.homeTeam
                              : bet.selection === "away" || bet.selection === "2"
                                ? groupedMatch.awayTeam
                                : bet.selection === "draw" || bet.selection === "X"
                                  ? "무승부"
                                  : bet.selection === "over"
                                    ? "오버"
                                    : bet.selection === "under"
                                      ? "언더"
                                      : bet.selection === "odd"
                                        ? "홀"
                                        : bet.selection === "even"
                                          ? "짝"
                                          : bet.selection}
                            {bet.handicap !== null && ` (${bet.handicap > 0 ? '+' : ''}${bet.handicap})`}
                          </span>
                          {bet.odds && (
                            <span className="text-sm font-bold text-emerald-600">
                              {bet.odds.toFixed(2)}배
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* 베팅 금액 입력 */}
                <div className="pt-3 mt-2 border-t border-gray-100 dark:border-border space-y-3">
                  {/* 보유 볼 표시 */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">보유 볼</span>
                    <span className="font-medium flex items-center gap-1">
                      <Coins className="w-4 h-4 text-yellow-500" />
                      {userBalls.toLocaleString()}
                    </span>
                  </div>

                  {/* 베팅 금액 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">베팅 금액</span>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={betAmount}
                          onChange={(e) => setBetAmount(Math.max(0, Math.min(userBalls, parseInt(e.target.value) || 0)))}
                          className="w-24 h-8 text-right text-sm"
                          min={0}
                          max={userBalls}
                        />
                        <span className="text-sm text-muted-foreground">볼</span>
                      </div>
                    </div>
                    {/* 빠른 금액 선택 버튼 */}
                    <div className="flex gap-1">
                      {[1, 3, 5, 10].map((amount) => (
                        <button
                          key={amount}
                          onClick={() => setBetAmount(Math.min(amount, userBalls))}
                          className={`flex-1 py-1 text-xs rounded border transition-colors ${
                            betAmount === amount
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-muted/50 hover:bg-muted border-border'
                          } ${amount > userBalls ? 'opacity-50' : ''}`}
                          disabled={amount > userBalls}
                        >
                          {amount}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 배당률 & 예상 획득 점수 */}
                  <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">총 배당률</span>
                      <span className="font-bold text-primary">{totalOdds.toFixed(2)}배</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">예상 획득</span>
                      <span className="font-bold text-lg text-emerald-600 flex items-center gap-1">
                        <Coins className="w-4 h-4 text-yellow-500" />
                        {expectedReturn.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* 예측하기 버튼 */}
                  <Button
                    className="w-full bg-gray-900 hover:bg-gray-800 dark:bg-primary dark:hover:bg-primary/90 h-11"
                    onClick={handleSubmitPrediction}
                    disabled={isSubmittingPrediction || selectedBets.length === 0 || betAmount <= 0}
                  >
                    {isSubmittingPrediction ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <span className="flex items-center gap-2">
                        <Target className="w-4 h-4" />
                        {selectedBets.length}경기 {betAmount.toLocaleString()}볼 예측하기
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* 알림 모달 */}
      <Dialog open={alertModal.isOpen} onOpenChange={(open) => setAlertModal(prev => ({ ...prev, isOpen: open }))}>
        <DialogContent className="sm:max-w-[400px]" showCloseButton={false}>
          <DialogHeader className="items-center text-center">
            <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
              alertModal.type === 'error'
                ? 'bg-red-100 dark:bg-red-900/30'
                : alertModal.type === 'warning'
                  ? 'bg-amber-100 dark:bg-amber-900/30'
                  : 'bg-emerald-100 dark:bg-emerald-900/30'
            }`}>
              {alertModal.type === 'error' ? (
                <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
              ) : alertModal.type === 'warning' ? (
                <AlertCircle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
              ) : (
                <Circle className="h-8 w-8 text-emerald-600 dark:text-emerald-400 fill-emerald-600 dark:fill-emerald-400" />
              )}
            </div>
            <DialogTitle className={`text-xl ${
              alertModal.type === 'error'
                ? 'text-red-600 dark:text-red-400'
                : alertModal.type === 'warning'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
            }`}>
              {alertModal.title}
            </DialogTitle>
            <DialogDescription className="text-center text-base whitespace-pre-line pt-2">
              {alertModal.message}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center pt-4">
            <Button
              onClick={() => setAlertModal(prev => ({ ...prev, isOpen: false }))}
              className={`w-full sm:w-auto px-8 ${
                alertModal.type === 'error'
                  ? 'bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700'
                  : alertModal.type === 'warning'
                    ? 'bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700'
                    : 'bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700'
              }`}
            >
              확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

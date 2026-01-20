"use client"

import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
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
} from "lucide-react"
import { fetchMatchesWithOdds } from "@/lib/api/betting-api"
import type { Match, SportType } from "@/lib/api/types"

// Sport colors definition
const sportColors: Record<string, { bg: string; text: string; border: string }> = {
  soccer: { bg: "bg-gradient-to-r from-rose-50 to-pink-50", text: "text-rose-900", border: "border-rose-200" },
  baseball: { bg: "bg-gradient-to-r from-blue-50 to-indigo-50", text: "text-blue-900", border: "border-blue-200" },
  basketball: {
    bg: "bg-gradient-to-r from-orange-50 to-amber-50",
    text: "text-orange-900",
    border: "border-orange-200",
  },
  volleyball: {
    bg: "bg-gradient-to-r from-purple-50 to-violet-50",
    text: "text-purple-900",
    border: "border-purple-200",
  },
}

const sportColorFill: Record<string, { bg: string; text: string; border: string }> = {
  soccer: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  baseball: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  basketball: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  volleyball: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
}

// matches 데이터는 이제 API에서 가져옵니다 (betting-api.ts 참조)

// Mock goldTransactions data combining purchase and charge history with cumulative balance
// TODO: Replace with actual token_transactions API
const goldTransactions = [
  { id: 1, type: "charge", amount: 10000, description: "골드 충전", date: "2024-01-15 14:30", balance: 10000 },
  { id: 2, type: "purchase", amount: -500, description: "분석가A 예측 구매", date: "2024-01-15 15:20", balance: 9500 },
  { id: 3, type: "purchase", amount: -500, description: "분석가B 예측 구매", date: "2024-01-15 16:45", balance: 9000 },
  { id: 4, type: "charge", amount: 5000, description: "골드 충전", date: "2024-01-16 10:00", balance: 14000 },
  {
    id: 5,
    type: "purchase",
    amount: -1000,
    description: "분석가C 예측 구매",
    date: "2024-01-16 11:30",
    balance: 13000,
  },
]


// SubscriptionFeedContent Component
const SubscriptionFeedContent = ({
  expandedPosts,
  setExpandedPosts,
  purchasedPosts,
  handlePurchase,
  sportFilter,
  matches,
}: {
  expandedPosts: Set<string>
  setExpandedPosts: React.Dispatch<React.SetStateAction<Set<string>>>
  purchasedPosts: Set<string>
  handlePurchase: (postId: string) => void
  sportFilter: "all" | "soccer" | "baseball" | "basketball" | "volleyball"
  matches: Match[]
}) => {
  const [visibleCount, setVisibleCount] = useState(10)
  const loaderRef = useRef<HTMLDivElement>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [unfollowedUsers, setUnfollowedUsers] = useState<Set<string>>(new Set())
  const [feedPosts, setFeedPosts] = useState<any[]>([])
  const [isLoadingFeed, setIsLoadingFeed] = useState(false)

  // Load feed posts from API
  useEffect(() => {
    const loadFeed = async () => {
      setIsLoadingFeed(true)
      try {
        const response = await fetch(`/api/predictions/feed?sport=${sportFilter}&limit=50`)
        if (!response.ok) {
          throw new Error('Failed to load feed')
        }
        const data = await response.json()
        setFeedPosts(data.predictions || [])
      } catch (error) {
        console.error('Failed to load feed:', error)
      } finally {
        setIsLoadingFeed(false)
      }
    }
    loadFeed()
  }, [sportFilter])

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setVisibleCount((prev) => prev + 10)
        }
      })
    })

    if (loaderRef.current) {
      observer.observe(loaderRef.current)
    }

    return () => {
      if (loaderRef.current) {
        observer.unobserve(loaderRef.current)
      }
    }
  }, [])

  const togglePostExpansion = (postId: string) => {
    setExpandedPosts((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(postId)) {
        newSet.delete(postId)
      } else {
        newSet.add(postId)
      }
      return newSet
    })
  }

  const handleUnfollow = (userName: string) => {
    setUnfollowedUsers((prev) => {
      const newSet = new Set(prev)
      newSet.add(userName)
      return newSet
    })
    setOpenMenuId(null)
  }

  const handleReport = () => {
    alert("신고가 접수되었습니다.")
    setOpenMenuId(null)
  }

  const formatRelativeTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    
    if (diffHours < 1) return '방금 전'
    if (diffHours < 24) return `${diffHours}시간 전`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}일 전`
  }

  const filteredPosts = feedPosts.filter((post) => {
    // Sport filter is already applied by API, but we can double-check here
    const sportMatch =
      sportFilter === "all" ||
      post.predictions.some((pred) => {
        const match = matches.find((m) => m.id === pred.matchId)
        return match?.sport === sportFilter
      })

    const notUnfollowed = !unfollowedUsers.has(post.user?.name)

    return sportMatch && notUnfollowed
  })

  const visiblePosts = filteredPosts.slice(0, visibleCount)

  const sportIcons: Record<string, string> = {
    soccer: "⚽",
    baseball: "⚾",
    basketball: "🏀",
    volleyball: "🏐",
  }

  return (
    <div className="flex flex-col gap-2">
      {visiblePosts.map((post) => {
        const isPurchased = purchasedPosts.has(post.id)
        const isExpanded = expandedPosts.has(post.id)
        const mainSport = matches.find((m) => m.id === post.predictions[0]?.matchId)?.sport || "soccer"
        const sportColor = sportColors[mainSport]
        const totalOdds = post.predictions.reduce((acc, p) => acc * p.odds, 1).toFixed(2)

        return (
          <Card key={post.id} className="overflow-hidden border shadow-sm m-0">
            {/* Sport header band */}
            <div className={`${sportColor.bg} px-3 py-1.5 flex items-center justify-between`}>
              <div className="flex items-center gap-1.5">
                <span>{sportIcons[mainSport]}</span>
                <span className={`text-xs font-medium ${sportColor.text}`}>
                  {mainSport === "soccer"
                    ? "축구"
                    : mainSport === "baseball"
                      ? "야구"
                      : mainSport === "basketball"
                        ? "농구"
                        : "배구"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${sportColor.text}`}>{post.predictions.length}경기</span>
                <span className={`text-xs font-bold ${sportColor.text}`}>{totalOdds}배</span>
              </div>
            </div>

            {/* User info section */}
            <div className="bg-white px-3 py-2">
              <div className="flex items-center gap-2">
                <img
                  src={post.user.avatar || "/placeholder.svg"}
                  alt={post.user.name}
                  className="h-9 w-9 rounded-full object-cover bg-gray-200"
                />
                  <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-sm whitespace-nowrap">{post.user?.name || '익명'}</span>
                    <span className="text-xs text-gray-400 whitespace-nowrap">{formatRelativeTime(post.timestamp)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-orange-600 whitespace-nowrap">
                      수익률 {post.user.roi}%
                    </span>
                    <span className="text-xs font-medium text-emerald-600 whitespace-nowrap">
                      적중률 {post.user.winRate}%
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {isPurchased ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 rounded-full px-3 text-xs bg-transparent"
                      onClick={() => togglePostExpansion(post.id)}
                    >
                      {isExpanded ? "접기" : "펼치기"}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="h-6 rounded-full bg-gray-900 px-3 text-xs hover:bg-gray-800"
                      onClick={() => handlePurchase(post.id)}
                    >
                      구매하기
                    </Button>
                  )}
                  <DropdownMenu
                    open={openMenuId === post.id}
                    onOpenChange={(open) => setOpenMenuId(open ? post.id : null)}
                  >
                    <DropdownMenuTrigger asChild>
                      <button className="p-1 hover:bg-gray-100 rounded">
                        <MoreVertical className="h-4 w-4 text-gray-400" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-32">
                      <DropdownMenuItem onClick={handleReport}>신고하기</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleUnfollow(post.user.name)}>언팔로우하기</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>

            {/* Expanded predictions */}
            {isPurchased && isExpanded && (
              <div className="border-t bg-gray-50 p-3 space-y-2">
                {post.predictions.map((pred, idx) => {
                  const match = matches.find((m) => m.id === pred.matchId)
                  if (!match) return null
                  const fillColor = sportColorFill[match.sport]

                  return (
                    <div key={idx} className="bg-white rounded-lg border overflow-hidden">
                      <div className="px-3 py-1.5 bg-gray-100 flex justify-between text-xs text-gray-600">
                        <span>{match.league}</span>
                        <span>
                          {match.date} {match.time}
                        </span>
                      </div>
                      <div className="p-2 grid grid-cols-3 gap-1">
                        <div
                          className={`rounded-lg p-2 text-center ${pred.selection === "home" ? `${fillColor.bg} ${fillColor.border} border` : "bg-gray-50"}`}
                        >
                          <div
                            className={`text-xs truncate ${pred.selection === "home" ? fillColor.text : "text-gray-600"}`}
                          >
                            {match.home}
                          </div>
                          <div className={`font-bold ${pred.selection === "home" ? fillColor.text : "text-gray-900"}`}>
                            {match.homeOdds}
                          </div>
                        </div>
                        {match.drawOdds > 0 && (
                          <div
                            className={`rounded-lg p-2 text-center ${pred.selection === "draw" ? `${fillColor.bg} ${fillColor.border} border` : "bg-gray-50"}`}
                          >
                            <div className={`text-xs ${pred.selection === "draw" ? fillColor.text : "text-gray-600"}`}>
                              무
                            </div>
                            <div
                              className={`font-bold ${pred.selection === "draw" ? fillColor.text : "text-gray-900"}`}
                            >
                              {match.drawOdds}
                            </div>
                          </div>
                        )}
                        <div
                          className={`rounded-lg p-2 text-center ${pred.selection === "away" ? `${fillColor.bg} ${fillColor.border} border` : "bg-gray-50"}`}
                        >
                          <div
                            className={`text-xs truncate ${pred.selection === "away" ? fillColor.text : "text-gray-600"}`}
                          >
                            {match.away}
                          </div>
                          <div className={`font-bold ${pred.selection === "away" ? fillColor.text : ""}`}>
                            {match.awayOdds}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {post.analysis && (
                  <div className="mt-3 p-3 bg-white rounded-lg border">
                    <div className="text-xs font-medium text-gray-500 mb-1">분석</div>
                    <p className="text-sm text-gray-700">{post.analysis}</p>
                  </div>
                )}
              </div>
            )}
          </Card>
        )
      })}
      <div ref={loaderRef} className="h-4" />
    </div>
  )
}

// Main BettingPage Component
export default function BettingPage() {
  const [activeTab, setActiveTab] = useState<"betting" | "ranking" | "feed" | "mypage">("betting")
  const [sportFilter, setSportFilter] = useState<"all" | "soccer" | "baseball" | "basketball" | "volleyball">("all")
  const [selectedBets, setSelectedBets] = useState<
    { matchId: string; selection: string; odds: number; sport: string }[]
  >([])
  const [betAmount, setBetAmount] = useState("")
  const [isSlipExpanded, setIsSlipExpanded] = useState(false)
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set())
  const [purchasedPosts, setPurchasedPosts] = useState<Set<string>>(new Set())
  const [followedUsers, setFollowedUsers] = useState<Set<number>>(new Set())
  const [rankingFilter, setRankingFilter] = useState<"profit" | "winRate" | "roi">("profit")
  const [myPageTab, setMyPageTab] = useState<"predictions" | "gold" | "profile">("predictions")

  // API 데이터 상태
  const [matches, setMatches] = useState<Match[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Rankings 상태
  const [rankings, setRankings] = useState<any[]>([])
  const [isLoadingRankings, setIsLoadingRankings] = useState(false)

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

  // 경기 데이터 로드
  const loadMatches = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await fetchMatchesWithOdds()
      setMatches(data)
      setLastUpdated(new Date())
    } catch (err) {
      setError("경기 데이터를 불러오는데 실패했습니다.")
      console.error("Failed to fetch matches:", err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // 컴포넌트 마운트 시 데이터 로드
  useEffect(() => {
    loadMatches()
  }, [loadMatches])

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
        profit: 'profit',
        winRate: 'accuracy',
        roi: 'roi',
      }
      const response = await fetch(`/api/rankings?sort=${sortMap[rankingFilter] || 'profit'}&limit=20`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('Rankings API error:', errorData)
        setRankings([])
        return
      }
      const data = await response.json()
      setRankings(data?.rankings || [])
    } catch (err) {
      console.error('Failed to load rankings:', err)
      setRankings([])
    } finally {
      setIsLoadingRankings(false)
    }
  }, [rankingFilter])

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

  // Load rankings when ranking tab is active or rankingFilter changes
  useEffect(() => {
    if (activeTab === 'ranking') {
      loadRankings()
    }
  }, [activeTab, rankingFilter, loadRankings])

  // Load prediction history when mypage tab is active
  useEffect(() => {
    if (activeTab === 'mypage' && myPageTab === 'predictions') {
      loadPredictionHistory()
    }
  }, [activeTab, myPageTab, loadPredictionHistory])

  // 알림 모달 표시 헬퍼 함수
  const showAlert = (type: 'error' | 'warning' | 'success', title: string, message: string) => {
    setAlertModal({ isOpen: true, type, title, message })
  }

  // 예측 제출 함수
  const handleSubmitPrediction = async () => {
    if (selectedBets.length === 0) {
      showAlert('warning', '경기를 선택해주세요', '예측할 경기를 먼저 선택해주세요.')
      return
    }

    if (!betAmount || Number(betAmount) <= 0) {
      showAlert('warning', '볼을 입력해주세요', '사용할 볼 수를 입력해주세요.')
      return
    }

    const amount = Number(betAmount)

    // 1~10 범위 검증
    if (amount > 10) {
      showAlert('error', '볼 한도 초과', `하루에 사용할 수 있는 볼은 최대 10개입니다.\n현재 입력: ${amount}볼`)
      return
    }

    if (amount < 1) {
      showAlert('warning', '최소 볼 필요', '최소 1볼 이상 사용해야 합니다.')
      return
    }

    if (!Number.isInteger(amount)) {
      showAlert('warning', '정수만 입력 가능', '볼은 정수 단위로만 사용할 수 있습니다.')
      return
    }

    setIsSubmittingPrediction(true)
    try {
      // 각 선택된 베팅에 대해 예측 저장
      for (const bet of selectedBets) {
        const res = await fetch('/api/prediction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            match_id: bet.matchId,
            prediction_type: 'full_time_result',
            predicted_value: bet.selection,
            odds_at_prediction: bet.odds,
            points_wagered: amount,
          }),
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || '예측 저장에 실패했습니다.')
        }
      }

      showAlert('success', '예측 완료!', `${selectedBets.length}경기 예측이 성공적으로 등록되었습니다.`)

      // 상태 초기화
      setSelectedBets([])
      setBetAmount('')
      setIsSlipExpanded(false)
      setSportFilter('all')
    } catch (error: any) {
      showAlert('error', '예측 실패', error.message || '예측 저장 중 오류가 발생했습니다.')
    } finally {
      setIsSubmittingPrediction(false)
    }
  }

  const handleBetSelection = (matchId: string, selection: string, odds: number, sport: string) => {
    const existingIndex = selectedBets.findIndex((b) => b.matchId === matchId)

    if (existingIndex >= 0) {
      // 이미 선택된 경기인 경우
      if (selectedBets[existingIndex].selection === selection) {
        // 같은 선택을 다시 클릭하면 취소
        const newBets = selectedBets.filter((b) => b.matchId !== matchId)
        setSelectedBets(newBets)
        // 모든 베팅이 취소되면 필터 리셋
        if (newBets.length === 0) {
          setSportFilter("all")
        }
      } else {
        // 다른 선택으로 변경 (같은 경기, 다른 결과)
        const newBets = [...selectedBets]
        newBets[existingIndex] = { matchId, selection, odds, sport }
        setSelectedBets(newBets)
      }
    } else {
      // 새로운 경기 추가
      // 종목 락인 검증: 첫 경기 선택 시 해당 종목에 락인
      if (selectedBets.length === 0) {
        // 첫 경기 선택 - 종목 락인
        setSportFilter(sport as "all" | "soccer" | "baseball" | "basketball" | "volleyball")
        setSelectedBets([{ matchId, selection, odds, sport }])
      } else {
        // 추가 경기 선택 - 종목 검증
        const lockedSport = selectedBets[0].sport
        if (sport !== lockedSport) {
          // 다른 종목 선택 시 경고 및 차단
          const sportLabels: Record<string, string> = {
            soccer: "축구",
            baseball: "야구",
            basketball: "농구",
            volleyball: "배구",
          }
          showAlert('warning', '종목 조합 불가', `다른 종목은 조합할 수 없습니다.\n이미 "${sportLabels[lockedSport]}" 종목이 선택되었습니다.`)
          return
        }
        // 같은 종목이면 추가 허용
        setSelectedBets([...selectedBets, { matchId, selection, odds, sport }])
      }
    }
  }

  // 선택한 베팅 삭제 함수
  const removeBet = (matchId: string) => {
    const newBets = selectedBets.filter((b) => b.matchId !== matchId)
    setSelectedBets(newBets)
    // 모든 베팅이 삭제되면 필터 리셋
    if (newBets.length === 0) {
      setSportFilter("all")
    }
  }

  // 모든 베팅 초기화 함수
  const clearAllBets = () => {
    setSelectedBets([])
    setSportFilter("all")
    setBetAmount("")
  }

  const handlePurchase = (postId: string) => {
    setPurchasedPosts((prev) => {
      const newSet = new Set(prev)
      newSet.add(postId)
      return newSet
    })
    setExpandedPosts((prev) => {
      const newSet = new Set(prev)
      newSet.add(postId)
      return newSet
    })
  }

  const handleFollow = (userId: number) => {
    setFollowedUsers((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(userId)) {
        newSet.delete(userId)
      } else {
        newSet.add(userId)
      }
      return newSet
    })
  }

  const totalOdds = selectedBets.reduce((acc, bet) => acc * bet.odds, 1)
  const potentialWin = betAmount ? (Number.parseFloat(betAmount) * totalOdds).toFixed(0) : "0"

  const filteredMatches = sportFilter === "all" ? matches : matches.filter((m) => m.sport === sportFilter)

  const sportTabs = [
    { id: "all", label: "전체", icon: "🎯" },
    { id: "soccer", label: "축구", icon: "⚽" },
    { id: "baseball", label: "야구", icon: "⚾" },
    { id: "basketball", label: "농구", icon: "🏀" },
    { id: "volleyball", label: "배구", icon: "🏐" },
  ]

  return (
    <div className="w-full">
      {/* Internal Navigation */}
      <div className="bg-card rounded-lg border border-border mb-3 sm:mb-4 p-1.5 sm:p-2">
        <div className="flex gap-1.5 sm:gap-2 justify-center">
          {[
            { id: "betting", label: "오늘의 경기" },
            { id: "ranking", label: "랭킹" },
            { id: "feed", label: "구독피드" },
            { id: "mypage", label: "마이페이지" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as "betting" | "ranking" | "feed" | "mypage")}
              className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Sport filter tabs - for betting and feed */}
        {(activeTab === "betting" || activeTab === "feed") && (
          <div className="flex gap-1 sm:gap-2 pt-1.5 sm:pt-2 mt-1.5 sm:mt-2 border-t justify-center">
            {sportTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSportFilter(tab.id as "all" | "soccer" | "baseball" | "basketball" | "volleyball")}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-medium flex items-center gap-0.5 sm:gap-1 transition-colors ${
                  sportFilter === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <span className="text-xs sm:text-sm">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Ranking filter */}
        {activeTab === "ranking" && (
          <>
            <div className="flex gap-1 sm:gap-2 pt-1.5 sm:pt-2 mt-1.5 sm:mt-2 border-t justify-center">
              {sportTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() =>
                    setSportFilter(tab.id as "all" | "soccer" | "baseball" | "basketball" | "volleyball")
                  }
                  className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[10px] sm:text-xs font-medium flex items-center gap-0.5 sm:gap-1 transition-colors ${
                    sportFilter === tab.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <span className="text-xs sm:text-sm">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-1 sm:gap-2 pt-1.5 sm:pt-2 mt-1.5 sm:mt-2 border-t justify-center">
              {[
                { id: "profit", label: "수익금", icon: Coins },
                { id: "winRate", label: "적중률", icon: Target },
                { id: "roi", label: "수익률", icon: TrendingUp },
              ].map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setRankingFilter(filter.id as "profit" | "winRate" | "roi")}
                  className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-md text-[10px] sm:text-xs font-medium flex items-center gap-1 sm:gap-1.5 transition-colors ${
                    rankingFilter === filter.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <filter.icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  {filter.label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* My page tabs */}
        {activeTab === "mypage" && (
          <div className="flex gap-1 sm:gap-2 pt-1.5 sm:pt-2 mt-1.5 sm:mt-2 border-t justify-center">
            {[
              { id: "predictions", label: "예측 내역" },
              { id: "gold", label: "골드 내역" },
              { id: "profile", label: "개인정보" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setMyPageTab(tab.id as "predictions" | "gold" | "profile")}
                className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-md text-[10px] sm:text-xs font-medium transition-colors ${
                  myPageTab === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
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
            {isLoading && matches.length === 0 && (
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
                <p>예정된 경기가 없습니다.</p>
              </div>
            )}

            {filteredMatches.map((match) => {
              const sportColor = sportColors[match.sport]
              const fillColor = sportColorFill[match.sport]
              const selectedBet = selectedBets.find((b) => b.matchId === match.id)

              return (
                <Card key={match.id} className="overflow-hidden border-0 shadow-sm">
                  <div className="p-2">
                    <div className={`${sportColor.bg} rounded-lg px-3 py-1.5 flex items-center justify-between`}>
                      <div className="flex items-center gap-1.5">
                        <span>
                          {match.sport === "soccer"
                            ? "⚽"
                            : match.sport === "baseball"
                              ? "⚾"
                              : match.sport === "basketball"
                                ? "🏀"
                                : "🏐"}
                        </span>
                        <span className={`text-xs font-medium ${sportColor.text}`}>{match.league}</span>
                      </div>
                      <span className={`text-xs ${sportColor.text}`}>
                        {match.date} {match.time}
                      </span>
                    </div>
                  </div>
                  <div className="px-2 pb-2">
                    <div className="grid grid-cols-3 gap-1">
                      <button
                        onClick={() => handleBetSelection(match.id, "home", match.homeOdds, match.sport)}
                        className={`rounded-lg p-2 text-center transition-all ${
                          selectedBet?.selection === "home"
                            ? `${fillColor.bg} ${fillColor.text} border ${fillColor.border}`
                            : "bg-gray-50 hover:bg-gray-100"
                        }`}
                      >
                        <div
                          className={`text-xs truncate ${selectedBet?.selection === "home" ? fillColor.text : "text-gray-600"}`}
                        >
                          {match.home}
                        </div>
                        <div className={`font-bold ${selectedBet?.selection === "home" ? fillColor.text : ""}`}>
                          {match.homeOdds}
                        </div>
                      </button>
                      {match.drawOdds > 0 ? (
                        <button
                          onClick={() => handleBetSelection(match.id, "draw", match.drawOdds, match.sport)}
                          className={`rounded-lg p-2 text-center transition-all ${
                            selectedBet?.selection === "draw"
                              ? `${fillColor.bg} ${fillColor.text} border ${fillColor.border}`
                              : "bg-gray-50 hover:bg-gray-100"
                          }`}
                        >
                          <div
                            className={`text-xs ${selectedBet?.selection === "draw" ? fillColor.text : "text-gray-600"}`}
                          >
                            무
                          </div>
                          <div className={`font-bold ${selectedBet?.selection === "draw" ? fillColor.text : ""}`}>
                            {match.drawOdds}
                          </div>
                        </button>
                      ) : (
                        <div className="rounded-lg p-2 text-center bg-gray-50 opacity-50 cursor-not-allowed flex items-center justify-center">
                          <div className="text-2xl text-gray-400">-</div>
                        </div>
                      )}
                      <button
                        onClick={() => handleBetSelection(match.id, "away", match.awayOdds, match.sport)}
                        className={`rounded-lg p-2 text-center transition-all ${
                          selectedBet?.selection === "away"
                            ? `${fillColor.bg} ${fillColor.text} border ${fillColor.border}`
                            : "bg-gray-50 hover:bg-gray-100"
                        }`}
                      >
                        <div
                          className={`text-xs truncate ${selectedBet?.selection === "away" ? fillColor.text : "text-gray-600"}`}
                        >
                          {match.away}
                        </div>
                        <div className={`font-bold ${selectedBet?.selection === "away" ? fillColor.text : ""}`}>
                          {match.awayOdds}
                        </div>
                      </button>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        {/* Ranking Tab */}
        {activeTab === "ranking" && (
          <div className="space-y-2">
            {isLoadingRankings ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : rankings.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">랭킹 데이터가 없습니다.</p>
            ) : (
              rankings.map((user, index) => {
                const isFollowed = followedUsers.has(Number(user.user_id) || 0)
                const rank = index + 1
                const isTop3 = rank <= 3
                const medalColors = ["text-yellow-500", "text-gray-400", "text-amber-600"]

                return (
                  <Card
                    key={user.user_id}
                    className={`overflow-hidden transition-all hover:shadow-md ${isTop3 ? "border-l-4" : ""}`}
                    style={
                      isTop3 ? { borderLeftColor: rank === 1 ? "#EAB308" : rank === 2 ? "#9CA3AF" : "#D97706" } : {}
                    }
                  >
                    <div className="p-3 flex items-center gap-3">
                      <div
                        className={`w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm ${isTop3 ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`}
                      >
                        {isTop3 ? <Trophy className={`w-4 h-4 ${medalColors[rank - 1]}`} /> : rank}
                      </div>
                      <img
                        src={user.avatar_url || "/placeholder.svg"}
                        alt={user.nickname}
                        className="w-10 h-10 rounded-full object-cover bg-gray-200"
                      />
                      <div className="flex-1">
                        <div className="font-semibold text-sm">{user.nickname}</div>
                        <div className="flex gap-3 text-xs text-gray-500 mt-0.5">
                          <span>
                            수익금{" "}
                            <span className="font-medium text-gray-900">{((user.profit || 0) / 10000).toFixed(0)}만</span>
                          </span>
                          <span>
                            적중률 <span className="font-medium text-emerald-600">{Math.round(user.accuracy || 0)}%</span>
                          </span>
                          <span>
                            수익률 <span className="font-medium text-orange-600">{Math.round(user.roi || 0)}%</span>
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleFollow(Number(user.user_id) || 0)}
                        className={`h-7 px-3 text-xs rounded-full ${
                          isFollowed
                            ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
                            : "bg-gray-900 text-white hover:bg-gray-800"
                        }`}
                      >
                        {isFollowed ? "팔로잉" : "팔로우"}
                      </Button>
                    </div>
                  </Card>
                )
              })
            )}
          </div>
        )}

        {/* Subscription Feed Tab */}
        {activeTab === "feed" && (
          <div>
            <SubscriptionFeedContent
              expandedPosts={expandedPosts}
              setExpandedPosts={setExpandedPosts}
              purchasedPosts={purchasedPosts}
              handlePurchase={handlePurchase}
              sportFilter={sportFilter}
              matches={matches}
            />
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
                      {pred.matches.map((match, idx) => {
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
            {myPageTab === "gold" && (
              <div className="space-y-2">
                {goldTransactions.map((transaction) => (
                  <Card key={transaction.id} className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm font-medium ${transaction.type === "charge" ? "text-blue-600" : "text-gray-900"}`}
                          >
                            {transaction.description}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${transaction.type === "charge" ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-600"}`}
                          >
                            {transaction.type === "charge" ? "충전" : "구매"}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">{transaction.date}</div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`text-sm font-semibold ${transaction.amount > 0 ? "text-blue-600" : "text-gray-900"}`}
                        >
                          {transaction.amount > 0 ? "+" : ""}
                          {transaction.amount.toLocaleString()}G
                        </div>
                        <div className="text-xs text-gray-500 mt-1">잔액 {transaction.balance.toLocaleString()}G</div>
                      </div>
                    </div>
                  </Card>
                ))}
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
                <span className="font-medium text-xs sm:text-sm">{selectedBets.length}경기</span>
                {selectedBets.length > 0 && (
                  <span className="text-[10px] sm:text-xs text-muted-foreground bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                    {selectedBets[0].sport === "soccer"
                      ? "⚽ 축구"
                      : selectedBets[0].sport === "baseball"
                        ? "⚾ 야구"
                        : selectedBets[0].sport === "basketball"
                          ? "🏀 농구"
                          : "🏐 배구"}
                  </span>
                )}
                <span className="font-bold text-base sm:text-lg">{totalOdds.toFixed(2)}배</span>
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
                    const match = matches.find((m) => m.id === bet.matchId)
                    if (!match) return null
                    return (
                      <div key={bet.matchId} className="py-2 relative group">
                        {/* 삭제 버튼 */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            removeBet(bet.matchId)
                          }}
                          className="absolute top-2 right-0 w-5 h-5 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 flex items-center justify-center transition-colors"
                          title="삭제"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        {/* 리그 & 시간 */}
                        <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-muted-foreground mb-0.5">
                          <span>{match.league}</span>
                          <span className="text-gray-300 dark:text-gray-600">|</span>
                          <span>{match.date} {match.time}</span>
                        </div>
                        {/* 팀 */}
                        <div className="text-sm text-gray-800 dark:text-foreground mb-1 pr-6">
                          {match.home} vs {match.away}
                        </div>
                        {/* 선택 & 배당 */}
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-primary font-medium">
                            선택: {bet.selection === "home" ? match.home : bet.selection === "away" ? match.away : "무승부"}
                          </span>
                          <span className="text-sm font-bold text-gray-900 dark:text-foreground">{bet.odds}배</span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* 볼 입력 & 예측하기 */}
                <div className="flex gap-2 items-end pt-3 mt-2 border-t border-gray-100 dark:border-border">
                  <div className="flex-1">
                    <div className="text-[11px] text-gray-500 dark:text-muted-foreground mb-1">사용할 볼</div>
                    <Input
                      type="number"
                      placeholder="1~10"
                      min={1}
                      max={10}
                      value={betAmount}
                      onChange={(e) => setBetAmount(e.target.value)}
                      className="text-sm h-9"
                    />
                  </div>
                  <div className="text-right min-w-[80px]">
                    <div className="text-[11px] text-gray-500 dark:text-muted-foreground">예상 적중 시</div>
                    <div className="font-bold text-base">{Number(potentialWin).toLocaleString()}볼</div>
                  </div>
                  <Button
                    size="sm"
                    className="bg-gray-900 hover:bg-gray-800 dark:bg-primary dark:hover:bg-primary/90 rounded-full px-5 text-sm h-9 whitespace-nowrap"
                    onClick={handleSubmitPrediction}
                    disabled={isSubmittingPrediction || selectedBets.length === 0}
                  >
                    {isSubmittingPrediction ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      '예측하기'
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

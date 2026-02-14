"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Trophy,
  TrendingUp,
  Target,
  Flame,
  Star,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Calendar,
  Clock,
  Send,
} from "lucide-react"
import { cn } from "@/lib/utils"

// Types
interface BetmanRound {
  id: string
  year: number
  round: number
  deadline: string
  status: 'open' | 'closed' | 'settled'
  created_at: string
}

interface BetmanGame {
  id: string
  round_id: string
  game_no: number
  match_time: string
  sport: '축구' | '농구'
  league_code: string
  game_type: string // 일반, 핸디캡, 언더오버, S일반, S핸디캡, S언더오버, SUM
  home_team_name: string
  away_team_name: string
  handicap: number | null
  venue: string
  status: string
  home_score: number | null
  away_score: number | null
  result: string | null
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

interface BetmanPrediction {
  id: string
  user_id: string
  round_id: string
  game_id: string
  prediction: 'home' | 'draw' | 'away' | 'over' | 'under'
  is_correct: boolean | null
  points_earned: number | null
  created_at: string
}

interface UserStats {
  user_id: string
  total_predictions: number
  correct_predictions: number
  accuracy: number
  total_points: number
  current_streak: number
  longest_streak: number
  level: number
  badges: string[] | null
}

interface Ranking {
  user_id: string
  total_predictions: number
  correct_predictions: number
  accuracy: number
  total_points: number
  profit?: number
  roi?: number
  current_streak: number
  longest_streak: number
  level: number
  badges: string[] | null
  nickname?: string
  avatar_url?: string | null
}

interface BetmanPredictionContentProps {
  userStats: UserStats | null
  rankings: Ranking[]
  isLoggedIn: boolean
}

// Sport type config
const sportConfig: Record<string, { label: string; icon: string; color: string }> = {
  '축구': { label: "축구", icon: "⚽", color: "text-emerald-600" },
  '농구': { label: "농구", icon: "🏀", color: "text-orange-600" },
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

// Format match time for display
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

// Get prediction label
function getPredictionLabel(prediction: string, gameType: string, sport: string): string {
  const isOverUnder = gameType.includes('언더오버') || gameType === 'SUM'
  if (isOverUnder) {
    return prediction === 'over' ? '오버' : '언더'
  }
  if (prediction === 'home') return '홈승'
  if (prediction === 'away') return '원정승'
  if (prediction === 'draw') return sport === '농구' ? '-' : '무'
  return prediction
}

// Game type option component
function GameTypeOption({
  game,
  selectedPrediction,
  onSelect,
  disabled,
  selectedSport,
}: {
  game: BetmanGame
  selectedPrediction: string | null
  onSelect: (gameId: string, prediction: string) => void
  disabled: boolean
  selectedSport: string | null
}) {
  const isOverUnder = game.game_type.includes('언더오버') || game.game_type === 'SUM'
  const isBasketball = game.sport === '농구'
  const gameTypeLabel = gameTypeLabels[game.game_type] || game.game_type

  // Determine if this game's sport is selectable
  const sportMismatch = selectedSport !== null && selectedSport !== game.sport
  const isDisabled = disabled || sportMismatch

  const options = isOverUnder
    ? [
        { value: 'over', label: '오버' },
        { value: 'under', label: '언더' },
      ]
    : [
        { value: 'home', label: '홈' },
        ...(!isBasketball ? [{ value: 'draw', label: '무' }] : []),
        { value: 'away', label: '원정' },
      ]

  return (
    <div className="border rounded-lg p-3 bg-gray-50">
      <div className="flex items-center justify-between mb-2">
        <Badge variant="secondary" className="text-xs">
          {gameTypeLabel}
          {game.handicap !== null && game.handicap !== 0 && (
            <span className="ml-1 text-blue-600">
              ({game.handicap > 0 ? '+' : ''}{game.handicap})
            </span>
          )}
        </Badge>
        {sportMismatch && (
          <span className="text-xs text-orange-500">다른 종목</span>
        )}
      </div>
      <div className={cn(
        "grid gap-2",
        isOverUnder ? "grid-cols-2" : (isBasketball ? "grid-cols-2" : "grid-cols-3")
      )}>
        {options.map((opt) => (
          <button
            key={opt.value}
            className={cn(
              "py-2 px-3 rounded-lg text-sm font-medium transition-all",
              selectedPrediction === opt.value
                ? "bg-emerald-500 text-white shadow-md"
                : "bg-white border hover:bg-emerald-50 hover:border-emerald-300",
              isDisabled && "opacity-50 cursor-not-allowed"
            )}
            onClick={() => !isDisabled && onSelect(game.id, opt.value)}
            disabled={isDisabled}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// Match Card Component - shows all game types for one physical match
function MatchCard({
  groupedMatch,
  predictions,
  onSelectPrediction,
  selectedSport,
  disabled,
}: {
  groupedMatch: GroupedMatch
  predictions: Map<string, string>
  onSelectPrediction: (gameId: string, prediction: string, sport: string, matchKey: string) => void
  selectedSport: string | null
  disabled: boolean
}) {
  const config = sportConfig[groupedMatch.sport] || sportConfig['축구']
  const matchTime = new Date(groupedMatch.matchTime)
  const now = new Date()
  const isStarted = matchTime <= now

  // Check if any game from this match is already selected
  const hasSelectionFromThisMatch = groupedMatch.games.some(g => predictions.has(g.id))

  return (
    <Card className={cn(
      "overflow-hidden transition-all",
      hasSelectionFromThisMatch && "ring-2 ring-emerald-500"
    )}>
      {/* Match Header */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-4 py-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn("text-lg", config.color)}>{config.icon}</span>
            <span className="text-sm font-medium text-gray-600">{groupedMatch.leagueCode}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Clock className="h-3.5 w-3.5" />
            {formatMatchTime(groupedMatch.matchTime)}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-center gap-4">
          <span className="font-bold text-lg">{groupedMatch.homeTeam}</span>
          <span className="text-gray-400 text-sm">vs</span>
          <span className="font-bold text-lg">{groupedMatch.awayTeam}</span>
        </div>
        {groupedMatch.venue && (
          <p className="text-xs text-gray-400 text-center mt-1">{groupedMatch.venue}</p>
        )}
      </div>

      {/* Game Types */}
      <CardContent className="p-4">
        {isStarted ? (
          <div className="flex items-center justify-center gap-2 py-4 text-gray-500">
            <AlertCircle className="h-4 w-4" />
            <span>경기가 이미 시작되었습니다</span>
          </div>
        ) : (
          <div className="space-y-3">
            {groupedMatch.games.map((game) => (
              <GameTypeOption
                key={game.id}
                game={game}
                selectedPrediction={predictions.get(game.id) || null}
                onSelect={(gameId, prediction) =>
                  onSelectPrediction(gameId, prediction, game.sport, groupedMatch.matchKey)
                }
                disabled={disabled || (hasSelectionFromThisMatch && !predictions.has(game.id))}
                selectedSport={selectedSport}
              />
            ))}
          </div>
        )}

        {/* Selection Status */}
        {hasSelectionFromThisMatch && (
          <div className="mt-3 pt-3 border-t flex items-center justify-center gap-2 text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-medium">선택됨</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// User Stats Card Component
function UserStatsCard({ stats }: { stats: UserStats | null }) {
  if (!stats) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" />내 예측 현황
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            아직 예측 기록이 없습니다.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-4 w-4" />내 예측 현황
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between p-3 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500" />
            <span className="font-medium text-sm">레벨 {stats.level}</span>
          </div>
          <div className="text-right">
            <p className="font-bold text-amber-600">{stats.total_points.toLocaleString()}P</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="p-2 bg-gray-50 rounded">
            <p className="text-lg font-bold">{stats.total_predictions}</p>
            <p className="text-xs text-gray-500">총 예측</p>
          </div>
          <div className="p-2 bg-gray-50 rounded">
            <p className="text-lg font-bold text-emerald-600">{stats.accuracy}%</p>
            <p className="text-xs text-gray-500">적중률</p>
          </div>
          <div className="p-2 bg-gray-50 rounded">
            <p className="text-lg font-bold">{stats.correct_predictions}</p>
            <p className="text-xs text-gray-500">적중</p>
          </div>
          <div className="p-2 bg-gray-50 rounded">
            <div className="flex items-center justify-center gap-1">
              <Flame className="h-3 w-3 text-orange-500" />
              <p className="text-lg font-bold">{stats.current_streak}</p>
            </div>
            <p className="text-xs text-gray-500">연속</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Rankings Card Component
function RankingsCard({ rankings }: { rankings: Ranking[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" />
          랭킹 TOP 5
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rankings.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            아직 랭킹 데이터가 없습니다.
          </p>
        ) : (
          <div className="space-y-2">
            {rankings.slice(0, 5).map((rank, idx) => (
              <div
                key={rank.user_id}
                className={cn(
                  "flex items-center justify-between p-2 rounded-lg",
                  idx === 0 && "bg-amber-50",
                  idx === 1 && "bg-gray-100",
                  idx === 2 && "bg-orange-50"
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold",
                      idx === 0 && "bg-amber-500 text-white",
                      idx === 1 && "bg-gray-400 text-white",
                      idx === 2 && "bg-orange-400 text-white",
                      idx > 2 && "bg-gray-200 text-gray-600"
                    )}
                  >
                    {idx + 1}
                  </span>
                  <span className="text-sm font-medium">{rank.nickname || `유저 ${rank.user_id.slice(0, 6)}...`}</span>
                </div>
                <span className="text-sm font-bold">{rank.profit !== undefined ? rank.profit.toLocaleString() : rank.total_points.toLocaleString()}P</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Main Component
export function BetmanPredictionContent({
  userStats,
  rankings,
  isLoggedIn,
}: BetmanPredictionContentProps) {
  const [activeTab, setActiveTab] = useState("betman")
  const [activeSport, setActiveSport] = useState<string>("all")
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [round, setRound] = useState<BetmanRound | null>(null)
  const [groupedMatches, setGroupedMatches] = useState<GroupedMatch[]>([])
  const [existingPredictions, setExistingPredictions] = useState<BetmanPrediction[]>([])

  // Local selections - Map<gameId, prediction>
  const [selections, setSelections] = useState<Map<string, string>>(new Map())
  // Track which match keys have selections
  const [selectedMatchKeys, setSelectedMatchKeys] = useState<Set<string>>(new Set())
  // Track selected sport (for single sport restriction)
  const [selectedSport, setSelectedSport] = useState<string | null>(null)

  const [lastUpdate, setLastUpdate] = useState(new Date())

  // Fetch Betman games
  const fetchGames = useCallback(async () => {
    setIsLoading(true)
    try {
      const sportParam = activeSport !== 'all' ? `&sport=${activeSport}` : ''
      const res = await fetch(`/api/betman/games?${sportParam}`)
      const data = await res.json()

      if (data.round) {
        setRound(data.round)
      }
      if (data.groupedGames) {
        setGroupedMatches(data.groupedGames)
      }
      if (data.userPredictions) {
        setExistingPredictions(data.userPredictions)
        // Initialize selections from existing predictions
        const existingSelections = new Map<string, string>()
        const existingMatchKeys = new Set<string>()
        let existingSport: string | null = null

        data.userPredictions.forEach((pred: BetmanPrediction) => {
          existingSelections.set(pred.game_id, pred.prediction)
          // Find the match key for this game
          const match = data.groupedGames.find((m: GroupedMatch) =>
            m.games.some((g: BetmanGame) => g.id === pred.game_id)
          )
          if (match) {
            existingMatchKeys.add(match.matchKey)
            existingSport = match.sport
          }
        })

        setSelections(existingSelections)
        setSelectedMatchKeys(existingMatchKeys)
        setSelectedSport(existingSport)
      }
      setLastUpdate(new Date())
    } catch (error) {
      console.error('Failed to fetch games:', error)
    } finally {
      setIsLoading(false)
    }
  }, [activeSport])

  useEffect(() => {
    fetchGames()
  }, [fetchGames])

  // Handle prediction selection
  const handleSelectPrediction = (gameId: string, prediction: string, sport: string, matchKey: string) => {
    setSelections(prev => {
      const newSelections = new Map(prev)

      // If clicking the same prediction, deselect it
      if (prev.get(gameId) === prediction) {
        newSelections.delete(gameId)

        // Update match keys
        setSelectedMatchKeys(prevKeys => {
          const newKeys = new Set(prevKeys)
          newKeys.delete(matchKey)
          return newKeys
        })

        // If no more selections, clear sport restriction
        if (newSelections.size === 0) {
          setSelectedSport(null)
        }

        return newSelections
      }

      // Remove any existing selection from this match
      const currentMatch = groupedMatches.find(m => m.matchKey === matchKey)
      if (currentMatch) {
        currentMatch.games.forEach(g => {
          newSelections.delete(g.id)
        })
      }

      // Add new selection
      newSelections.set(gameId, prediction)

      // Update match keys
      setSelectedMatchKeys(prevKeys => {
        const newKeys = new Set(prevKeys)
        newKeys.add(matchKey)
        return newKeys
      })

      // Set sport restriction
      if (!selectedSport) {
        setSelectedSport(sport)
      }

      return newSelections
    })
  }

  // Clear all selections
  const handleClearSelections = () => {
    setSelections(new Map())
    setSelectedMatchKeys(new Set())
    setSelectedSport(null)
  }

  // Submit predictions
  const handleSubmit = async () => {
    if (!isLoggedIn) {
      alert('로그인이 필요합니다.')
      return
    }

    if (selections.size === 0) {
      alert('최소 1개 이상의 경기를 선택해주세요.')
      return
    }

    setIsSubmitting(true)
    try {
      const predictionsArray = Array.from(selections.entries()).map(([gameId, prediction]) => ({
        game_id: gameId,
        prediction,
      }))

      const res = await fetch('/api/betman/prediction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ predictions: predictionsArray }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '예측 저장에 실패했습니다.')
      }

      alert(data.message || '예측이 저장되었습니다.')
      fetchGames() // Refresh to show saved predictions
    } catch (error: any) {
      alert(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Filter matches by sport
  const filteredMatches = useMemo(() => {
    if (activeSport === 'all') return groupedMatches
    return groupedMatches.filter(m => m.sport === activeSport)
  }, [groupedMatches, activeSport])

  // Group matches by league
  const matchesByLeague = useMemo(() => {
    const groups: Record<string, GroupedMatch[]> = {}
    filteredMatches.forEach((match) => {
      const leagueCode = match.leagueCode || '기타'
      if (!groups[leagueCode]) groups[leagueCode] = []
      groups[leagueCode].push(match)
    })
    return groups
  }, [filteredMatches])

  const sportFilters = [
    { key: "all", label: "전체", icon: "🎯" },
    { key: "축구", label: "축구", icon: "⚽" },
    { key: "농구", label: "농구", icon: "🏀" },
  ]

  return (
    <div className="grid grid-cols-12 gap-4 lg:gap-5">
      {/* Main Content */}
      <div className="col-span-12 lg:col-span-8">
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
          <TabsList className="w-full justify-start bg-transparent border-b rounded-none h-auto p-0">
            <TabsTrigger
              value="betman"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent px-4 py-2"
            >
              베트맨 예측
            </TabsTrigger>
            <TabsTrigger
              value="ranking"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent px-4 py-2"
            >
              랭킹
            </TabsTrigger>
            <TabsTrigger
              value="mypage"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent px-4 py-2"
            >
              마이페이지
            </TabsTrigger>
          </TabsList>

          <TabsContent value="betman" className="mt-4">
            {/* Round Info */}
            {round && (
              <Card className="mb-4 bg-gradient-to-r from-emerald-50 to-teal-50">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-100 rounded-full">
                        <Calendar className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg text-emerald-800">
                          {round.year}년 {round.round}회차
                        </h3>
                        <p className="text-sm text-emerald-600">
                          마감: {formatDeadline(round.deadline)}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={round.status === 'open' ? 'default' : 'secondary'}
                      className={cn(
                        round.status === 'open' && "bg-emerald-500"
                      )}
                    >
                      {round.status === 'open' ? '진행중' : round.status === 'closed' ? '마감' : '정산완료'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Sport Filters */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {sportFilters.map((sport) => (
                <button
                  key={sport.key}
                  onClick={() => setActiveSport(sport.key)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                    activeSport === sport.key
                      ? "bg-emerald-500 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                    // Disable other sport if one is already selected
                    selectedSport && sport.key !== 'all' && sport.key !== selectedSport &&
                    "opacity-50 cursor-not-allowed"
                  )}
                  disabled={!!selectedSport && sport.key !== 'all' && sport.key !== selectedSport}
                >
                  <span className="mr-1">{sport.icon}</span>
                  {sport.label}
                </button>
              ))}

              {selectedSport && (
                <span className="text-xs text-orange-500 ml-2">
                  * {sportConfig[selectedSport]?.label || selectedSport} 경기만 선택 가능
                </span>
              )}
            </div>

            {/* Selection Summary & Submit */}
            {selections.size > 0 && (
              <Card className="mb-4 border-emerald-200 bg-emerald-50">
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      <span className="font-medium text-emerald-800">
                        {selections.size}개 경기 선택됨
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleClearSelections}
                        disabled={isSubmitting}
                      >
                        초기화
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="bg-emerald-500 hover:bg-emerald-600"
                      >
                        {isSubmitting ? (
                          <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Send className="h-4 w-4 mr-2" />
                        )}
                        예측 저장
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Last Update */}
            <div className="flex items-center justify-between mb-4 text-sm text-gray-500">
              <span>마지막 업데이트: {lastUpdate.toLocaleTimeString("ko-KR")}</span>
              <button
                className="flex items-center gap-1 hover:text-gray-700"
                onClick={fetchGames}
                disabled={isLoading}
              >
                <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                새로고침
              </button>
            </div>

            {/* Match List by League */}
            {isLoading ? (
              <Card>
                <CardContent className="py-10 text-center">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto text-gray-400" />
                  <p className="text-muted-foreground mt-2">경기 정보를 불러오는 중...</p>
                </CardContent>
              </Card>
            ) : Object.keys(matchesByLeague).length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center">
                  <p className="text-muted-foreground">
                    {round ? '현재 예측 가능한 경기가 없습니다.' : '진행중인 회차가 없습니다.'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {Object.entries(matchesByLeague).map(([leagueCode, leagueMatches]) => (
                  <div key={leagueCode} className="space-y-3">
                    {/* League Header */}
                    <div className="flex items-center gap-2 px-1">
                      <span className={cn("text-lg", sportConfig[leagueMatches[0]?.sport]?.color)}>
                        {sportConfig[leagueMatches[0]?.sport]?.icon || '🏆'}
                      </span>
                      <span className="font-semibold text-gray-800">{leagueCode}</span>
                      <Badge variant="outline" className="text-xs">
                        {leagueMatches.length}경기
                      </Badge>
                    </div>

                    {/* Matches */}
                    <div className="grid gap-4 md:grid-cols-2">
                      {leagueMatches.map((match) => (
                        <MatchCard
                          key={match.matchKey}
                          groupedMatch={match}
                          predictions={selections}
                          onSelectPrediction={handleSelectPrediction}
                          selectedSport={selectedSport}
                          disabled={isSubmitting}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="ranking" className="mt-4">
            <RankingsCard rankings={rankings} />
          </TabsContent>

          <TabsContent value="mypage" className="mt-4">
            <UserStatsCard stats={userStats} />

            {/* My Recent Predictions */}
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  내 예측 기록
                </CardTitle>
              </CardHeader>
              <CardContent>
                {existingPredictions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    예측 기록이 없습니다.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {existingPredictions.slice(0, 10).map((pred) => {
                      // Find the game for this prediction
                      const match = groupedMatches.find(m =>
                        m.games.some(g => g.id === pred.game_id)
                      )
                      const game = match?.games.find(g => g.id === pred.game_id)

                      return (
                        <div key={pred.id} className="p-3 bg-gray-50 rounded-lg">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium text-sm">
                                {game?.home_team_name || "홈"} vs {game?.away_team_name || "원정"}
                              </p>
                              <p className="text-xs text-gray-500">
                                {game?.league_code} · {gameTypeLabels[game?.game_type || ''] || game?.game_type}
                              </p>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {getPredictionLabel(pred.prediction, game?.game_type || '', match?.sport || '')}
                            </Badge>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Sidebar */}
      <aside className="hidden lg:block lg:col-span-4">
        <div className="space-y-4 sticky top-16">
          {isLoggedIn ? (
            <UserStatsCard stats={userStats} />
          ) : (
            <Card>
              <CardContent className="py-6 text-center">
                <Target className="h-10 w-10 mx-auto mb-3 text-gray-400" />
                <p className="font-medium mb-1">로그인하고 예측에 참여하세요!</p>
                <p className="text-sm text-gray-500">
                  포인트를 획득하고 랭킹에 도전해보세요.
                </p>
              </CardContent>
            </Card>
          )}

          <RankingsCard rankings={rankings} />

          {/* Selection Guide */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-blue-500" />
                예측 규칙
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-600 space-y-2">
              <p>• 한 경기당 하나의 유형만 선택 가능</p>
              <p>• 같은 종목의 경기만 복수 선택 가능</p>
              <p>• 마감시간 전까지 수정 가능</p>
              <p>• 경기 시작 후에는 변경 불가</p>
            </CardContent>
          </Card>
        </div>
      </aside>
    </div>
  )
}

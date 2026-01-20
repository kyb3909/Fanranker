"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Trophy,
  TrendingUp,
  Target,
  Flame,
  Star,
  CheckCircle2,
  RefreshCw,
} from "lucide-react"
import { cn } from "@/lib/utils"

// Types
interface Team {
  id: string
  name: string
  name_ko: string | null
  logo_url: string | null
}

interface League {
  id: string
  name: string
  name_ko: string | null
  sport_type: string
  country_code: string | null
}

// Bet365 odds format: "1" = home, "X" or "Draw" = draw, "2" = away
interface Bet365OddsValue {
  name: string
  odds: string
}

interface MatchOdds {
  full_time_result: {
    "1"?: Bet365OddsValue
    "X"?: Bet365OddsValue
    "Draw"?: Bet365OddsValue
    "2"?: Bet365OddsValue
  } | null
  goals_over_under: any
  both_teams_to_score: any
}

// Helper to parse odds from bet365 format
function parseOdds(oddsData: MatchOdds["full_time_result"]): { home: number; draw: number; away: number } | null {
  if (!oddsData) return null
  // Handle both "X" and "Draw" keys for draw odds
  const drawOdds = oddsData["X"] || oddsData["Draw"]
  return {
    home: oddsData["1"] ? parseFloat(oddsData["1"].odds) : 0,
    draw: drawOdds ? parseFloat(drawOdds.odds) : 0,
    away: oddsData["2"] ? parseFloat(oddsData["2"].odds) : 0,
  }
}

interface Match {
  id: string
  match_time: string
  sport_type: string
  time_status: number
  score_home: number | null
  score_away: number | null
  is_prediction_open: boolean | null
  prediction_count: number | null
  home_team: Team | null
  away_team: Team | null
  league: League | null
  match_odds: MatchOdds[]
}

interface UserPrediction {
  id: string
  match_id: string
  prediction_type: string
  predicted_value: string
  odds_at_prediction: number | null
  points_earned: number | null
  is_correct: boolean | null
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

interface PredictionContentProps {
  matches: Match[]
  userPredictions: UserPrediction[]
  userStats: UserStats | null
  rankings: Ranking[]
  isLoggedIn: boolean
}

// Sport type config
const sportConfig: Record<string, { label: string; icon: string; color: string }> = {
  football: { label: "축구", icon: "⚽", color: "text-emerald-600" },
  soccer: { label: "축구", icon: "⚽", color: "text-emerald-600" },
  baseball: { label: "야구", icon: "⚾", color: "text-blue-600" },
  basketball: { label: "농구", icon: "🏀", color: "text-orange-600" },
  volleyball: { label: "배구", icon: "🏐", color: "text-purple-600" },
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

// Match Row Component (like the image style)
function MatchRow({
  match,
  userPrediction,
  onPredict,
  isSubmitting,
}: {
  match: Match
  userPrediction?: UserPrediction
  onPredict: (matchId: string, type: string, value: string, odds: number) => void
  isSubmitting: boolean
}) {
  const rawOdds = match.match_odds?.[0]?.full_time_result
  const odds = parseOdds(rawOdds)
  const hasPredicted = !!userPrediction
  const predictedValue = userPrediction?.predicted_value

  // Check if match is within 24 hours (cyber token prediction rule)
  const matchTime = new Date(match.match_time)
  const now = new Date()
  const hoursUntilMatch = (matchTime.getTime() - now.getTime()) / (1000 * 60 * 60)
  const isWithin24Hours = hoursUntilMatch <= 24 && hoursUntilMatch > 0

  // If no odds, show placeholder
  const homeOdds = odds?.home || 0
  const drawOdds = odds?.draw || 0
  const awayOdds = odds?.away || 0

  // Disable prediction if match is not within 24 hours
  const isDisabled = hasPredicted || isSubmitting || !match.is_prediction_open || !odds || !isWithin24Hours

  return (
    <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
      <div className="grid grid-cols-3 divide-x">
        {/* Home Team */}
        <button
          className={cn(
            "p-4 text-center transition-all hover:bg-gray-50",
            predictedValue === "home" && "bg-emerald-50 border-2 border-emerald-500",
            (hasPredicted && predictedValue !== "home") && "opacity-50"
          )}
          onClick={() => {
            if (!isWithin24Hours) {
              alert('사이버 토큰은 경기 시작 24시간 이내 경기에만 예측할 수 있습니다.')
              return
            }
            odds && onPredict(match.id, "full_time_result", "home", homeOdds)
          }}
          disabled={isDisabled}
        >
          <p className="font-medium text-sm mb-1 truncate">
            {match.home_team?.name_ko || match.home_team?.name || "홈팀"}
          </p>
          <p className={cn(
            "text-xl font-bold",
            predictedValue === "home" ? "text-emerald-600" : "text-gray-900"
          )}>
            {homeOdds > 0 ? homeOdds.toFixed(2) : "-"}
          </p>
        </button>

        {/* Draw */}
        <button
          className={cn(
            "p-4 text-center transition-all hover:bg-gray-50",
            predictedValue === "draw" && "bg-emerald-50 border-2 border-emerald-500",
            (hasPredicted && predictedValue !== "draw") && "opacity-50"
          )}
          onClick={() => {
            if (!isWithin24Hours) {
              alert('사이버 토큰은 경기 시작 24시간 이내 경기에만 예측할 수 있습니다.')
              return
            }
            odds && onPredict(match.id, "full_time_result", "draw", drawOdds)
          }}
          disabled={isDisabled}
        >
          <p className="font-medium text-sm mb-1 text-gray-500">무</p>
          <p className={cn(
            "text-xl font-bold",
            predictedValue === "draw" ? "text-emerald-600" : "text-gray-900"
          )}>
            {drawOdds > 0 ? drawOdds.toFixed(2) : "-"}
          </p>
        </button>

        {/* Away Team */}
        <button
          className={cn(
            "p-4 text-center transition-all hover:bg-gray-50",
            predictedValue === "away" && "bg-emerald-50 border-2 border-emerald-500",
            (hasPredicted && predictedValue !== "away") && "opacity-50"
          )}
          onClick={() => {
            if (!isWithin24Hours) {
              alert('사이버 토큰은 경기 시작 24시간 이내 경기에만 예측할 수 있습니다.')
              return
            }
            odds && onPredict(match.id, "full_time_result", "away", awayOdds)
          }}
          disabled={isDisabled}
        >
          <p className="font-medium text-sm mb-1 truncate">
            {match.away_team?.name_ko || match.away_team?.name || "원정팀"}
          </p>
          <p className={cn(
            "text-xl font-bold",
            predictedValue === "away" ? "text-emerald-600" : "text-gray-900"
          )}>
            {awayOdds > 0 ? awayOdds.toFixed(2) : "-"}
          </p>
        </button>
      </div>

      {/* Prediction status or warning */}
      {hasPredicted && (
        <div className="px-4 py-2 bg-emerald-50 border-t flex items-center justify-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span className="text-sm text-emerald-700 font-medium">예측 완료</span>
        </div>
      )}
      {!hasPredicted && !isWithin24Hours && (
        <div className="px-4 py-2 bg-amber-50 border-t flex items-center justify-center gap-2">
          <span className="text-xs text-amber-700">24시간 이내 경기에만 예측 가능</span>
        </div>
      )}
    </div>
  )
}

// League Group Component
function LeagueGroup({
  leagueName,
  matches,
  predictionMap,
  onPredict,
  isSubmitting,
}: {
  leagueName: string
  matches: Match[]
  predictionMap: Map<string, UserPrediction>
  onPredict: (matchId: string, type: string, value: string, odds: number) => void
  isSubmitting: boolean
}) {
  const sportType = matches[0]?.sport_type || "football"
  const config = sportConfig[sportType] || sportConfig.football

  return (
    <div className="space-y-3">
      {/* League Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("text-lg", config.color)}>{config.icon}</span>
          <span className="font-semibold text-gray-800">{leagueName}</span>
        </div>
        <span className="text-sm text-gray-500">
          {formatMatchTime(matches[0]?.match_time || "")}
        </span>
      </div>

      {/* Matches */}
      <div className="space-y-3">
        {matches.map((match) => (
          <MatchRow
            key={match.id}
            match={match}
            userPrediction={predictionMap.get(match.id)}
            onPredict={onPredict}
            isSubmitting={isSubmitting}
          />
        ))}
      </div>
    </div>
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
export function PredictionContent({
  matches,
  userPredictions,
  userStats,
  rankings,
  isLoggedIn,
}: PredictionContentProps) {
  const [activeTab, setActiveTab] = useState("today")
  const [activeSport, setActiveSport] = useState("all")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [localPredictions, setLocalPredictions] = useState<UserPrediction[]>(userPredictions)
  const [lastUpdate] = useState(new Date())

  // Create prediction map for quick lookup
  const predictionMap = useMemo(() => {
    return new Map(localPredictions.map((p) => [p.match_id, p]))
  }, [localPredictions])

  // Filter matches by sport
  const filteredMatches = useMemo(() => {
    if (activeSport === "all") return matches
    const sportMap: Record<string, string[]> = {
      soccer: ["football", "soccer"],
      baseball: ["baseball"],
      basketball: ["basketball"],
      volleyball: ["volleyball"],
    }
    const types = sportMap[activeSport] || []
    return matches.filter((m) => types.includes(m.sport_type))
  }, [matches, activeSport])

  // Group matches by league
  const matchesByLeague = useMemo(() => {
    const groups: Record<string, Match[]> = {}
    filteredMatches.forEach((match) => {
      const leagueName = match.league?.name_ko || match.league?.name || "기타"
      if (!groups[leagueName]) groups[leagueName] = []
      groups[leagueName].push(match)
    })
    return groups
  }, [filteredMatches])

  // Handle prediction submission
  const handlePredict = async (matchId: string, type: string, value: string, odds: number) => {
    if (!isLoggedIn) {
      alert("로그인이 필요합니다.")
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch("/api/prediction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: matchId,
          prediction_type: type,
          predicted_value: value,
          odds_at_prediction: odds,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "예측 저장에 실패했습니다.")
      }

      const newPrediction = await res.json()
      setLocalPredictions((prev) => [...prev, newPrediction])
    } catch (error: any) {
      alert(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const sportFilters = [
    { key: "all", label: "전체", icon: "🎯" },
    { key: "soccer", label: "축구", icon: "⚽" },
    { key: "baseball", label: "야구", icon: "⚾" },
    { key: "basketball", label: "농구", icon: "🏀" },
    { key: "volleyball", label: "배구", icon: "🏐" },
  ]

  return (
    <div className="grid grid-cols-12 gap-4 lg:gap-5">
      {/* Main Content */}
      <div className="col-span-12 lg:col-span-8">
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
          <TabsList className="w-full justify-start bg-transparent border-b rounded-none h-auto p-0">
            <TabsTrigger
              value="today"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent px-4 py-2"
            >
              오늘의 경기
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

          <TabsContent value="today" className="mt-4">
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
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  <span className="mr-1">{sport.icon}</span>
                  {sport.label}
                </button>
              ))}
            </div>

            {/* Last Update */}
            <div className="flex items-center justify-between mb-4 text-sm text-gray-500">
              <span>마지막 업데이트: {lastUpdate.toLocaleTimeString("ko-KR")}</span>
              <button className="flex items-center gap-1 hover:text-gray-700">
                <RefreshCw className="h-4 w-4" />
                새로고침
              </button>
            </div>

            {/* Match List by League */}
            {Object.keys(matchesByLeague).length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center">
                  <p className="text-muted-foreground">현재 예측 가능한 경기가 없습니다.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {Object.entries(matchesByLeague).map(([leagueName, leagueMatches]) => (
                  <LeagueGroup
                    key={leagueName}
                    leagueName={leagueName}
                    matches={leagueMatches}
                    predictionMap={predictionMap}
                    onPredict={handlePredict}
                    isSubmitting={isSubmitting}
                  />
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
                {localPredictions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    예측 기록이 없습니다.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {localPredictions.slice(0, 5).map((pred) => {
                      const match = matches.find((m) => m.id === pred.match_id)
                      return (
                        <div key={pred.id} className="p-3 bg-gray-50 rounded-lg">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium text-sm">
                                {match?.home_team?.name_ko || "홈"} vs {match?.away_team?.name_ko || "원정"}
                              </p>
                              <p className="text-xs text-gray-500">
                                {match?.league?.name_ko || match?.league?.name}
                              </p>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {pred.predicted_value === "home" ? "홈 승" : pred.predicted_value === "draw" ? "무승부" : "원정 승"}
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
        </div>
      </aside>
    </div>
  )
}

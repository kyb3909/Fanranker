"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@clerk/nextjs"
import { Header } from "@/components/header"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Loader2,
  Trophy,
  ArrowLeft,
  Target,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Circle
} from "lucide-react"
import { useRouter } from "next/navigation"

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

// Sport icons
const SPORT_ICONS: Record<string, string> = {
  "축구": "⚽",
  "야구": "⚾",
  "농구": "🏀",
  "배구": "🏐"
}

// Sport colors
const sportColorFill: Record<string, { bg: string; text: string; border: string }> = {
  "축구": { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  "야구": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  "농구": { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  "배구": { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
}

interface BetmanGame {
  id: string
  gameId: string
  prediction: string
  isCorrect: boolean | null
  odds: number
  gameType: string
  handicap: number | null
  overUnderLine: number | null  // 언오버 기준선
  match: {
    homeTeam: string
    awayTeam: string
    league: string
    matchTime: string
    status: string
    homeScore?: number
    awayScore?: number
  }
}

interface BetmanSlip {
  id: string
  type: 'betman_slip'
  source: 'betman'
  sport: string
  roundInfo: {
    year: number
    round: number
    deadline: string
    status: string
  } | null
  gameCount: number
  totalOdds: number
  ballsUsed: number
  isCorrect: boolean | null
  pointsEarned: number | null
  createdAt: string
  games: BetmanGame[]
}

interface RegularPrediction {
  id: string
  matchId: string
  predictionType: string
  predictedValue: string
  oddsAtPrediction: number
  amount: number
  isCorrect: boolean | null
  pointsEarned: number | null
  createdAt: string
  source: 'regular'
  sport?: string
  match: {
    homeTeam: string
    awayTeam: string
    league: string
    matchTime: string
    status: string
    homeScore?: number
    awayScore?: number
  }
}

type PredictionItem = BetmanSlip | RegularPrediction

interface Stats {
  totalPredictions: number
  correctPredictions: number
  accuracy: number
  totalPointsEarned: number
  totalPointsUsed: number
}

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

// Get prediction label
function getPredictionLabel(prediction: string, homeTeam: string, awayTeam: string): string {
  switch (prediction) {
    case 'home': return homeTeam
    case 'away': return awayTeam
    case 'draw': return '무승부'
    case 'over': return '오버'
    case 'under': return '언더'
    case 'odd': return '홀'
    case 'even': return '짝'
    default: return prediction
  }
}

// Betting Slip Card Component
function BettingSlipCard({ slip, isExpanded, onToggle }: {
  slip: BetmanSlip
  isExpanded: boolean
  onToggle: () => void
}) {
  const sportColor = sportColorFill[slip.sport] || sportColorFill['축구']
  const isBasketball = slip.sport === '농구'

  // Determine result status
  const getResultStatus = () => {
    if (slip.isCorrect === null) return 'pending'
    return slip.isCorrect ? 'win' : 'lose'
  }

  const resultStatus = getResultStatus()

  return (
    <Card className="overflow-hidden border-0 shadow-sm">
      {/* Slip Header - Always Visible */}
      <div
        className={`p-3 cursor-pointer transition-colors hover:bg-muted/30 ${sportColor.bg}`}
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{SPORT_ICONS[slip.sport] || "🎯"}</span>
            <div>
              <div className="flex items-center gap-2">
                <span className={`font-semibold text-sm ${sportColor.text}`}>
                  베트맨 {slip.sport}
                </span>
                {slip.roundInfo && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {slip.roundInfo.year}년 {slip.roundInfo.round}회차
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <span>{slip.gameCount}경기</span>
                <span>·</span>
                <span>{slip.ballsUsed}볼 사용</span>
                <span>·</span>
                <span>배당 {slip.totalOdds.toFixed(2)}배</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Result Badge */}
            <div className={`text-xs font-semibold px-2 py-1 rounded ${
              resultStatus === 'win'
                ? 'bg-emerald-100 text-emerald-700'
                : resultStatus === 'lose'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-amber-100 text-amber-700'
            }`}>
              {resultStatus === 'win' ? (
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  적중
                </span>
              ) : resultStatus === 'lose' ? (
                <span className="flex items-center gap-1">
                  <XCircle className="h-3 w-3" />
                  미적중
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  대기중
                </span>
              )}
            </div>

            {/* Expand/Collapse Icon */}
            {isExpanded ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        </div>
      </div>

      {/* Expanded Content - Betting Slip Details */}
      {isExpanded && (
        <div className="border-t">
          {/* Games List */}
          <div className="divide-y">
            {slip.games.map((game, idx) => {
              const hasDrawOdds = slip.sport === '축구' && !game.gameType.includes('언더오버')
              const isOverUnder = game.gameType.includes('언더오버')

              return (
                <div key={game.id} className="p-3">
                  {/* League & Time */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                    <span className="font-medium">{game.match.league}</span>
                    <span>{formatMatchTime(game.match.matchTime)}</span>
                  </div>

                  {/* Teams */}
                  <div className="text-sm font-medium mb-2">
                    {game.match.homeTeam} vs {game.match.awayTeam}
                  </div>

                  {/* Game Type Badge with Handicap/Line Info */}
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge variant="secondary" className="text-[10px]">
                      {gameTypeLabels[game.gameType] || game.gameType}
                    </Badge>
                    {/* 핸디캡 정보 표시 */}
                    {game.gameType.includes('핸디캡') && game.handicap !== null && (
                      <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                        {game.handicap < 0 ? (
                          <span>{game.match.homeTeam.slice(0, 4)} {game.handicap}</span>
                        ) : (
                          <span>{game.match.homeTeam.slice(0, 4)} +{game.handicap}</span>
                        )}
                      </Badge>
                    )}
                    {/* 언더오버 기준선 표시 */}
                    {game.gameType.includes('언더오버') && game.overUnderLine !== null && (
                      <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
                        기준 {game.overUnderLine}
                      </Badge>
                    )}
                    {game.isCorrect !== null && (
                      game.isCorrect ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-500" />
                      )
                    )}
                  </div>

                  {/* Odds Selection Display */}
                  <div className={`grid gap-1.5 ${
                    isOverUnder || isBasketball ? 'grid-cols-2' : 'grid-cols-3'
                  }`}>
                    {/* Home */}
                    {!isOverUnder && (
                      <div className={`rounded-lg p-2 text-center border ${
                        game.prediction === 'home'
                          ? `${sportColor.bg} ${sportColor.border} border-2`
                          : 'bg-muted/30'
                      }`}>
                        <div className={`text-xs truncate ${
                          game.prediction === 'home' ? sportColor.text : 'text-muted-foreground'
                        }`}>
                          {game.match.homeTeam.slice(0, 6)}
                        </div>
                        <div className={`font-bold text-sm ${
                          game.prediction === 'home' ? sportColor.text : ''
                        }`}>
                          {game.prediction === 'home' ? game.odds.toFixed(2) : '-'}
                        </div>
                      </div>
                    )}

                    {/* Draw (only for soccer non-over/under) */}
                    {hasDrawOdds && (
                      <div className={`rounded-lg p-2 text-center border ${
                        game.prediction === 'draw'
                          ? `${sportColor.bg} ${sportColor.border} border-2`
                          : 'bg-muted/30'
                      }`}>
                        <div className={`text-xs ${
                          game.prediction === 'draw' ? sportColor.text : 'text-muted-foreground'
                        }`}>
                          무
                        </div>
                        <div className={`font-bold text-sm ${
                          game.prediction === 'draw' ? sportColor.text : ''
                        }`}>
                          {game.prediction === 'draw' ? game.odds.toFixed(2) : '-'}
                        </div>
                      </div>
                    )}

                    {/* Away */}
                    {!isOverUnder && (
                      <div className={`rounded-lg p-2 text-center border ${
                        game.prediction === 'away'
                          ? `${sportColor.bg} ${sportColor.border} border-2`
                          : 'bg-muted/30'
                      }`}>
                        <div className={`text-xs truncate ${
                          game.prediction === 'away' ? sportColor.text : 'text-muted-foreground'
                        }`}>
                          {game.match.awayTeam.slice(0, 6)}
                        </div>
                        <div className={`font-bold text-sm ${
                          game.prediction === 'away' ? sportColor.text : ''
                        }`}>
                          {game.prediction === 'away' ? game.odds.toFixed(2) : '-'}
                        </div>
                      </div>
                    )}

                    {/* Over/Under options */}
                    {isOverUnder && (
                      <>
                        <div className={`rounded-lg p-2 text-center border ${
                          game.prediction === 'over'
                            ? `${sportColor.bg} ${sportColor.border} border-2`
                            : 'bg-muted/30'
                        }`}>
                          <div className={`text-xs ${
                            game.prediction === 'over' ? sportColor.text : 'text-muted-foreground'
                          }`}>
                            오버
                          </div>
                          <div className={`font-bold text-sm ${
                            game.prediction === 'over' ? sportColor.text : ''
                          }`}>
                            {game.prediction === 'over' ? game.odds.toFixed(2) : '-'}
                          </div>
                        </div>
                        <div className={`rounded-lg p-2 text-center border ${
                          game.prediction === 'under'
                            ? `${sportColor.bg} ${sportColor.border} border-2`
                            : 'bg-muted/30'
                        }`}>
                          <div className={`text-xs ${
                            game.prediction === 'under' ? sportColor.text : 'text-muted-foreground'
                          }`}>
                            언더
                          </div>
                          <div className={`font-bold text-sm ${
                            game.prediction === 'under' ? sportColor.text : ''
                          }`}>
                            {game.prediction === 'under' ? game.odds.toFixed(2) : '-'}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Match Result (if finished) */}
                  {game.match.status === 'finished' && game.match.homeScore !== undefined && (
                    <div className="mt-2 text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1">
                      최종: {game.match.homeTeam} {game.match.homeScore} - {game.match.awayScore} {game.match.awayTeam}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Slip Footer - Summary */}
          <div className="px-3 py-3 bg-muted/20 border-t">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Circle className="h-3 w-3 fill-primary text-primary" />
                  {slip.ballsUsed}볼 사용
                </span>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground mb-0.5">
                  총 배당 {slip.totalOdds.toFixed(2)}배
                </div>
                <div className={`text-sm font-bold ${
                  resultStatus === 'win'
                    ? 'text-emerald-600'
                    : resultStatus === 'lose'
                      ? 'text-red-600'
                      : 'text-muted-foreground'
                }`}>
                  {resultStatus === 'pending'
                    ? `예상 +${Math.floor(slip.ballsUsed * slip.totalOdds)}볼`
                    : resultStatus === 'win'
                      ? `+${slip.pointsEarned || Math.floor(slip.ballsUsed * slip.totalOdds)}볼 획득`
                      : `-${slip.ballsUsed}볼`
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

// Regular Prediction Card (for non-betman predictions)
function RegularPredictionCard({ prediction }: { prediction: RegularPrediction }) {
  return (
    <Card className="p-4 overflow-hidden">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* Match Info */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded font-medium">
              {prediction.match.league}
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(prediction.match.matchTime).toLocaleDateString("ko-KR", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>

          {/* Teams */}
          <p className="font-medium text-sm mb-2">
            {prediction.match.homeTeam} vs {prediction.match.awayTeam}
          </p>

          {/* Prediction Info */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs px-2 py-1 bg-muted rounded">
              예측: {
                prediction.predictedValue === "home" ? prediction.match.homeTeam + " 승" :
                prediction.predictedValue === "away" ? prediction.match.awayTeam + " 승" :
                prediction.predictedValue === "over" ? "오버" :
                prediction.predictedValue === "under" ? "언더" :
                prediction.predictedValue === "draw" ? "무승부" : prediction.predictedValue
              }
            </span>
            <span className="text-xs text-muted-foreground">
              배당 {prediction.oddsAtPrediction.toFixed(2)}
            </span>
            <span className="text-xs text-muted-foreground">
              {prediction.amount}볼 사용
            </span>
          </div>
        </div>

        {/* Result */}
        <div className="text-right">
          {prediction.isCorrect === null ? (
            <div className="flex items-center gap-1 text-amber-500">
              <Clock className="h-4 w-4" />
              <span className="text-xs font-medium">대기중</span>
            </div>
          ) : prediction.isCorrect ? (
            <div>
              <div className="flex items-center gap-1 text-emerald-500 mb-1">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-xs font-medium">적중</span>
              </div>
              <p className="text-sm font-bold text-emerald-600">
                +{prediction.pointsEarned} 볼
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-red-500">
              <XCircle className="h-4 w-4" />
              <span className="text-xs font-medium">미적중</span>
            </div>
          )}
        </div>
      </div>

      {/* Match Result (if finished) */}
      {prediction.match.status === "finished" && prediction.match.homeScore !== undefined && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs text-muted-foreground">
            최종 스코어: {prediction.match.homeTeam} {prediction.match.homeScore} - {prediction.match.awayScore} {prediction.match.awayTeam}
          </p>
        </div>
      )}
    </Card>
  )
}

export default function MyPredictionsPage() {
  const { isSignedIn, isLoaded } = useAuth()
  const router = useRouter()
  const [predictions, setPredictions] = useState<PredictionItem[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "correct" | "incorrect">("all")
  const [expandedSlips, setExpandedSlips] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      return
    }

    async function fetchMyPredictions() {
      if (!isSignedIn) return

      setIsLoading(true)
      try {
        const response = await fetch('/api/predictions/my')
        if (response.ok) {
          const data = await response.json()
          setPredictions(data.predictions || [])
          setStats(data.stats || null)
        }
      } catch (error) {
        console.error('Failed to fetch predictions:', error)
      } finally {
        setIsLoading(false)
      }
    }

    if (isSignedIn) {
      fetchMyPredictions()
    }
  }, [isSignedIn, isLoaded, router])

  // Toggle slip expansion
  const toggleSlip = (slipId: string) => {
    setExpandedSlips(prev => {
      const newSet = new Set(prev)
      if (newSet.has(slipId)) {
        newSet.delete(slipId)
      } else {
        newSet.add(slipId)
      }
      return newSet
    })
  }

  // Filter predictions
  const filteredPredictions = predictions.filter((pred) => {
    if (activeTab === "all") return true
    if (activeTab === "pending") return pred.isCorrect === null
    if (activeTab === "correct") return pred.isCorrect === true
    if (activeTab === "incorrect") return pred.isCorrect === false
    return true
  })

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-20 px-4">
          <div className="bg-card border border-border rounded-xl p-8 text-center max-w-sm">
            <Trophy className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <h2 className="text-lg font-bold mb-2">로그인이 필요합니다</h2>
            <p className="text-sm text-muted-foreground mb-4">내 예측 내역을 확인하려면 먼저 로그인해주세요.</p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => router.push("/")}>홈으로</Button>
              <Button onClick={() => router.push("/sign-up")}>로그인 / 가입</Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main id="main-content" className="mx-auto px-4 py-6 max-w-[800px]" tabIndex={-1}>
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Trophy className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">승부예측 내역</h1>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <Card className="p-4 text-center">
              <Target className="h-5 w-5 mx-auto mb-2 text-primary" />
              <p className="text-2xl font-bold">{stats.totalPredictions}</p>
              <p className="text-xs text-muted-foreground">총 예측</p>
            </Card>
            <Card className="p-4 text-center">
              <CheckCircle2 className="h-5 w-5 mx-auto mb-2 text-emerald-500" />
              <p className="text-2xl font-bold">{stats.correctPredictions}</p>
              <p className="text-xs text-muted-foreground">적중</p>
            </Card>
            <Card className="p-4 text-center">
              <TrendingUp className="h-5 w-5 mx-auto mb-2 text-blue-500" />
              <p className="text-2xl font-bold">{stats.accuracy.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground">적중률</p>
            </Card>
            <Card className="p-4 text-center">
              <Trophy className="h-5 w-5 mx-auto mb-2 text-amber-500" />
              <p className="text-2xl font-bold text-emerald-600">+{stats.totalPointsEarned}</p>
              <p className="text-xs text-muted-foreground">획득 볼</p>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="all">전체</TabsTrigger>
            <TabsTrigger value="pending">대기중</TabsTrigger>
            <TabsTrigger value="correct">적중</TabsTrigger>
            <TabsTrigger value="incorrect">미적중</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab}>
            {isLoading ? (
              <Card className="p-8 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">예측 내역을 불러오는 중...</p>
              </Card>
            ) : filteredPredictions.length > 0 ? (
              <div className="space-y-3">
                {filteredPredictions.map((pred) => {
                  if ('type' in pred && pred.type === 'betman_slip') {
                    return (
                      <BettingSlipCard
                        key={pred.id}
                        slip={pred as BetmanSlip}
                        isExpanded={expandedSlips.has(pred.id)}
                        onToggle={() => toggleSlip(pred.id)}
                      />
                    )
                  } else {
                    return (
                      <RegularPredictionCard
                        key={pred.id}
                        prediction={pred as RegularPrediction}
                      />
                    )
                  }
                })}
              </div>
            ) : (
              <Card className="p-12 text-center">
                <Trophy className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">
                  {activeTab === "all" ? "예측 내역이 없습니다" :
                   activeTab === "pending" ? "대기중인 예측이 없습니다" :
                   activeTab === "correct" ? "적중한 예측이 없습니다" :
                   "미적중 예측이 없습니다"}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  승부예측에 참여해보세요!
                </p>
                <Button onClick={() => router.push("/")}>
                  예측하러 가기
                </Button>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@clerk/nextjs"
import { Header } from "@/components/header"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Trophy, ArrowLeft, Target, TrendingUp, CheckCircle2, XCircle, Clock } from "lucide-react"
import { useRouter } from "next/navigation"

interface Prediction {
  id: string
  matchId: string
  predictionType: string
  predictedValue: string
  oddsAtPrediction: number
  amount: number
  isCorrect: boolean | null
  pointsEarned: number | null
  createdAt: Date
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

interface Stats {
  totalPredictions: number
  correctPredictions: number
  accuracy: number
  totalPointsEarned: number
  totalPointsUsed: number
}

// 상대적 시간 포맷팅
function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return "방금 전"
  if (diffMins < 60) return `${diffMins}분 전`
  if (diffHours < 24) return `${diffHours}시간 전`
  if (diffDays < 7) return `${diffDays}일 전`
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })
}

export default function MyPredictionsPage() {
  const { isSignedIn, isLoaded } = useAuth()
  const router = useRouter()
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "correct" | "incorrect">("all")

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push("/")
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

  // 필터링된 예측 목록
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
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main id="main-content" className="mx-auto px-4 py-6 max-w-[800px]" tabIndex={-1}>
        {/* 헤더 */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Trophy className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">승부예측 내역</h1>
          </div>
        </div>

        {/* 통계 카드 */}
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

        {/* 탭 */}
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
                {filteredPredictions.map((pred) => (
                  <Card key={pred.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        {/* 경기 정보 */}
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded font-medium">
                            {pred.match.league}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(pred.match.matchTime).toLocaleDateString("ko-KR", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>

                        {/* 팀 정보 */}
                        <p className="font-medium text-sm mb-2">
                          {pred.match.homeTeam} vs {pred.match.awayTeam}
                        </p>

                        {/* 예측 정보 */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs px-2 py-1 bg-muted rounded">
                            예측: {pred.predictedValue === "home" ? pred.match.homeTeam + " 승" : pred.predictedValue === "away" ? pred.match.awayTeam + " 승" : "무승부"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            배당 {pred.oddsAtPrediction.toFixed(2)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {pred.amount}볼 사용
                          </span>
                        </div>
                      </div>

                      {/* 결과 */}
                      <div className="text-right">
                        {pred.isCorrect === null ? (
                          <div className="flex items-center gap-1 text-amber-500">
                            <Clock className="h-4 w-4" />
                            <span className="text-xs font-medium">대기중</span>
                          </div>
                        ) : pred.isCorrect ? (
                          <div>
                            <div className="flex items-center gap-1 text-emerald-500 mb-1">
                              <CheckCircle2 className="h-4 w-4" />
                              <span className="text-xs font-medium">적중</span>
                            </div>
                            <p className="text-sm font-bold text-emerald-600">
                              +{pred.pointsEarned} 볼
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

                    {/* 경기 결과 (종료된 경우) */}
                    {pred.match.status === "finished" && pred.match.homeScore !== undefined && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-xs text-muted-foreground">
                          최종 스코어: {pred.match.homeTeam} {pred.match.homeScore} - {pred.match.awayScore} {pred.match.awayTeam}
                        </p>
                      </div>
                    )}
                  </Card>
                ))}
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

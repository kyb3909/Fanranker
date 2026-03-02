"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@clerk/nextjs"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Trophy, ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"

import {
  type PredictionItem,
  type BetmanSlip,
  type RegularPrediction,
  type Stats,
} from "@/components/my-predictions/prediction-types"
import { BettingSlipCard } from "@/components/my-predictions/prediction-slip-card"
import { RegularPredictionCard } from "@/components/my-predictions/regular-prediction-card"
import { PredictionStatsSummary } from "@/components/my-predictions/prediction-stats-summary"

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
        const response = await fetch("/api/predictions/my")
        if (response.ok) {
          const data = await response.json()
          setPredictions(data.predictions || [])
          setStats(data.stats || null)
        }
      } catch {
        // Silent fail - predictions list will show empty
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
    setExpandedSlips((prev) => {
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
      <div className="flex items-center justify-center py-20">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!isSignedIn) {
    return (
      <div className="flex items-center justify-center px-4 py-20">
        <div className="bg-card border-border max-w-sm rounded-xl border p-8 text-center">
          <Trophy className="text-muted-foreground mx-auto mb-3 h-8 w-8" />
          <h2 className="mb-2 text-lg font-bold">로그인이 필요합니다</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            내 예측 내역을 확인하려면 먼저 로그인해주세요.
          </p>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={() => router.push("/")}>
              홈으로
            </Button>
            <Button onClick={() => router.push("/sign-up")}>로그인 / 가입</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <main id="main-content" className="mx-auto max-w-[800px] px-4 py-6" tabIndex={-1}>
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Trophy className="text-primary h-6 w-6" />
          <h1 className="text-xl font-bold">승부예측 내역</h1>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && <PredictionStatsSummary stats={stats} />}

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        className="w-full"
      >
        <TabsList className="mb-4 grid w-full grid-cols-4">
          <TabsTrigger value="all">전체</TabsTrigger>
          <TabsTrigger value="pending">대기중</TabsTrigger>
          <TabsTrigger value="correct">적중</TabsTrigger>
          <TabsTrigger value="incorrect">미적중</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>
          {isLoading ? (
            <Card className="p-8 text-center">
              <Loader2 className="text-muted-foreground mx-auto mb-2 h-8 w-8 animate-spin" />
              <p className="text-muted-foreground text-sm">예측 내역을 불러오는 중...</p>
            </Card>
          ) : filteredPredictions.length > 0 ? (
            <div className="space-y-3">
              {filteredPredictions.map((pred) => {
                if ("type" in pred && pred.type === "betman_slip") {
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
                    <RegularPredictionCard key={pred.id} prediction={pred as RegularPrediction} />
                  )
                }
              })}
            </div>
          ) : (
            <Card className="p-12 text-center">
              <Trophy className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
              <h3 className="mb-2 text-lg font-semibold">
                {activeTab === "all"
                  ? "예측 내역이 없습니다"
                  : activeTab === "pending"
                    ? "대기중인 예측이 없습니다"
                    : activeTab === "correct"
                      ? "적중한 예측이 없습니다"
                      : "미적중 예측이 없습니다"}
              </h3>
              <p className="text-muted-foreground mb-4 text-sm">승부예측에 참여해보세요!</p>
              <Button onClick={() => router.push("/")}>예측하러 가기</Button>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </main>
  )
}

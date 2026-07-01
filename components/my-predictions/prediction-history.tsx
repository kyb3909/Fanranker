"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Trophy } from "lucide-react"

import {
  type PredictionItem,
  type SportsSlip,
  type RegularPrediction,
  type Stats,
} from "./prediction-types"
import { BettingSlipCard } from "./prediction-slip-card"
import { RegularPredictionCard } from "./regular-prediction-card"
import { PredictionStatsSummary } from "./prediction-stats-summary"

/**
 * 예측 기록 본문 (stats + 탭 + 리스트). eventSlug 주면 그 이벤트(월드컵) 한정 조회.
 * /my-predictions(일반)와 /worldcup/my-predictions(월드컵 전용) 양쪽에서 재사용.
 */
export function PredictionHistory({ eventSlug }: { eventSlug?: string }) {
  const { isSignedIn, isLoaded } = useAuth()
  const router = useRouter()
  const [predictions, setPredictions] = useState<PredictionItem[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "correct" | "incorrect">("all")
  const [expandedSlips, setExpandedSlips] = useState<Set<string>>(new Set())
  // SSR/hydration 첫 렌더 일치용. Clerk isLoaded 가 SSR(서버 세션)=true 인데
  // 클라 첫 hydration 에선 false(Clerk JS 로드 전)라 분기가 갈려, 서버는
  // "불러오는 중" 텍스트를 그리고 클라는 스피너만 그려 #418(텍스트 불일치)이 났다.
  // mounted=false 동안은 SSR·첫 hydration 모두 동일한 로딩 UI만 그린다.
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      return
    }

    async function fetchMyPredictions() {
      if (!isSignedIn) return

      setIsLoading(true)
      try {
        const url = eventSlug
          ? `/api/predictions/my?event=${encodeURIComponent(eventSlug)}`
          : "/api/predictions/my"
        const response = await fetch(url)
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
  }, [isSignedIn, isLoaded, eventSlug])

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

  const filteredPredictions = predictions.filter((pred) => {
    // 취소된 슬립은 is_correct가 null이지만 "대기중"이 아니라 "취소됨" — pending 탭에서 제외
    const isCancelled = "isCancelled" in pred && pred.isCancelled
    if (activeTab === "all") return true
    if (activeTab === "pending") return pred.isCorrect === null && !isCancelled
    if (activeTab === "correct") return pred.isCorrect === true
    if (activeTab === "incorrect") return pred.isCorrect === false
    return true
  })

  const wcCard = {
    background: "var(--wc-card)",
    boxShadow: "var(--wc-shadow-1)",
  } as const

  if (!mounted || !isLoaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!isSignedIn) {
    return (
      <div
        className="rounded-xl p-8 text-center"
        style={{ ...wcCard, border: "1px solid var(--wc-line)" }}
      >
        <Trophy className="mx-auto mb-3 h-8 w-8" style={{ color: "var(--wc-mute)" }} />
        <h2 className="mb-2 text-lg font-bold" style={{ color: "var(--wc-ink)" }}>
          로그인이 필요합니다
        </h2>
        <p className="mb-4 text-sm" style={{ color: "var(--wc-mute)" }}>
          내 예측 내역을 확인하려면 먼저 로그인해주세요.
        </p>
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={() => router.push("/")}>
            홈으로
          </Button>
          <Button onClick={() => router.push("/sign-up")}>로그인 / 가입</Button>
        </div>
      </div>
    )
  }

  return (
    <>
      {stats && <PredictionStatsSummary stats={stats} eventSlug={eventSlug} />}

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        className="w-full"
      >
        <TabsList
          className="mb-4 h-auto w-full justify-start gap-0 rounded-none p-0"
          style={{ background: "transparent", borderBottom: "1px solid var(--wc-line)" }}
        >
          {(["all", "pending", "correct", "incorrect"] as const).map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-semibold shadow-none data-[state=active]:border-[var(--wc-burgundy)] data-[state=active]:bg-transparent data-[state=active]:text-[color:var(--wc-burgundy)] data-[state=active]:shadow-none"
              style={{ color: "var(--wc-mute)" }}
            >
              {tab === "all"
                ? "전체"
                : tab === "pending"
                  ? "대기중"
                  : tab === "correct"
                    ? "적중"
                    : "미적중"}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeTab}>
          {isLoading ? (
            <div className="rounded-lg p-8 text-center" style={wcCard}>
              <Loader2
                className="mx-auto mb-2 h-8 w-8 animate-spin"
                style={{ color: "var(--wc-mute)" }}
              />
              <p className="text-sm" style={{ color: "var(--wc-mute)" }}>
                예측 내역을 불러오는 중...
              </p>
            </div>
          ) : filteredPredictions.length > 0 ? (
            <div className="space-y-3">
              {filteredPredictions.map((pred) => {
                if ("type" in pred && pred.type === "sports_slip") {
                  return (
                    <BettingSlipCard
                      key={pred.id}
                      slip={pred as SportsSlip}
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
            <div className="rounded-lg p-12 text-center" style={wcCard}>
              <Trophy className="mx-auto mb-4 h-12 w-12" style={{ color: "var(--wc-mute)" }} />
              <h3 className="mb-2 text-lg font-bold" style={{ color: "var(--wc-ink)" }}>
                {activeTab === "all"
                  ? "예측 내역이 없습니다"
                  : activeTab === "pending"
                    ? "대기중인 예측이 없습니다"
                    : activeTab === "correct"
                      ? "적중한 예측이 없습니다"
                      : "미적중 예측이 없습니다"}
              </h3>
              <p className="mb-4 text-sm" style={{ color: "var(--wc-mute)" }}>
                {eventSlug ? "월드컵 경기를 예측해보세요!" : "승부예측에 참여해보세요!"}
              </p>
              <Button
                onClick={() => router.push(eventSlug ? "/worldcup/games" : "/")}
                style={{ background: "var(--wc-burgundy)", color: "white" }}
              >
                예측하러 가기
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  )
}

"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import Link from "@/components/ui/app-link"
import { User } from "lucide-react"
import { useAuth } from "@clerk/nextjs"
import { BettingMyStats } from "./betting-my-stats"
import { BettingPredictionHistory } from "./betting-prediction-history"
import type { MyStatsData, PredictionHistoryItem } from "@/types/betting"

interface MypageTabProps {
  myPageTab: "predictions" | "stats" | "gold" | "profile"
  predictionHistory: PredictionHistoryItem[]
  isLoadingHistory: boolean
  myStats: MyStatsData | null
  isLoadingMyStats: boolean
}

export function MypageTab({
  myPageTab,
  predictionHistory,
  isLoadingHistory,
  myStats,
  isLoadingMyStats,
}: MypageTabProps) {
  const { isSignedIn, userId } = useAuth()

  if (!isSignedIn) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground mb-3 text-sm">로그인이 필요한 기능입니다.</p>
        <Button variant="default" size="sm" onClick={() => (window.location.href = "/sign-up")}>
          로그인하기
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {myPageTab === "predictions" && (
        <BettingPredictionHistory
          predictionHistory={predictionHistory}
          isLoading={isLoadingHistory}
        />
      )}
      {myPageTab === "stats" && <BettingMyStats myStats={myStats} isLoading={isLoadingMyStats} />}
      {myPageTab === "gold" && (
        <div className="p-6 text-center">
          <p className="text-muted-foreground text-sm">골드 내역 기능 준비중입니다.</p>
        </div>
      )}
      {myPageTab === "profile" && (
        <Card className="p-4">
          <div className="flex flex-col items-center gap-4">
            <div className="bg-muted flex h-20 w-20 items-center justify-center rounded-full">
              <User className="text-muted-foreground h-10 w-10" />
            </div>
            <p className="text-muted-foreground text-sm">
              프로필에서 닉네임과 소개를 확인하고 수정할 수 있습니다.
            </p>
            <Button asChild className="w-full">
              <Link href={`/profile/${userId}`}>프로필 수정하기</Link>
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}

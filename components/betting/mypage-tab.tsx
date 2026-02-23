"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { User } from "lucide-react"
import { useAuth } from "@clerk/nextjs"
import { BettingMyStats } from "./betting-my-stats"
import { BettingPredictionHistory } from "./betting-prediction-history"
import type { MyStatsData, PredictionHistoryItem } from "./betting-types"

interface MypageTabProps {
  myPageTab: "predictions" | "stats" | "gold" | "profile"
  predictionHistory: PredictionHistoryItem[]
  isLoadingHistory: boolean
  myStats: MyStatsData | null
  isLoadingMyStats: boolean
}

export function MypageTab({ myPageTab, predictionHistory, isLoadingHistory, myStats, isLoadingMyStats }: MypageTabProps) {
  const { isSignedIn } = useAuth()

  if (!isSignedIn) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground mb-3">로그인이 필요한 기능입니다.</p>
        <Button variant="default" size="sm" onClick={() => window.location.href = "/sign-up"}>로그인하기</Button>
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
      {myPageTab === "stats" && (
        <BettingMyStats myStats={myStats} isLoading={isLoadingMyStats} />
      )}
      {myPageTab === "gold" && (
        <div className="p-6 text-center">
          <p className="text-sm text-muted-foreground">골드 내역 기능 준비중입니다.</p>
        </div>
      )}
      {myPageTab === "profile" && (
        <Card className="p-4">
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
              <User className="w-10 h-10 text-muted-foreground" />
            </div>
            <div className="w-full space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">닉네임</label>
                <Input placeholder="닉네임을 입력하세요" className="mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">이메일</label>
                <Input type="email" placeholder="이메일을 입력하세요" className="mt-1" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">소개</label>
                <Input placeholder="자기소개를 입력하세요" className="mt-1" />
              </div>
              <Button className="w-full">저장하기</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

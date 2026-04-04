"use client"

import { useState } from "react"
import { useAuth, useClerk } from "@clerk/nextjs"
import { ArrowLeft, Users, Hammer, Trophy } from "lucide-react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import Link from "@/components/ui/app-link"
import { fetcher } from "@/lib/swr"
import { StadiumBackground } from "@/components/stadium/stadium-background"
import { ConstructionGauge } from "@/components/stadium/construction-gauge"
import { InvestDialog } from "@/components/stadium/invest-dialog"

interface StadiumData {
  team: {
    team_id: string
    team_name: string
    team_short_name: string
    sport: string
    league_id: string
    city: string
    color: string
  }
  stadium: {
    level: number
    total_points: number
    fan_count: number
  }
  level_info: {
    name: string
    description: string
    current_required: number
    next_level_points: number | null
    progress_pct: number
  }
  recent_contributors: {
    user_id: string
    nickname: string
    avatar_url: string | null
    points: number
  }[]
}

interface StadiumRoomProps {
  teamId: string
  initialData: StadiumData
}

export function StadiumRoom({ teamId, initialData }: StadiumRoomProps) {
  const { isSignedIn } = useAuth()
  const { openSignIn } = useClerk()
  const [investOpen, setInvestOpen] = useState(false)

  const { data, mutate } = useSWR<StadiumData>(`/api/stadiums/${teamId}`, fetcher, {
    fallbackData: initialData,
    revalidateOnFocus: false,
  })

  const stadiumData = data ?? initialData
  const { team, stadium, level_info, recent_contributors } = stadiumData

  // 승부예측 수익 잔액 (투자 가능 포인트) 조회
  const { data: earningsData, mutate: mutateEarnings } = useSWR(
    isSignedIn ? "/api/stadiums/my-earnings" : null,
    fetcher,
    { revalidateOnFocus: false }
  )
  const availablePoints = earningsData?.available ?? 0

  const handleInvestClick = () => {
    if (!isSignedIn) {
      openSignIn()
      return
    }
    setInvestOpen(true)
  }

  const handleInvestSuccess = () => {
    mutate() // 경기장 데이터 새로고침
    mutateEarnings() // 수익 잔액 갱신
  }

  return (
    <main id="main-content" className="mx-auto max-w-[600px] px-4 py-6" tabIndex={-1}>
      {/* 뒤로가기 */}
      <Link
        href="/stadium"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        스타디움
      </Link>

      {/* 팀 헤더 */}
      <div className="mb-4 flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg text-lg"
          style={{
            backgroundColor: team.color + "20",
            borderColor: team.color + "40",
            borderWidth: 1,
          }}
        >
          <Trophy className="h-5 w-5" style={{ color: team.color }} />
        </div>
        <div>
          <h1 className="text-lg font-bold">{team.team_name}</h1>
          <p className="text-muted-foreground text-xs">{team.city}</p>
        </div>
      </div>

      {/* 경기장 배경 */}
      <StadiumBackground level={stadium.level} teamColor={team.color} />

      {/* 건설 게이지 */}
      <Card className="mt-3 p-4">
        <ConstructionGauge
          level={stadium.level}
          levelName={level_info.name}
          totalPoints={stadium.total_points}
          currentRequired={level_info.current_required}
          nextLevelPoints={level_info.next_level_points}
          progressPct={level_info.progress_pct}
          color={team.color}
        />

        {/* 투자 버튼 */}
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={handleInvestClick} className="flex-1" size="lg">
            <Hammer className="mr-2 h-4 w-4" />
            벽돌 투자하기
          </Button>
          {isSignedIn && (
            <div className="text-right text-xs">
              <p className="text-muted-foreground">투자 가능</p>
              <p className="font-bold tabular-nums">{availablePoints.toLocaleString()} pt</p>
            </div>
          )}
        </div>
      </Card>

      {/* 팬/기여자 정보 */}
      <Card className="mt-3 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-bold">
            <Users className="h-4 w-4" />
            건설 기여자
          </h2>
          <span className="text-muted-foreground text-xs">총 {stadium.fan_count}명 참여</span>
        </div>

        {recent_contributors.length > 0 ? (
          <div className="space-y-2">
            {recent_contributors.map((contributor, idx) => (
              <div key={contributor.user_id} className="flex items-center gap-2.5">
                <span className="text-muted-foreground w-5 text-center text-xs font-bold">
                  {idx + 1}
                </span>
                <div className="bg-muted flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full">
                  {contributor.avatar_url ? (
                    <img
                      src={contributor.avatar_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-muted-foreground text-[10px] font-bold">
                      {contributor.nickname.charAt(0)}
                    </span>
                  )}
                </div>
                <span className="min-w-0 flex-1 truncate text-sm">{contributor.nickname}</span>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {contributor.points.toLocaleString()} pt
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground py-4 text-center text-sm">
            아직 기여자가 없습니다. 첫 번째 투자자가 되어보세요!
          </p>
        )}
      </Card>

      {/* 투자 다이얼로그 */}
      <InvestDialog
        open={investOpen}
        onOpenChange={setInvestOpen}
        teamId={team.team_id}
        teamName={team.team_name}
        availablePoints={availablePoints}
        onSuccess={handleInvestSuccess}
      />
    </main>
  )
}

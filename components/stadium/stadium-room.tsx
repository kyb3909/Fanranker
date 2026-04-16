"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth, useClerk } from "@clerk/nextjs"
import { ArrowLeft, Users, Hammer, Trophy, LogIn } from "lucide-react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import Link from "@/components/ui/app-link"
import { fetcher } from "@/lib/swr"
import { useStadiumChat } from "@/hooks/use-stadium-chat"
import { StadiumView } from "@/components/stadium/stadium-view"
import { ChatOverlay } from "@/components/stadium/chat-overlay"
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

  // 실시간 채팅 (로그인 시에만 연결)
  const chat = useStadiumChat(isSignedIn ? teamId : "")
  const { moveByKeyboard, moveToPosition } = chat

  // 승부예측 수익 잔액
  const { data: earningsData, mutate: mutateEarnings } = useSWR(
    isSignedIn ? "/api/stadiums/my-earnings" : null,
    fetcher,
    { revalidateOnFocus: false }
  )
  const availablePoints = earningsData?.available ?? 0

  // 키보드 이동
  useEffect(() => {
    if (!isSignedIn) return
    const keys = new Set<string>()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      keys.add(e.key)
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.key)
    }

    let raf: number
    const tick = () => {
      let dx = 0
      let dy = 0
      if (keys.has("ArrowLeft") || keys.has("a")) dx -= 1
      if (keys.has("ArrowRight") || keys.has("d")) dx += 1
      if (keys.has("ArrowUp") || keys.has("w")) dy -= 1
      if (keys.has("ArrowDown") || keys.has("s")) dy += 1
      if (dx !== 0 || dy !== 0) moveByKeyboard(dx, dy)
      raf = requestAnimationFrame(tick)
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    raf = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      cancelAnimationFrame(raf)
    }
  }, [isSignedIn, moveByKeyboard])

  const handleInvestClick = () => {
    if (!isSignedIn) {
      openSignIn()
      return
    }
    setInvestOpen(true)
  }

  const handleInvestSuccess = () => {
    mutate()
    mutateEarnings()
  }

  const handleClickMove = useCallback(
    (x: number, y: number) => {
      if (isSignedIn) moveToPosition(x, y)
    },
    [isSignedIn, moveToPosition]
  )

  return (
    <main id="main-content" className="flex h-[100dvh] flex-col" tabIndex={-1}>
      {/* 상단 바 — 컴팩트 1줄 */}
      <div className="bg-background/80 z-10 flex items-center gap-2 border-b px-3 py-1.5 backdrop-blur-sm">
        <Link href="/stadium" className="text-muted-foreground hover:text-foreground shrink-0 p-1">
          <ArrowLeft className="h-4 w-4" />
        </Link>

        {/* 팀 + 레벨 */}
        <div className="flex min-w-0 items-center gap-1.5">
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
            style={{ backgroundColor: team.color + "20" }}
          >
            <Trophy className="h-3 w-3" style={{ color: team.color }} />
          </div>
          <span className="truncate text-sm font-bold">{team.team_short_name}</span>
          <span className="text-muted-foreground shrink-0 text-[10px]">Lv.{stadium.level}</span>
        </div>

        {/* 게이지 바 (인라인) */}
        <div className="mx-1 h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${level_info.progress_pct}%`,
              backgroundColor: team.color,
            }}
          />
        </div>

        {/* 참여자 수 + 투자 버튼 */}
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-muted-foreground text-[10px] tabular-nums">
            <Users className="mr-0.5 inline h-3 w-3" />
            {stadium.fan_count}
          </span>
          <Button
            onClick={handleInvestClick}
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
          >
            <Hammer className="mr-1 h-3 w-3" />
            투자
          </Button>
        </div>
      </div>

      {/* 메인: 경기장 Canvas + 채팅 오버레이 */}
      <div className="relative flex-1 overflow-hidden">
        <StadiumView
          level={stadium.level}
          teamColor={team.color}
          occupants={chat.occupants}
          myUserId={chat.userId}
          onClickMove={handleClickMove}
        />

        {/* 비로그인 시 입장 안내 */}
        {!isSignedIn && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <Card className="mx-4 max-w-sm p-6 text-center">
              <Trophy className="text-primary mx-auto mb-3 h-10 w-10" />
              <h2 className="mb-1 text-lg font-bold">{team.team_name} 경기장</h2>
              <p className="text-muted-foreground mb-4 text-sm">
                로그인하면 채팅에 참여하고 경기장 건설에 투자할 수 있습니다.
              </p>
              <Button onClick={() => openSignIn()} className="w-full">
                <LogIn className="mr-2 h-4 w-4" />
                로그인하고 입장하기
              </Button>
            </Card>
          </div>
        )}

        {/* 채팅 오버레이 (로그인 시) */}
        {isSignedIn && (
          <ChatOverlay
            messages={chat.messages}
            onlineCount={chat.onlineCount}
            isConnected={chat.isConnected}
            onSend={chat.sendMessage}
            myUserId={chat.userId}
          />
        )}
      </div>

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

"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Landmark, Users, ChevronRight, Lock } from "lucide-react"
import Link from "@/components/ui/app-link"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import {
  getStadiumLevel,
  getNextLevelThreshold,
  STADIUM_LEVELS,
} from "@/lib/constants/stadium-levels"
import { cn } from "@/lib/utils"

interface TeamData {
  team_id: string
  team_name: string
  team_short_name: string
  sport: string
  city: string
  color: string
  stadium_name: string | null
  stadium: {
    level: number
    total_points: number
    fan_count: number
  }
}

export default function StadiumPage() {
  const { data, isLoading } = useSWR("/api/stadiums/map?league=epl", fetcher, {
    revalidateOnFocus: false,
  })

  const teams: TeamData[] = data?.teams ?? []

  // 웸블리를 맨 위로, 나머지는 이름순
  const sorted = [...teams].sort((a, b) => {
    if (a.team_id === "epl_wembley") return -1
    if (b.team_id === "epl_wembley") return 1
    return a.team_name.localeCompare(b.team_name)
  })

  return (
    <main id="main-content" className="mx-auto max-w-[600px] px-4 py-6" tabIndex={-1}>
      <div className="mb-5 flex items-center gap-3">
        <Landmark className="text-primary h-6 w-6" />
        <h1 className="text-xl font-bold">스타디움</h1>
      </div>

      {/* 국가 선택 */}
      <div className="mb-4">
        <button className="bg-primary text-primary-foreground flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium">
          <span className="text-base">🏴󠁧󠁢󠁥󠁮󠁧󠁿</span>
          England
        </button>
        {/* 추후 다른 국가 추가 시 여기에 비활성 버튼 */}
      </div>

      {/* 팀 목록 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
        </div>
      ) : sorted.length === 0 ? (
        <Card className="p-8 text-center">
          <Landmark className="text-muted-foreground/40 mx-auto mb-3 h-10 w-10" />
          <h2 className="text-lg font-semibold">등록된 경기장이 없습니다</h2>
          <p className="text-muted-foreground mt-1 text-sm">DB 마이그레이션을 확인해주세요.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((team) => {
            const levelInfo = getStadiumLevel(team.stadium.level)
            const nextThreshold = getNextLevelThreshold(team.stadium.total_points)
            const currentLevelData = STADIUM_LEVELS.find((l) => l.level === team.stadium.level)
            const isOpen = team.stadium.level >= 10 // 웸블리만 완성
            const isLot = team.stadium.level === 1 // 부지

            const progressPct =
              nextThreshold && currentLevelData
                ? Math.min(
                    100,
                    Math.round(
                      ((team.stadium.total_points - currentLevelData.requiredPoints) /
                        (nextThreshold.requiredPoints - currentLevelData.requiredPoints)) *
                        100
                    )
                  )
                : 100

            const content = (
              <Card
                className={cn(
                  "group p-3.5 transition-colors",
                  isOpen
                    ? "hover:bg-muted/50 border-primary/30 bg-primary/5 cursor-pointer"
                    : "opacity-70"
                )}
              >
                <div className="flex items-center gap-3">
                  {/* 팀 컬러 + 이모지 */}
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg"
                    style={{
                      backgroundColor: team.color + "20",
                      borderColor: team.color + "40",
                      borderWidth: 1,
                    }}
                  >
                    {isOpen ? levelInfo.emoji : "🌱"}
                  </div>

                  {/* 팀 정보 */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-bold">{team.team_name}</span>
                      {isOpen ? (
                        <Badge className="bg-primary/15 text-primary shrink-0 border-0 text-[10px]">
                          OPEN
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="shrink-0 text-[10px] opacity-60">
                          부지
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {team.stadium_name || team.city}
                      {isLot && " · 건설 대기 중"}
                    </p>

                    {/* 프로그레스 바 (부지가 아닌 경우만) */}
                    {!isLot && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${progressPct}%`,
                              backgroundColor: team.color || "hsl(var(--primary))",
                            }}
                          />
                        </div>
                        <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
                          Lv.{team.stadium.level}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* 우측 */}
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {isOpen ? (
                      <>
                        <div className="text-muted-foreground flex items-center gap-1 text-xs">
                          <Users className="h-3 w-3" />
                          <span className="tabular-nums">
                            {team.stadium.fan_count.toLocaleString()}
                          </span>
                        </div>
                        <ChevronRight className="text-muted-foreground/40 group-hover:text-foreground h-4 w-4 transition-colors" />
                      </>
                    ) : (
                      <Lock className="text-muted-foreground/30 h-4 w-4" />
                    )}
                  </div>
                </div>
              </Card>
            )

            if (isOpen) {
              return (
                <Link key={team.team_id} href={`/stadium/${team.team_id}`}>
                  {content}
                </Link>
              )
            }

            return <div key={team.team_id}>{content}</div>
          })}
        </div>
      )}
    </main>
  )
}

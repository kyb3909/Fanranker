"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Landmark, Users, ChevronRight } from "lucide-react"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import {
  STADIUM_LEVELS,
  getStadiumLevel,
  getNextLevelThreshold,
} from "@/lib/constants/stadium-levels"
import { cn } from "@/lib/utils"

const SPORT_TABS = [
  { key: "baseball", label: "야구", leagues: [{ id: "kbo", name: "KBO" }] },
  {
    key: "football",
    label: "축구",
    leagues: [
      { id: "kleague1", name: "K리그1" },
      { id: "kleague2", name: "K리그2" },
    ],
  },
  {
    key: "basketball",
    label: "농구",
    leagues: [
      { id: "kbl", name: "KBL" },
      { id: "wkbl", name: "WKBL" },
    ],
  },
  {
    key: "volleyball",
    label: "배구",
    leagues: [
      { id: "kovo_men", name: "V리그 남자" },
      { id: "kovo_women", name: "V리그 여자" },
    ],
  },
]

interface TeamData {
  team_id: string
  team_name: string
  team_short_name: string
  sport: string
  city: string
  color: string
  stadium: {
    level: number
    total_points: number
    fan_count: number
  }
}

export default function StadiumPage() {
  const [activeSport, setActiveSport] = useState("baseball")
  const sport = SPORT_TABS.find((s) => s.key === activeSport)!
  const [activeLeague, setActiveLeague] = useState(sport.leagues[0].id)

  const { data, isLoading } = useSWR(`/api/stadiums/map?league=${activeLeague}`, fetcher, {
    revalidateOnFocus: false,
  })

  const teams: TeamData[] = data?.teams ?? []

  const handleSportChange = (sportKey: string) => {
    setActiveSport(sportKey)
    const newSport = SPORT_TABS.find((s) => s.key === sportKey)!
    setActiveLeague(newSport.leagues[0].id)
  }

  return (
    <main id="main-content" className="mx-auto max-w-[600px] px-4 py-6" tabIndex={-1}>
      <div className="mb-5 flex items-center gap-3">
        <Landmark className="text-primary h-6 w-6" />
        <h1 className="text-xl font-bold">스타디움</h1>
      </div>

      {/* 종목 탭 */}
      <div className="mb-3 flex gap-1.5 overflow-x-auto">
        {SPORT_TABS.map((s) => (
          <button
            key={s.key}
            onClick={() => handleSportChange(s.key)}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              activeSport === s.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* 리그 탭 (2개 이상일 때만) */}
      {sport.leagues.length > 1 && (
        <div className="mb-4 flex gap-1">
          {sport.leagues.map((league) => (
            <button
              key={league.id}
              onClick={() => setActiveLeague(league.id)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                activeLeague === league.id
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {league.name}
            </button>
          ))}
        </div>
      )}

      {/* 팀 목록 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
        </div>
      ) : teams.length === 0 ? (
        <Card className="p-8 text-center">
          <Landmark className="text-muted-foreground/40 mx-auto mb-3 h-10 w-10" />
          <h2 className="text-lg font-semibold">등록된 팀이 없습니다</h2>
          <p className="text-muted-foreground mt-1 text-sm">곧 팀 경기장이 추가됩니다.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {teams.map((team) => {
            const levelInfo = getStadiumLevel(team.stadium.level)
            const nextThreshold = getNextLevelThreshold(team.stadium.total_points)
            const currentLevelData = STADIUM_LEVELS.find((l) => l.level === team.stadium.level)
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

            return (
              <Card
                key={team.team_id}
                className="group hover:bg-muted/50 cursor-pointer p-3.5 transition-colors"
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
                    {levelInfo.emoji}
                  </div>

                  {/* 팀 정보 */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-bold">{team.team_name}</span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        Lv.{team.stadium.level}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {levelInfo.nameKo} · {team.city}
                    </p>

                    {/* 프로그레스 바 */}
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
                        {progressPct}%
                      </span>
                    </div>
                  </div>

                  {/* 팬 수 */}
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <div className="text-muted-foreground flex items-center gap-1 text-xs">
                      <Users className="h-3 w-3" />
                      <span className="tabular-nums">
                        {team.stadium.fan_count.toLocaleString()}
                      </span>
                    </div>
                    <ChevronRight className="text-muted-foreground/40 group-hover:text-foreground h-4 w-4 transition-colors" />
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </main>
  )
}

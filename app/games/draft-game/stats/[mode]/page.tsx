"use client"

import { useParams } from "next/navigation"
import { useState, useEffect } from "react"
import { ArrowLeft, BarChart3, TrendingUp, Users } from "lucide-react"
import Link from "next/link"
import { GAME_MODES } from "@/lib/draft/game-modes"
import { calculatePlayerStats, loadHistory } from "@/lib/draft/history"

interface PlayerStat {
  playerId: string
  avgDraftPosition: number
  draftedPercentage: number
  totalSelections: number
  totalDrafts: number
}

export default function DraftStatsPage() {
  const params = useParams()
  const modeId = params.mode as string
  const mode = GAME_MODES[modeId]

  const [stats, setStats] = useState<PlayerStat[]>([])
  const [totalDrafts, setTotalDrafts] = useState(0)
  const [sortBy, setSortBy] = useState<"adp" | "rate">("adp")

  useEffect(() => {
    if (!mode) return

    const history = loadHistory()
    const modeHistory = history[modeId]
    setTotalDrafts(modeHistory?.totalDrafts ?? 0)

    const playerStats = calculatePlayerStats(
      modeId,
      mode.players.map((p) => p.id),
      mode.totalPicks
    )
    setStats(playerStats)
  }, [modeId, mode])

  if (!mode) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">존재하지 않는 게임 모드입니다.</p>
        <Link href="/games/draft-game" className="text-primary text-sm mt-2 inline-block hover:underline">
          돌아가기
        </Link>
      </div>
    )
  }

  const sorted = [...stats].sort((a, b) => {
    if (sortBy === "adp") return a.avgDraftPosition - b.avgDraftPosition
    return b.draftedPercentage - a.draftedPercentage
  })

  const playerMap = new Map(mode.players.map((p) => [p.id, p]))

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <Link
          href="/games/draft-game"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          게임 선택으로
        </Link>

        <div className="flex items-center gap-3">
          <span className="text-3xl">{mode.icon}</span>
          <div>
            <h1 className="text-xl font-bold text-foreground">{mode.name} 통계</h1>
            <p className="text-sm text-muted-foreground">드래프트 기록 분석</p>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <BarChart3 className="h-5 w-5 text-primary mx-auto mb-1" />
          <p className="text-lg font-bold text-foreground">{totalDrafts}</p>
          <p className="text-[10px] text-muted-foreground">총 드래프트</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <Users className="h-5 w-5 text-primary mx-auto mb-1" />
          <p className="text-lg font-bold text-foreground">{mode.players.length}</p>
          <p className="text-[10px] text-muted-foreground">총 선수</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <TrendingUp className="h-5 w-5 text-primary mx-auto mb-1" />
          <p className="text-lg font-bold text-foreground">{mode.picksPerTeam * 4}</p>
          <p className="text-[10px] text-muted-foreground">회당 총 픽</p>
        </div>
      </div>

      {totalDrafts === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-xl">
          <BarChart3 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">아직 드래프트 기록이 없습니다.</p>
          <Link
            href="/games/draft-game"
            className="text-primary text-sm mt-2 inline-block hover:underline"
          >
            드래프트 시작하기
          </Link>
        </div>
      ) : (
        <>
          {/* Sort toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setSortBy("adp")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                sortBy === "adp"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              ADP 순위
            </button>
            <button
              onClick={() => setSortBy("rate")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                sortBy === "rate"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              선발률 순
            </button>
          </div>

          {/* Stats table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground">
                  <th className="text-left px-3 py-2 text-xs font-medium">#</th>
                  <th className="text-left px-3 py-2 text-xs font-medium">선수</th>
                  <th className="text-center px-3 py-2 text-xs font-medium">포지션</th>
                  <th className="text-center px-3 py-2 text-xs font-medium">ADP</th>
                  <th className="text-center px-3 py-2 text-xs font-medium">선발률</th>
                  <th className="text-center px-3 py-2 text-xs font-medium">선발 횟수</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((stat, idx) => {
                  const player = playerMap.get(stat.playerId)
                  if (!player) return null

                  return (
                    <tr
                      key={stat.playerId}
                      className="border-t border-border hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-3 py-2 text-xs text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium text-foreground">{player.name}</td>
                      <td className="px-3 py-2 text-center">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {player.position}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-foreground">
                        {stat.totalSelections > 0
                          ? stat.avgDraftPosition.toFixed(1)
                          : "-"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${Math.min(stat.draftedPercentage, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono text-foreground">
                            {stat.draftedPercentage.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center text-xs text-muted-foreground">
                        {stat.totalSelections}/{stat.totalDrafts}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

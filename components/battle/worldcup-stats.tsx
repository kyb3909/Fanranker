"use client"

import { useState, useEffect } from "react"
import { BarChart3, Brain } from "lucide-react"

interface MbtiGroup {
  mbti: string
  participant_count: number
  candidates: {
    id: string
    name: string
    image_url: string | null
    vote_count: number
    win_count: number
  }[]
}

export function WorldcupStatsPreview() {
  return (
    <div className="border-border bg-card rounded-xl border p-6 text-center shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
      <BarChart3 className="text-muted-foreground mx-auto h-8 w-8" />
      <p className="text-muted-foreground mt-2 text-sm">참여 후 전체 통계를 확인할 수 있습니다</p>
    </div>
  )
}

export function WinnerStatsSection({
  battleId,
  stats,
}: {
  battleId: string
  stats: { candidate_id: string; name: string; image_url: string | null; win_count: number }[]
}) {
  const [tab, setTab] = useState<"general" | "mbti">("general")
  const [mbtiStats, setMbtiStats] = useState<MbtiGroup[]>([])
  const [mbtiLoading, setMbtiLoading] = useState(false)

  useEffect(() => {
    if (tab === "mbti" && mbtiStats.length === 0) {
      setMbtiLoading(true)
      fetch(`/api/battles/worldcup/stats/mbti?battle_id=${battleId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.mbti_stats) setMbtiStats(data.mbti_stats)
        })
        .catch(() => {})
        .finally(() => setMbtiLoading(false))
    }
  }, [tab, battleId, mbtiStats.length])

  return (
    <div className="border-border bg-card overflow-hidden rounded-xl border shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
      {/* 탭 헤더 */}
      <div className="border-border flex border-b">
        <button
          onClick={() => setTab("general")}
          className={`flex flex-1 items-center justify-center gap-2 py-3 text-xs font-medium transition-colors ${
            tab === "general"
              ? "text-primary border-primary border-b-2 font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          전체 통계
        </button>
        <button
          onClick={() => setTab("mbti")}
          className={`flex flex-1 items-center justify-center gap-2 py-3 text-xs font-medium transition-colors ${
            tab === "mbti"
              ? "text-primary border-primary border-b-2 font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Brain className="h-3.5 w-3.5" />
          MBTI별 통계
        </button>
      </div>

      {/* 전체 통계 탭 */}
      {tab === "general" && stats.length > 0 && (
        <div className="divide-border divide-y">
          {stats.slice(0, 10).map((s, i) => {
            const maxWins = stats[0]?.win_count ?? 1
            const barWidth = maxWins > 0 ? (s.win_count / maxWins) * 100 : 0
            return (
              <div key={s.candidate_id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-muted-foreground w-5 text-right text-sm font-bold">
                  {i + 1}
                </span>
                {s.image_url ? (
                  <img
                    src={s.image_url}
                    alt={s.name}
                    className="h-8 w-8 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm">
                    {i + 1}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-foreground truncate text-sm font-semibold">{s.name}</p>
                  <div className="bg-muted mt-1 h-1.5 w-full overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full rounded-full transition-all duration-500"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
                <span className="text-muted-foreground shrink-0 text-xs font-semibold">
                  {s.win_count}회 우승
                </span>
              </div>
            )
          })}
        </div>
      )}

      {tab === "general" && stats.length === 0 && (
        <div className="p-6 text-center">
          <p className="text-muted-foreground text-sm">아직 통계 데이터가 없습니다</p>
        </div>
      )}

      {/* MBTI별 통계 탭 */}
      {tab === "mbti" && (
        <div>
          {mbtiLoading ? (
            <div className="space-y-3 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-muted h-16 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : mbtiStats.length === 0 ? (
            <div className="p-6 text-center">
              <Brain className="text-muted-foreground/30 mx-auto h-8 w-8" />
              <p className="text-muted-foreground mt-2 text-sm">MBTI 통계가 아직 없습니다</p>
              <p className="text-muted-foreground/60 mt-1 text-xs">
                MBTI를 설정한 유저가 참여하면 통계가 표시됩니다
              </p>
            </div>
          ) : (
            <div className="divide-border divide-y">
              {mbtiStats.map((group) => {
                const topCandidate = group.candidates[0]
                if (!topCandidate) return null
                const totalWins = group.candidates.reduce((sum, c) => sum + c.win_count, 0)
                const topPercent =
                  totalWins > 0 ? Math.round((topCandidate.win_count / totalWins) * 100) : 0

                return (
                  <div key={group.mbti} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="bg-primary/10 text-primary rounded-md px-2 py-0.5 text-xs font-black">
                          {group.mbti}
                        </span>
                        <span className="text-muted-foreground text-[11px]">
                          {group.participant_count}명 참여
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      {topCandidate.image_url ? (
                        <img
                          src={topCandidate.image_url}
                          alt={topCandidate.name}
                          className="h-7 w-7 rounded-full object-cover"
                        />
                      ) : (
                        <div className="bg-muted flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold">
                          1
                        </div>
                      )}
                      <p className="text-foreground text-sm font-semibold">{topCandidate.name}</p>
                      <div className="bg-muted ml-auto h-1.5 w-20 overflow-hidden rounded-full">
                        <div
                          className="bg-primary h-full rounded-full"
                          style={{ width: `${topPercent}%` }}
                        />
                      </div>
                      <span className="text-primary text-xs font-black">{topPercent}%</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

"use client"

import { BarChart3 } from "lucide-react"

export function WorldcupStatsPreview() {
  return (
    <div className="border-border bg-card rounded-xl border p-6 text-center shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
      <BarChart3 className="text-muted-foreground mx-auto h-8 w-8" />
      <p className="text-muted-foreground mt-2 text-sm">참여 후 전체 통계를 확인할 수 있습니다</p>
    </div>
  )
}

export function WinnerStatsSection({
  stats,
}: {
  stats: { candidate_id: string; name: string; image_url: string | null; win_count: number }[]
}) {
  return (
    <div className="border-border bg-card overflow-hidden rounded-xl border shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
      <div className="border-border flex items-center gap-2 border-b px-4 py-3">
        <BarChart3 className="text-primary h-3.5 w-3.5" />
        <h3 className="text-sm font-semibold">전체 통계</h3>
      </div>
      {stats.length > 0 ? (
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
                  // eslint-disable-next-line @next/next/no-img-element
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
      ) : (
        <div className="p-6 text-center">
          <p className="text-muted-foreground text-sm">아직 통계 데이터가 없습니다</p>
        </div>
      )}
    </div>
  )
}

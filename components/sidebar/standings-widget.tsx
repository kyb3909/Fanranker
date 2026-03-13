"use client"

import { useState, useMemo } from "react"
import useSWR from "swr"
import { Trophy, ExternalLink, Loader2, ChevronLeft, ChevronRight } from "lucide-react"
import { Card } from "@/components/ui/card"
import { fetcher } from "@/lib/swr"
import {
  getStandingsUrl,
  getLeagueGroups,
  SPORT_TABS,
  getLeaguesBySport,
  type SportKey,
} from "@/lib/standings/naver-leagues"
import { mapRowsToStandings, type StandingsRow } from "@/lib/standings/column-map"

const PAGE_SIZE = 10

type StandingsApiResponse = {
  leagueId: string
  leagueName: string
  data: Record<string, string | number>[]
  fetchedAt: string | null
}

export function StandingsWidget() {
  const [sport, setSport] = useState<SportKey>("football")
  const leagues = getLeaguesBySport(sport)
  const [leagueId, setLeagueId] = useState(leagues[0]?.id ?? "epl")
  const [page, setPage] = useState(1)
  const [groupKey, setGroupKey] = useState<string | null>(null)

  const { data, isLoading, error } = useSWR<StandingsApiResponse>(
    `/api/standings?league=${encodeURIComponent(leagueId)}`,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
      keepPreviousData: true,
    }
  )

  const hasData = data?.data && Array.isArray(data.data) && data.data.length > 0
  const allRows = hasData ? mapRowsToStandings(data!.data) : []
  const groups = getLeagueGroups(leagueId)
  const activeGroupKey = groupKey ?? groups?.[0]?.key ?? null
  const activeGroup = groups?.find((g) => g.key === activeGroupKey) ?? null

  const filteredRows = useMemo<StandingsRow[]>(() => {
    if (!activeGroup) return allRows
    return allRows.filter((row) => {
      const matchGroup = !activeGroup.group || row.group === activeGroup.group
      const matchDiv = !activeGroup.division || row.division === activeGroup.division
      return matchGroup && matchDiv
    })
  }, [allRows, activeGroup])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const start = (currentPage - 1) * PAGE_SIZE
  const rows = filteredRows.slice(start, start + PAGE_SIZE)
  const hasPrev = currentPage > 1
  const hasNext = currentPage < totalPages
  const naverUrl = getStandingsUrl(leagueId)
  const isFootball = sport === "football"

  return (
    <Card className="border-border overflow-hidden rounded-xl border shadow-none">
      <div className="border-b px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Trophy className="text-primary h-4 w-4 shrink-0" />
          <h3 className="text-primary text-sm font-bold">리그 순위표</h3>
        </div>
        {/* 종목 탭 */}
        <div className="mt-2 flex justify-center gap-1">
          {SPORT_TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              tabIndex={-1}
              onClick={() => {
                setSport(key)
                const nextLeagues = getLeaguesBySport(key)
                const firstId = nextLeagues[0]?.id ?? ""
                setLeagueId(firstId)
                setGroupKey(null)
                setPage(1)
              }}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                sport === key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {/* 리그 탭 */}
        <div className="mt-1.5 flex flex-wrap justify-center gap-1">
          {leagues.map((L) => (
            <button
              key={L.id}
              type="button"
              tabIndex={-1}
              onClick={() => {
                setLeagueId(L.id)
                setGroupKey(null)
                setPage(1)
              }}
              className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                leagueId === L.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {L.tabLabel ?? L.name}
            </button>
          ))}
        </div>
        {/* 디비전/컨퍼런스 서브탭 */}
        {groups && groups.length > 0 && (
          <div className="mt-1.5 flex flex-wrap justify-center gap-1">
            {groups.map((g) => (
              <button
                key={g.key}
                type="button"
                tabIndex={-1}
                onClick={() => {
                  setGroupKey(g.key)
                  setPage(1)
                }}
                className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                  activeGroupKey === g.key
                    ? "bg-foreground/10 text-foreground ring-foreground/20 ring-1"
                    : "bg-muted/30 text-muted-foreground hover:bg-muted/60"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-[280px]">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
          </div>
        )}

        {!isLoading && !error && hasData && filteredRows.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-xs">
                <colgroup>
                  <col style={{ width: isFootball ? "50%" : "52%" }} />
                  <col style={{ width: isFootball ? "17%" : "16%" }} />
                  <col style={{ width: isFootball ? "17%" : "16%" }} />
                  <col style={{ width: "16%" }} />
                </colgroup>
                <thead>
                  <tr className="text-muted-foreground bg-muted/40 border-b">
                    <th className="px-3 py-1.5 text-left text-[11px] font-semibold">팀 이름</th>
                    <th className="px-1 py-1.5 text-center text-[11px] font-semibold">경기</th>
                    {isFootball ? (
                      <>
                        <th className="px-1 py-1.5 text-center text-[11px] font-semibold">승점</th>
                        <th className="px-1 py-1.5 text-center text-[11px] font-semibold">
                          골득실
                        </th>
                      </>
                    ) : (
                      <>
                        <th className="px-1 py-1.5 text-center text-[11px] font-semibold">승</th>
                        <th className="px-1 py-1.5 text-center text-[11px] font-semibold">패</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={start + i} className="hover:bg-muted/30 border-b last:border-0">
                      <td className="truncate px-3 py-1.5 text-[12px]" title={row.teamName}>
                        <span className="text-muted-foreground mr-1 tabular-nums">
                          {start + i + 1}.
                        </span>
                        <span className="font-medium">{row.teamName}</span>
                      </td>
                      <td className="px-1 py-1.5 text-center text-[12px] tabular-nums">
                        {row.played}
                      </td>
                      {isFootball ? (
                        <>
                          <td className="px-1 py-1.5 text-center text-[12px] font-semibold tabular-nums">
                            {row.points}
                          </td>
                          <td className="px-1 py-1.5 text-center text-[12px] tabular-nums">
                            {row.goalDiff}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-1 py-1.5 text-center text-[12px] font-semibold tabular-nums">
                            {row.wins}
                          </td>
                          <td className="px-1 py-1.5 text-center text-[12px] tabular-nums">
                            {row.losses}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!hasPrev}
                  className="text-muted-foreground hover:text-foreground flex items-center gap-0.5 text-[11px] font-semibold disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> 이전
                </button>
                <span className="text-muted-foreground text-[11px] font-medium">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={!hasNext}
                  className="text-muted-foreground hover:text-foreground flex items-center gap-0.5 text-[11px] font-semibold disabled:opacity-40"
                >
                  더보기 <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </>
        )}

        {!isLoading && error && (
          <div className="px-3 py-6 text-center">
            <p className="text-destructive text-xs">순위를 불러오지 못했습니다.</p>
          </div>
        )}

        {!isLoading && !error && !hasData && (
          <div className="px-3 py-6 text-center">
            <p className="text-muted-foreground text-xs">캐시된 순위가 없습니다.</p>
            <p className="text-muted-foreground mt-1 text-[11px]">크론 수집 후 표시됩니다.</p>
            {naverUrl && (
              <a
                href={naverUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary mt-2 inline-flex items-center gap-1 text-xs underline"
              >
                네이버에서 보기 <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

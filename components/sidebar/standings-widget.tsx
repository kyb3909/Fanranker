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

/** 순위 1~3위 메달 색상 */
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/15 text-[11px] font-bold text-amber-500">
        1
      </span>
    )
  if (rank === 2)
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-400/15 text-[11px] font-bold text-slate-400">
        2
      </span>
    )
  if (rank === 3)
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-700/15 text-[11px] font-bold text-amber-700">
        3
      </span>
    )
  return (
    <span className="text-muted-foreground inline-flex h-5 w-5 items-center justify-center text-[11px] tabular-nums">
      {rank}
    </span>
  )
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
    <Card className="border-border relative gap-0 overflow-hidden rounded-lg border py-0">
      {/* 헤더 */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-primary flex items-center gap-2 text-[14px] font-bold">
            <Trophy className="h-3.5 w-3.5" />
            리그 순위표
          </h3>
          {naverUrl && (
            <a
              href={naverUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="네이버에서 보기"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>

        {/* 종목 탭 */}
        <div className="mt-2.5 flex gap-1">
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
              className={`flex-1 rounded-md py-1.5 text-[12px] font-semibold transition-colors ${
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
        <div className="mt-1.5 flex flex-wrap gap-1">
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
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                leagueId === L.id
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              {L.tabLabel ?? L.name}
            </button>
          ))}
        </div>

        {/* 디비전/컨퍼런스 서브탭 */}
        {groups && groups.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {groups.map((g) => (
              <button
                key={g.key}
                type="button"
                tabIndex={-1}
                onClick={() => {
                  setGroupKey(g.key)
                  setPage(1)
                }}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  activeGroupKey === g.key
                    ? "bg-foreground/10 text-foreground font-semibold"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 테이블 영역 */}
      <div className="min-h-[260px]">
        {isLoading && (
          <div className="flex flex-col items-center justify-center gap-2 py-10">
            <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
            <p className="text-muted-foreground text-[11px]">순위 불러오는 중</p>
          </div>
        )}

        {!isLoading && !error && hasData && filteredRows.length > 0 && (
          <>
            <table className="w-full table-fixed border-t text-xs">
              <colgroup>
                <col style={{ width: isFootball ? "50%" : "52%" }} />
                <col style={{ width: isFootball ? "17%" : "16%" }} />
                <col style={{ width: isFootball ? "17%" : "16%" }} />
                <col style={{ width: "16%" }} />
              </colgroup>
              <thead>
                <tr className="text-muted-foreground bg-muted/30">
                  <th className="px-4 py-2 text-left text-[11px] font-medium">팀</th>
                  <th className="py-2 text-center text-[11px] font-medium">경기</th>
                  {isFootball ? (
                    <>
                      <th className="py-2 text-center text-[11px] font-medium">승점</th>
                      <th className="py-2 pr-3 text-center text-[11px] font-medium">골득실</th>
                    </>
                  ) : (
                    <>
                      <th className="py-2 text-center text-[11px] font-medium">승</th>
                      <th className="py-2 pr-3 text-center text-[11px] font-medium">패</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const rank = start + i + 1
                  return (
                    <tr
                      key={start + i}
                      className="hover:bg-muted/30 border-border/50 border-t transition-colors"
                    >
                      <td className="px-4 py-2" title={row.teamName}>
                        <div className="flex items-center gap-2">
                          <RankBadge rank={rank} />
                          <span className="truncate text-[12px] font-medium">{row.teamName}</span>
                        </div>
                      </td>
                      <td className="text-muted-foreground py-2 text-center text-[12px] tabular-nums">
                        {row.played}
                      </td>
                      {isFootball ? (
                        <>
                          <td className="py-2 text-center text-[12px] font-semibold tabular-nums">
                            {row.points}
                          </td>
                          <td className="text-muted-foreground py-2 pr-3 text-center text-[12px] tabular-nums">
                            {row.goalDiff}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 text-center text-[12px] font-semibold tabular-nums">
                            {row.wins}
                          </td>
                          <td className="text-muted-foreground py-2 pr-3 text-center text-[12px] tabular-nums">
                            {row.losses}
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t px-4 py-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!hasPrev}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center gap-0.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> 이전
                </button>
                <span className="text-muted-foreground text-[11px] tabular-nums">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={!hasNext}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center gap-0.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-30"
                >
                  다음 <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </>
        )}

        {!isLoading && error && (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <Trophy className="text-muted-foreground/50 h-8 w-8" />
            <p className="text-muted-foreground text-[13px]">순위를 불러오지 못했습니다</p>
          </div>
        )}

        {!isLoading && !error && !hasData && (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <Trophy className="text-muted-foreground/50 h-8 w-8" />
            <p className="text-muted-foreground text-[13px]">순위 데이터가 아직 없습니다</p>
            {naverUrl && (
              <a
                href={naverUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary mt-1 inline-flex items-center gap-1 text-[12px] font-medium hover:underline"
              >
                네이버에서 보기 <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

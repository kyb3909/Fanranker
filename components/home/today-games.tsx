"use client"

import { useMemo } from "react"
import Link from "@/components/ui/app-link"
import { ArrowRight, CalendarX } from "lucide-react"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import type { TodayInfo, GroupedMatch, SportsGame } from "@/types/betting"

/**
 * 담벼락 "오늘의 경기" 탭 — 오늘 슬레이트를 컴팩트 리스트로 보여주고
 * /prediction 으로 흘려보내는 진입 위젯. 베팅 UI 없음(읽기 전용).
 */

/** 매치의 대표(일반 승부) 마켓 — 배당 표시용 */
function mainGame(m: GroupedMatch): SportsGame | null {
  return (
    m.games.find(
      (g) =>
        !g.is_half_time &&
        g.handicap === null &&
        g.over_under_line === null &&
        g.home_odds !== undefined
    ) ?? null
  )
}

function formatKstTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  })
}

function OddsChip({ label, odds }: { label: string; odds: number }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
      style={{ background: "var(--wc-soft)", color: "var(--wc-ink)" }}
    >
      <span style={{ color: "var(--wc-mute)" }}>{label}</span>
      {odds.toFixed(2)}
    </span>
  )
}

export function TodayGames() {
  const { data, isLoading } = useSWR<{ today?: TodayInfo; groupedGames?: GroupedMatch[] }>(
    "/api/sports/games",
    fetcher,
    { refreshInterval: 5 * 60 * 1000, revalidateOnFocus: true, dedupingInterval: 10_000 }
  )

  const matches = useMemo(() => {
    const now = new Date()
    return (data?.groupedGames ?? [])
      .filter((m) => new Date(m.matchTime) > now)
      .filter((m) => m.homeTeam && m.awayTeam && m.homeTeam !== "미정" && m.awayTeam !== "미정")
      .sort((a, b) => a.matchTime.localeCompare(b.matchTime))
  }, [data])

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{ background: "var(--wc-card)", boxShadow: "var(--wc-shadow-1)" }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--wc-line)" }}
      >
        <h2 className="text-[14px] font-bold" style={{ color: "var(--wc-ink)" }}>
          오늘의 경기
          {matches.length > 0 && (
            <span className="ml-1.5 font-semibold" style={{ color: "var(--wc-burgundy)" }}>
              {matches.length}
            </span>
          )}
        </h2>
        <Link
          href="/prediction"
          className="inline-flex items-center gap-1 text-[12.5px] font-bold"
          style={{ color: "var(--wc-burgundy)" }}
        >
          승부예측 가기
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-2 p-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="wc-skeleton h-12 rounded-lg" />
          ))}
        </div>
      ) : matches.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <CalendarX className="h-6 w-6" style={{ color: "var(--wc-mute)" }} aria-hidden />
          <p className="text-[13.5px] font-semibold" style={{ color: "var(--wc-ink)" }}>
            지금은 예측 가능한 경기가 없어요
          </p>
          <p className="text-[12.5px]" style={{ color: "var(--wc-mute)" }}>
            새 회차가 열리면 이곳에 바로 표시됩니다
          </p>
        </div>
      ) : (
        <ul>
          {matches.map((m) => {
            const g = mainGame(m)
            return (
              <li key={m.matchKey} style={{ borderBottom: "1px solid var(--wc-line)" }}>
                <Link
                  href="/prediction"
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--wc-soft)]"
                >
                  <span className="w-11 shrink-0 text-center">
                    <span
                      className="block text-[13px] font-bold tabular-nums"
                      style={{ color: "var(--wc-ink)" }}
                      suppressHydrationWarning
                    >
                      {formatKstTime(m.matchTime)}
                    </span>
                    <span className="block text-[10.5px]" style={{ color: "var(--wc-mute)" }}>
                      {m.leagueCode}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-[13.5px] font-semibold"
                      style={{ color: "var(--wc-ink)" }}
                    >
                      {m.homeTeam}
                      <span className="mx-1 font-normal" style={{ color: "var(--wc-mute)" }}>
                        vs
                      </span>
                      {m.awayTeam}
                    </span>
                    {g && (
                      <span className="mt-1 flex items-center gap-1">
                        {g.home_odds !== undefined && <OddsChip label="홈" odds={g.home_odds} />}
                        {g.draw_odds !== undefined && <OddsChip label="무" odds={g.draw_odds} />}
                        {g.away_odds !== undefined && <OddsChip label="원정" odds={g.away_odds} />}
                      </span>
                    )}
                  </span>
                  <ArrowRight
                    className="h-4 w-4 shrink-0"
                    style={{ color: "var(--wc-mute)" }}
                    aria-hidden
                  />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

"use client"

import { useMemo } from "react"
import Link from "@/components/ui/app-link"
import { ArrowRight, CalendarDays } from "lucide-react"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import type { GroupedMatch } from "@/types/betting"

/**
 * 담벼락 메인 "오늘의 경기" 일정 위젯 — 배당률 없이 시간·리그·팀만.
 * 예측(픽/슬립의 배점)은 /prediction 에서.
 */

const MAX_ROWS = 4

function formatKstTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  })
}

export function TodayGamesStrip() {
  const { data } = useSWR<{ groupedGames?: GroupedMatch[] }>("/api/sports/games", fetcher, {
    refreshInterval: 5 * 60 * 1000,
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  })

  const matches = useMemo(() => {
    const now = new Date()
    return (data?.groupedGames ?? [])
      .filter((m) => new Date(m.matchTime) > now)
      .filter((m) => m.homeTeam && m.awayTeam && m.homeTeam !== "미정" && m.awayTeam !== "미정")
      .sort((a, b) => a.matchTime.localeCompare(b.matchTime))
  }, [data])

  // 경기 없는 날은 위젯 자체를 숨김 (빈 박스로 첫 화면 낭비 X)
  if (matches.length === 0) return null

  const shown = matches.slice(0, MAX_ROWS)
  const rest = matches.length - shown.length

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{ background: "var(--wc-card)", boxShadow: "var(--wc-shadow-1)" }}
    >
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: "1px solid var(--wc-line)" }}
      >
        <h2
          className="flex items-center gap-1.5 text-[13px] font-bold"
          style={{ color: "var(--wc-ink)" }}
        >
          <CalendarDays className="h-3.5 w-3.5" style={{ color: "var(--wc-burgundy)" }} />
          오늘의 경기
          <span style={{ color: "var(--wc-burgundy)" }}>{matches.length}</span>
        </h2>
        <Link
          href="/prediction"
          className="inline-flex items-center gap-1 text-[12px] font-bold"
          style={{ color: "var(--wc-burgundy)" }}
        >
          예측하러 가기
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
      <ul>
        {shown.map((m) => (
          <li
            key={m.matchKey}
            style={{ borderBottom: "1px solid var(--wc-line)" }}
            className="last:border-b-0"
          >
            <Link
              href="/prediction"
              className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-[var(--wc-soft)]"
            >
              <span className="w-11 shrink-0 text-center">
                <span
                  className="block text-[12.5px] font-bold tabular-nums"
                  style={{ color: "var(--wc-ink)" }}
                  suppressHydrationWarning
                >
                  {formatKstTime(m.matchTime)}
                </span>
                <span className="block text-[10px]" style={{ color: "var(--wc-mute)" }}>
                  {m.leagueCode}
                </span>
              </span>
              <span
                className="min-w-0 flex-1 truncate text-[13px] font-semibold"
                style={{ color: "var(--wc-ink)" }}
              >
                {m.homeTeam}
                <span className="mx-1 font-normal" style={{ color: "var(--wc-mute)" }}>
                  vs
                </span>
                {m.awayTeam}
              </span>
            </Link>
          </li>
        ))}
        {rest > 0 && (
          <li>
            <Link
              href="/prediction"
              className="block px-4 py-2 text-center text-[12px] font-semibold transition-colors hover:bg-[var(--wc-soft)]"
              style={{ color: "var(--wc-mute)" }}
            >
              +{rest}경기 더보기
            </Link>
          </li>
        )}
      </ul>
    </div>
  )
}

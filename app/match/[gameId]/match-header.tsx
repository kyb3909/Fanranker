"use client"

import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import type { MatchSummary } from "@/lib/match/get-match"
import type { LiveMatchRow } from "@/lib/betman/games-payload"

/**
 * 매치 페이지 스코어 헤더 — LIVE 면 60초마다 갱신 (2026-08-16).
 *
 * 갱신 소스는 홈 밴드와 같은 `/api/sports/live` (경량, CDN 30초 캐시) — 매치 전용
 * 폴링 엔드포인트를 새로 만들지 않고 matchKey 로 골라 쓴다. 진행 중이 아니면 폴링 없음.
 */

function fmtKst(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  })
}

const STATUS_LABEL: Record<MatchSummary["status"], string> = {
  scheduled: "경기 예정",
  in_progress: "진행 중",
  completed: "경기 종료",
  cancelled: "경기 취소",
}

export function MatchHeader({ initial }: { initial: MatchSummary }) {
  // SSR 시점에 진행 중이었으면 폴링 시작. FT 로 바뀌면 마지막 응답이 최종 스코어를 준다.
  const { data } = useSWR<{ liveMatches: LiveMatchRow[]; finishedMatches: LiveMatchRow[] }>(
    initial.status === "in_progress" ? "/api/sports/live" : null,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false }
  )
  const fresh =
    data &&
    [...data.liveMatches, ...data.finishedMatches].find((m) => m.matchKey === initial.matchKey)

  const status: MatchSummary["status"] = fresh
    ? fresh.status === "in_progress"
      ? "in_progress"
      : "completed"
    : initial.status
  const homeScore = fresh?.homeScore ?? initial.homeScore
  const awayScore = fresh?.awayScore ?? initial.awayScore
  const hasScore = homeScore != null && awayScore != null
  const live = status === "in_progress"

  return (
    <header
      className="rounded-xl px-5 py-5"
      style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
    >
      <div className="flex flex-wrap items-center gap-2 text-[11.5px] font-bold">
        <span
          className="rounded px-1.5 py-0.5"
          style={{ background: "var(--wc-soft)", color: "var(--wc-mute)" }}
        >
          {initial.leagueCode}
        </span>
        <span
          className="rounded px-1.5 py-0.5"
          style={
            live
              ? { background: "var(--wc-burgundy)", color: "#fff" }
              : { background: "var(--wc-soft)", color: "var(--wc-mute)" }
          }
        >
          {live ? "LIVE" : STATUS_LABEL[status]}
        </span>
        <span style={{ color: "var(--wc-mute)" }} suppressHydrationWarning>
          {fmtKst(initial.matchTime)}
        </span>
        {initial.venue && <span style={{ color: "var(--wc-mute-2)" }}>{initial.venue}</span>}
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <span
          className="text-right text-[17px] leading-tight font-extrabold sm:text-[20px]"
          style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
        >
          {initial.homeTeam}
        </span>
        <span
          className="gn-num text-center text-[28px] leading-none font-bold sm:text-[34px]"
          style={{ color: hasScore ? "var(--wc-ink)" : "var(--wc-mute-2)" }}
        >
          {hasScore ? `${homeScore}:${awayScore}` : "vs"}
        </span>
        <span
          className="text-left text-[17px] leading-tight font-extrabold sm:text-[20px]"
          style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
        >
          {initial.awayTeam}
        </span>
      </div>

      {live && (
        <p className="mt-2 text-center text-[11.5px]" style={{ color: "var(--wc-mute)" }}>
          스코어는 약 1분 간격으로 갱신됩니다
        </p>
      )}
    </header>
  )
}

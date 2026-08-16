import type { MatchSummary } from "@/lib/match/get-match"

/**
 * 매치 페이지 스코어 헤더 (2026-08-17).
 *
 * 스코어·종료 판정은 페이지가 넘겨준다 — betman 은 종료를 1~1.5시간 늦게 반영하므로
 * live-football-api 가 먼저 알려주는 FT 를 함께 본다 (lib/lfa/match.ts). 라이브 중계는
 * 하지 않으므로 진행 중에는 스코어를 주장하지 않고 중립 배지만 보여준다.
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

export function MatchHeader({
  match,
  finished,
  homeScore,
  awayScore,
}: {
  match: MatchSummary
  finished: boolean
  homeScore: number | null
  awayScore: number | null
}) {
  const showScore = finished && homeScore != null && awayScore != null
  const statusLabel = finished
    ? "경기 종료"
    : match.status === "cancelled"
      ? "경기 취소"
      : match.status === "in_progress"
        ? "진행 중"
        : "경기 예정"

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
          {match.leagueCode}
        </span>
        <span
          className="rounded px-1.5 py-0.5"
          style={{ background: "var(--wc-soft)", color: "var(--wc-mute)" }}
        >
          {statusLabel}
        </span>
        <span style={{ color: "var(--wc-mute)" }} suppressHydrationWarning>
          {fmtKst(match.matchTime)}
        </span>
        {match.venue && <span style={{ color: "var(--wc-mute-2)" }}>{match.venue}</span>}
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <span
          className="text-right text-[17px] leading-tight font-extrabold sm:text-[20px]"
          style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
        >
          {match.homeTeam}
        </span>
        <span
          className="gn-num text-center text-[28px] leading-none font-bold sm:text-[34px]"
          style={{ color: showScore ? "var(--wc-ink)" : "var(--wc-mute-2)" }}
        >
          {showScore ? `${homeScore}:${awayScore}` : "vs"}
        </span>
        <span
          className="text-left text-[17px] leading-tight font-extrabold sm:text-[20px]"
          style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
        >
          {match.awayTeam}
        </span>
      </div>
    </header>
  )
}

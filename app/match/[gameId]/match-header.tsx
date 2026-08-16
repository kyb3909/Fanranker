import type { MatchSummary } from "@/lib/match/get-match"

/**
 * 매치 페이지 스코어 헤더 (2026-08-16).
 *
 * 라이브 스코어는 제공하지 않는다 — wisetoto 개편으로 수집이 끊겼고, 운영자 결정으로
 * "라이브 점수 없이 종료 후 매치 리포트" 형태로 간다. 진행 중에는 중립 배지만 보여주고
 * 스코어는 결과 동기화(betman) 후 표시된다. 폴링 없음.
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
  const hasScore = initial.homeScore != null && initial.awayScore != null
  // 진행 중에는 스코어를 주장하지 않는다 — 갱신 소스가 없어 0:0 고정은 오정보다
  const showScore = hasScore && initial.status === "completed"

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
          style={{ background: "var(--wc-soft)", color: "var(--wc-mute)" }}
        >
          {STATUS_LABEL[initial.status]}
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
          style={{ color: showScore ? "var(--wc-ink)" : "var(--wc-mute-2)" }}
        >
          {showScore ? `${initial.homeScore}:${initial.awayScore}` : "vs"}
        </span>
        <span
          className="text-left text-[17px] leading-tight font-extrabold sm:text-[20px]"
          style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
        >
          {initial.awayTeam}
        </span>
      </div>
    </header>
  )
}

import Link from "@/components/ui/app-link"
import { leagueLabel } from "@/lib/match/leagues"
import type { MatchSummary } from "@/lib/match/get-match"

/**
 * 매치 센터 스코어 밴드 (2026-08-18 리디자인).
 *
 * 스코어를 흰 카드에서 **다크 밴드로 올린다** — 이 개편의 핵심 한 수.
 * 사이트에서 밴드를 쓰는 페이지가 11곳인데 매치·사가만 빠져 있어 "페이지가 시작하지
 * 않는" 인상을 줬다 (2026-08-18 디자인 감사). `PageBand` 컴포넌트는 쓰지 않는다 —
 * 제목 슬롯 하나로는 [팀 · 스코어 · 팀] 3열을 담을 수 없어 `.gn-band` 위에 전용 레이아웃을 얹는다.
 *
 * 규약
 * - 결과는 색이 아니라 **명도**로 말한다: 이긴 쪽 숫자만 cream, 진 쪽은 회색, 무승부는 둘 다 cream
 * - 구분자는 콜론이 아니라 **en-dash** — 콜론은 시각 표기다 (03:45)
 * - 킥오프 전에는 스코어 자리에 시각. `vs` 는 쓰지 않는다 (팀명 사이 공백이 그 일을 한다)
 * - 라이브 중계를 하지 않으므로 진행 중에도 스코어를 주장하지 않는다
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

function fmtKstTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", {
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
  homeLabel,
  awayLabel,
}: {
  match: MatchSummary
  finished: boolean
  homeScore: number | null
  awayScore: number | null
  /** 지면 표기 (사전 통칭). 없으면 원문 — 데이터 값은 그대로 둔다 */
  homeLabel?: string
  awayLabel?: string
}) {
  const showScore = finished && homeScore != null && awayScore != null
  const status = finished
    ? "종료"
    : match.status === "cancelled"
      ? "취소"
      : match.status === "in_progress"
        ? "진행 중"
        : "예정"

  // 이긴 쪽만 크림, 진 쪽은 회색 — 무승부면 둘 다 크림
  const dim = "#8d8794"
  const homeTone = !showScore || homeScore! >= awayScore! ? "var(--gn-cream)" : dim
  const awayTone = !showScore || awayScore! >= homeScore! ? "var(--gn-cream)" : dim

  const backDate = new Date(new Date(match.matchTime).getTime() + 9 * 3600_000)
    .toISOString()
    .slice(0, 10)

  return (
    <section className="gn-band" aria-label="경기 스코어">
      <div className="mx-auto max-w-[1280px] px-4 pt-5 pb-6 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={`/matches?date=${backDate}`}
            className="text-[11.5px] font-semibold no-underline transition-colors"
            style={{ color: "var(--gn-cream-dim)" }}
          >
            ← 경기 일정
          </Link>
          <span
            className="text-[11.5px] font-bold"
            style={{ color: "var(--gn-cream-dim)", letterSpacing: "0.12em" }}
          >
            {status}
          </span>
        </div>

        <p className="mt-3.5 flex flex-wrap items-baseline gap-x-2">
          <span
            className="gn-num text-[12.5px] font-bold uppercase"
            style={{ color: "var(--gn-bg-100)", letterSpacing: "0.2em" }}
          >
            {match.leagueCode}
          </span>
          <span className="text-[12.5px] font-semibold" style={{ color: "var(--gn-cream-dim)" }}>
            {leagueLabel(match.leagueCode)}
          </span>
        </p>

        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-5">
          <span
            className="min-w-0 text-right text-[17px] leading-tight font-extrabold sm:text-[20px]"
            style={{ color: "var(--gn-cream)", wordBreak: "keep-all" }}
          >
            {homeLabel ?? match.homeTeam}
          </span>
          {showScore ? (
            <span
              className="gn-num text-center text-[40px] leading-none font-bold sm:text-[56px]"
              style={{ letterSpacing: "-0.02em" }}
            >
              <span style={{ color: homeTone }}>{homeScore}</span>
              <span style={{ opacity: 0.35, fontSize: "0.55em", padding: "0 10px" }}>–</span>
              <span style={{ color: awayTone }}>{awayScore}</span>
            </span>
          ) : (
            <span className="text-center">
              <span
                className="gn-num block text-[28px] leading-none font-bold sm:text-[32px]"
                style={{ color: "var(--gn-cream)" }}
                suppressHydrationWarning
              >
                {fmtKstTime(match.matchTime)}
              </span>
              <span
                className="mt-1 block text-[11px] font-bold"
                style={{ color: "var(--gn-cream-dim)", letterSpacing: "0.12em" }}
              >
                KST
              </span>
            </span>
          )}
          <span
            className="min-w-0 text-left text-[17px] leading-tight font-extrabold sm:text-[20px]"
            style={{ color: "var(--gn-cream)", wordBreak: "keep-all" }}
          >
            {awayLabel ?? match.awayTeam}
          </span>
        </div>

        <p className="mt-4 text-[11.5px]" style={{ color: "var(--gn-cream-dim)" }}>
          <span suppressHydrationWarning>{fmtKst(match.matchTime)}</span>
          {match.venue ? ` · ${match.venue}` : ""}
        </p>
      </div>
    </section>
  )
}

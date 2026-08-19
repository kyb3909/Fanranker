import Link from "@/components/ui/app-link"
import { getMatchByGameId } from "@/lib/match/get-match"
import { getLfaMatchInfo, type LfaTimelineEvent } from "@/lib/lfa/match"
import { leagueLabel } from "@/lib/match/leagues"
import { displayTeamName, loadTeamShortMap } from "@/lib/match/team-display"
import { LiveRefresher } from "@/app/match/[gameId]/live-refresher"

/**
 * 불판 스코어 스트립 (2026-08-20) — match_game_id 가 있는 게시물(불판) 상단에 뜬다.
 *
 * 운영자 정의 그대로: "경기 스코어와 함께, 득점자·경고·퇴장 같은 매우 기본적인
 * 이벤트만". 교체·스탯은 매치센터의 일이다 — 여기는 댓글 달며 곁눈질하는 전광판.
 * 라이브면 LiveRefresher(60초 router.refresh)가 갱신한다 — 매치센터와 같은 캐시를
 * 나눠 쓰므로 추가 LFA 호출은 0이다.
 */

function EventLine({ e }: { e: LfaTimelineEvent }) {
  const isGoal = e.kind === "goal" || e.kind === "pen" || e.kind === "og"
  const tag =
    e.kind === "pen" ? " (PK)" : e.kind === "og" ? " (자책골)" : e.kind === "red" ? "" : ""
  return (
    <li
      className="flex items-baseline gap-1.5 text-[12px]"
      style={{ color: isGoal ? "var(--wc-ink)" : "var(--wc-mute)" }}
    >
      <span
        className="gn-num shrink-0 text-[11px] font-bold"
        style={{ color: "var(--wc-mute-2)", minWidth: 26, textAlign: "right" }}
      >
        {e.minute}&#8242;
      </span>
      {(e.kind === "yellow" || e.kind === "red") && (
        <span
          aria-hidden
          className="inline-block h-[10px] w-[7.5px] shrink-0 rounded-[1.5px]"
          style={{ background: e.kind === "yellow" ? "#e2b93b" : "var(--wc-down, #c03a3a)" }}
        />
      )}
      <span className={`min-w-0 truncate ${isGoal ? "font-bold" : ""}`}>
        {e.player}
        {tag}
      </span>
    </li>
  )
}

export async function ThreadScoreStrip({ gameId }: { gameId: string }) {
  const match = await getMatchByGameId(gameId).catch(() => null)
  if (!match) return null

  const [lfa, shortNames] = await Promise.all([
    getLfaMatchInfo({
      gameId: match.gameId,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      matchTime: match.matchTime,
      leagueCode: match.leagueCode,
    }).catch(() => null),
    loadTeamShortMap(),
  ])

  const finished = match.status === "completed" || lfa?.finished === true
  const live = !finished && lfa?.live === true
  const homeScore = live ? (lfa?.homeScore ?? null) : (match.homeScore ?? lfa?.homeScore ?? null)
  const awayScore = live ? (lfa?.awayScore ?? null) : (match.awayScore ?? lfa?.awayScore ?? null)
  const showScore = (finished || live) && homeScore != null && awayScore != null

  // 기본 이벤트만 — 득점(골·PK·자책)·경고·퇴장. 교체는 싣지 않는다 (운영자 정의)
  const events = (lfa?.timeline ?? []).filter((e) => e.kind !== "sub")
  const homeEvents = events.filter((e) => e.side === "home")
  const awayEvents = events.filter((e) => e.side === "away")

  const kickoff = new Date(match.matchTime).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  })

  return (
    <section
      className="mb-4 rounded-xl px-4 py-3.5"
      style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
      aria-label="경기 현황"
    >
      {live && <LiveRefresher />}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-bold" style={{ color: "var(--wc-mute)" }}>
          {leagueLabel(match.leagueCode)}
          {live && (
            <span
              className="ml-2 inline-flex items-center gap-1"
              style={{ color: "var(--wc-burgundy)" }}
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 animate-pulse rounded-full"
                style={{ background: "var(--wc-burgundy)" }}
              />
              {lfa?.minute ? <span className="gn-num">{lfa.minute}&#8242;</span> : "LIVE"}
            </span>
          )}
          {finished && (
            <span className="ml-2" style={{ color: "var(--wc-mute-2)" }}>
              종료
            </span>
          )}
        </span>
        <Link
          href={`/match/${gameId}`}
          className="text-[12px] font-bold no-underline"
          style={{ color: "var(--wc-burgundy)" }}
        >
          매치센터 →
        </Link>
      </div>

      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <span
          className="min-w-0 truncate text-right text-[14.5px] font-extrabold"
          style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
        >
          {displayTeamName(match.homeTeam, shortNames)}
        </span>
        <span
          className="gn-num text-[22px] leading-none font-bold"
          style={{ color: "var(--wc-ink)" }}
        >
          {showScore ? (
            <>
              {homeScore}
              <span style={{ opacity: 0.35, fontSize: "0.6em", padding: "0 7px" }}>–</span>
              {awayScore}
            </>
          ) : (
            <span className="text-[15px]" style={{ color: "var(--wc-mute)" }}>
              {kickoff}
            </span>
          )}
        </span>
        <span
          className="min-w-0 truncate text-left text-[14.5px] font-extrabold"
          style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
        >
          {displayTeamName(match.awayTeam, shortNames)}
        </span>
      </div>

      {events.length > 0 && (
        <div
          className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-0.5 border-t pt-2.5"
          style={{ borderColor: "var(--wc-line)" }}
        >
          <ul className="space-y-0.5">
            {homeEvents.map((e, i) => (
              <EventLine key={`h${i}`} e={e} />
            ))}
          </ul>
          <ul className="space-y-0.5">
            {awayEvents.map((e, i) => (
              <EventLine key={`a${i}`} e={e} />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

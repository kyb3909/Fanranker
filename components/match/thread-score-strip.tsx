import Image from "next/image"
import Link from "@/components/ui/app-link"
import { getMatchByGameId } from "@/lib/match/get-match"
import { getLfaMatchInfo, type LfaTimelineEvent } from "@/lib/lfa/match"
import { leagueKicker, leagueLabel, leagueMarkSrc } from "@/lib/match/leagues"
import { displayTeamName, loadTeamShortMap } from "@/lib/match/team-display"
import { LiveRefresher } from "@/app/match/[gameId]/live-refresher"

/**
 * 불판 전광판 (2026-08-20, 운영자: "진짜 축구 전광판 느낌으로") — match_game_id 가
 * 있는 게시물(불판) 상단에 뜬다.
 *
 * 매치센터 밴드와 같은 다크 문법(.gn-band — 나이트 + 버건디 래디얼 + 그레인)을 쓴다.
 * 전광판은 베팅 카드가 아니라 **선언 영역**이다 — 스코어가 다크 밴드에 사는 것은
 * 매치 헤더와 같은 문법이고, 흰 카드 전광판은 전광판으로 안 읽힌다는 운영자 감리.
 *
 * 내용은 운영자 정의 그대로: 스코어 + 득점자·경고·퇴장만. 교체·스탯은 매치센터의 일.
 * 라이브면 LiveRefresher(60초 router.refresh) — 매치센터와 같은 캐시라 추가 호출 0.
 */

const CREAM_DIM = "var(--gn-cream-dim)"

function EventLine({ e }: { e: LfaTimelineEvent }) {
  const isGoal = e.kind === "goal" || e.kind === "pen" || e.kind === "og"
  const tag = e.kind === "pen" ? " (PK)" : e.kind === "og" ? " (자책골)" : ""
  return (
    <li
      className="flex items-baseline gap-1.5 text-[12px]"
      style={{ color: isGoal ? "var(--gn-cream)" : CREAM_DIM }}
    >
      <span
        className="gn-num shrink-0 text-[11px] font-bold"
        style={{ color: CREAM_DIM, minWidth: 26, textAlign: "right", opacity: 0.8 }}
      >
        {e.minute}&#8242;
      </span>
      {(e.kind === "yellow" || e.kind === "red") && (
        <span
          aria-hidden
          className="inline-block h-[10px] w-[7.5px] shrink-0 rounded-[1.5px]"
          style={{ background: e.kind === "yellow" ? "#e2b93b" : "#d4574e" }}
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

  // 이긴 쪽만 크림, 진 쪽은 회색 — 라이브 중엔 승패 톤 없음 (매치 헤더와 같은 규약)
  const dim = "#8d8794"
  const homeTone = !showScore || live || homeScore! >= awayScore! ? "var(--gn-cream)" : dim
  const awayTone = !showScore || live || awayScore! >= homeScore! ? "var(--gn-cream)" : dim

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
  const kicker = leagueKicker(match.leagueCode)
  const markSrc = leagueMarkSrc(match.leagueCode)

  return (
    <section className="gn-band mb-4 rounded-2xl" aria-label="경기 전광판">
      {live && <LiveRefresher />}
      {/* 리그 워터마크 — 매치센터 밴드와 같은 크림 에칭, 우하단 */}
      {markSrc && (
        <Image
          src={markSrc}
          alt=""
          width={360}
          height={240}
          aria-hidden
          className="pointer-events-none absolute right-0 bottom-0 w-[230px] max-w-[55%] select-none"
          style={{ opacity: 0.1 }}
        />
      )}

      <div className="relative px-4 pt-3.5 pb-4 sm:px-5">
        {/* 상단열: 리그 키커 · 상태 · 매치센터 */}
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-baseline gap-2">
            {kicker && (
              <span
                className="gn-num text-[11px] font-bold uppercase"
                style={{ color: "var(--gn-bg-100)", letterSpacing: "0.18em" }}
              >
                {kicker}
              </span>
            )}
            <span className="truncate text-[11.5px] font-semibold" style={{ color: CREAM_DIM }}>
              {leagueLabel(match.leagueCode)}
            </span>
          </span>
          <Link
            href={`/match/${gameId}`}
            className="shrink-0 text-[11.5px] font-bold no-underline transition-colors"
            style={{ color: CREAM_DIM }}
          >
            매치센터 →
          </Link>
        </div>

        {/* 스코어열 — 매치 헤더의 축소판 */}
        <div className="mt-2.5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-4">
          <span
            className="min-w-0 text-right text-[15px] leading-tight font-extrabold sm:text-[16px]"
            style={{ color: "var(--gn-cream)", wordBreak: "keep-all" }}
          >
            {displayTeamName(match.homeTeam, shortNames)}
          </span>
          {showScore ? (
            <span className="text-center">
              <span
                className="gn-num block text-[30px] leading-none font-bold sm:text-[34px]"
                style={{ letterSpacing: "-0.02em" }}
              >
                <span style={{ color: homeTone }}>{homeScore}</span>
                <span
                  style={{
                    opacity: 0.35,
                    fontSize: "0.55em",
                    padding: "0 8px",
                    color: "var(--gn-cream)",
                  }}
                >
                  –
                </span>
                <span style={{ color: awayTone }}>{awayScore}</span>
              </span>
              {live && (
                <span
                  className="mt-1 inline-flex items-center gap-1.5 text-[11.5px] font-bold"
                  style={{ color: "var(--gn-live)", letterSpacing: "0.08em" }}
                >
                  {/* 라임은 LIVE 전용, 화면당 1곳 — 불판에서는 여기가 그 1곳 */}
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 animate-pulse rounded-full"
                    style={{ background: "var(--gn-live)" }}
                  />
                  {lfa?.minute ? <span className="gn-num">{lfa.minute}&#8242;</span> : "LIVE"}
                </span>
              )}
              {finished && (
                <span
                  className="gn-num mt-1 block text-[10.5px] font-bold"
                  style={{ color: CREAM_DIM, letterSpacing: "0.14em" }}
                >
                  FT
                </span>
              )}
            </span>
          ) : (
            <span className="text-center">
              <span
                className="gn-num block text-[24px] leading-none font-bold"
                style={{ color: "var(--gn-cream)" }}
                suppressHydrationWarning
              >
                {kickoff}
              </span>
              <span
                className="mt-1 block text-[10px] font-bold"
                style={{ color: CREAM_DIM, letterSpacing: "0.12em" }}
              >
                KST
              </span>
            </span>
          )}
          <span
            className="min-w-0 text-left text-[15px] leading-tight font-extrabold sm:text-[16px]"
            style={{ color: "var(--gn-cream)", wordBreak: "keep-all" }}
          >
            {displayTeamName(match.awayTeam, shortNames)}
          </span>
        </div>

        {/* 이벤트 — 홈 좌 / 어웨이 우, 크림 괘선 */}
        {events.length > 0 && (
          <div
            className="mt-3 grid grid-cols-2 gap-x-4 gap-y-0.5 pt-2.5"
            style={{ borderTop: "1px solid rgba(245,239,231,0.14)" }}
          >
            <ul className="space-y-0.5">
              {homeEvents.map((e, i) => (
                <EventLine key={`h${i}`} e={e} />
              ))}
            </ul>
            <ul className="space-y-0.5 justify-self-end text-right">
              {awayEvents.map((e, i) => (
                <EventLine key={`a${i}`} e={e} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

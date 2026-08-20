import Image from "next/image"
import Link from "@/components/ui/app-link"
import { getMatchByGameId } from "@/lib/match/get-match"
import { getLfaMatchInfo, type LfaTimelineEvent } from "@/lib/lfa/match"
import { leagueKicker, leagueLabel, leagueMarkSrc } from "@/lib/match/leagues"
import { displayTeamName, loadTeamShortMap } from "@/lib/match/team-display"
import { LiveRefresher } from "@/app/match/[gameId]/live-refresher"
import { CollapsibleRows } from "@/components/match/collapsible-rows"

/**
 * 불판 전광판 (2026-08-20, 운영자 레퍼런스 확정 — MatchPal 류 타임라인 트래커).
 *
 * 형태: 다크 밴드(.gn-band) 위에 [리그 · 경과분 배지] → [스코어 열] →
 * **세로 이벤트 타임라인 (최신이 위)**. 각 이벤트는 [분 배지 | 아이콘 | 선수 | 팀] 행이고,
 * 킥오프·하프타임(전반 스코어)·종료가 마커 행으로 끼어 경기의 척추가 보인다.
 * 레퍼런스에 교체가 있으므로 교체(↔)도 싣는다 — 탭·채팅·예측%는 매치센터·댓글판의 일.
 *
 * 라이브면 LiveRefresher(60초 router.refresh) — 매치센터와 같은 캐시라 추가 호출 0.
 */

const CREAM = "var(--gn-cream)"
const CREAM_DIM = "var(--gn-cream-dim)"
const ROW_BG = "rgba(245,239,231,0.06)"
const CHIP_BG = "rgba(10,9,12,0.45)"

/** "45 +4" → 45.04 (정렬용) */
function minuteKey(minute: string): number {
  const m = minute.match(/(\d+)(?:\s*\+\s*(\d+))?/)
  if (!m) return 0
  return Number(m[1]) + Number(m[2] ?? 0) / 100
}

function MinuteChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="gn-num inline-flex h-[22px] min-w-[40px] shrink-0 items-center justify-center rounded-md px-1.5 text-[11px] font-bold"
      style={{ background: CHIP_BG, color: CREAM_DIM }}
    >
      {children}
    </span>
  )
}

/** 킥오프·하프타임·종료 — 경기의 척추 마커 */
function MarkerRow({ chip, label }: { chip: string; label: string }) {
  return (
    <li className="flex items-center gap-2.5 px-3 py-1.5">
      <MinuteChip>{chip}</MinuteChip>
      <span
        className="text-[11.5px] font-bold"
        style={{ color: CREAM_DIM, letterSpacing: "0.06em" }}
      >
        {label}
      </span>
    </li>
  )
}

function EventRow({ e, team }: { e: LfaTimelineEvent; team: string }) {
  const isGoal = e.kind === "goal" || e.kind === "pen" || e.kind === "og"
  return (
    <li className="flex items-center gap-2.5 rounded-lg px-3 py-2" style={{ background: ROW_BG }}>
      <MinuteChip>{e.minute}&#8242;</MinuteChip>

      {isGoal && (
        // eslint-disable-next-line @next/next/no-img-element -- 12px 고정 소형 아이콘 (라인업과 동일)
        <img
          src="/match/icons/goal.png"
          alt="득점"
          width={13}
          height={13}
          className="shrink-0"
          // 아이콘이 라이트 지면용 잉크색이라 다크 밴드에 녹아 사라진다 (2026-08-20 운영자
          // 제보: "골 아이콘이 안 보여") — 알파는 유지한 채 크림으로 반전
          style={{ filter: "brightness(0) invert(0.96)" }}
        />
      )}
      {(e.kind === "yellow" || e.kind === "red") && (
        <span
          aria-hidden
          className="inline-block h-[12px] w-[9px] shrink-0 rounded-[1.5px]"
          style={{ background: e.kind === "yellow" ? "#e2b93b" : "#d4574e" }}
        />
      )}

      <span
        className={`min-w-0 flex-1 truncate text-[12.5px] ${isGoal ? "font-bold" : "font-semibold"}`}
        style={{ color: isGoal ? CREAM : CREAM_DIM }}
      >
        {e.kind === "sub" ? (
          <>
            <span style={{ color: CREAM_DIM }}>{e.player}</span>
            <span aria-hidden style={{ opacity: 0.55, padding: "0 5px" }}>
              &#8596;
            </span>
            <span style={{ color: CREAM }}>{e.inPlayer}</span>
          </>
        ) : (
          <>
            {e.player}
            {e.kind === "pen" && <span style={{ color: CREAM_DIM }}> (PK)</span>}
            {e.kind === "og" && <span style={{ color: CREAM_DIM }}> (자책골)</span>}
          </>
        )}
      </span>

      <span
        className="max-w-[96px] shrink-0 truncate text-[11px]"
        style={{ color: CREAM_DIM, opacity: 0.75 }}
      >
        {team}
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
  const started = live || finished
  const homeScore = live ? (lfa?.homeScore ?? null) : (match.homeScore ?? lfa?.homeScore ?? null)
  const awayScore = live ? (lfa?.awayScore ?? null) : (match.awayScore ?? lfa?.awayScore ?? null)
  const showScore = started && homeScore != null && awayScore != null

  const homeLabel = displayTeamName(match.homeTeam, shortNames)
  const awayLabel = displayTeamName(match.awayTeam, shortNames)

  // 이긴 쪽만 크림, 진 쪽은 회색 — 라이브 중엔 승패 톤 없음 (매치 헤더와 같은 규약)
  const dim = "#8d8794"
  const homeTone = !showScore || live || homeScore! >= awayScore! ? CREAM : dim
  const awayTone = !showScore || live || awayScore! >= homeScore! ? CREAM : dim

  // 타임라인 — 최신이 위 (레퍼런스 문법). 전·후반은 하프타임 마커로 가른다
  const events = [...(lfa?.timeline ?? [])].sort(
    (a, b) => minuteKey(b.minute) - minuteKey(a.minute)
  )
  const firstHalf = events.filter((e) => minuteKey(e.minute) <= 45.99)
  const secondHalf = events.filter((e) => minuteKey(e.minute) > 45.99)
  const halfTime = lfa?.htHome != null && lfa?.htAway != null ? `${lfa.htHome}-${lfa.htAway}` : null
  // 하프타임 마커는 후반이 시작됐다는 신호가 있을 때만 (후반 이벤트 또는 45분 초과 진행)
  const showHt =
    halfTime != null && (secondHalf.length > 0 || finished || minuteKey(lfa?.minute ?? "0") > 45)

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
      {markSrc && (
        <Image
          src={markSrc}
          alt=""
          width={360}
          height={240}
          aria-hidden
          className="pointer-events-none absolute right-0 bottom-0 w-[230px] max-w-[55%] select-none"
          style={{ opacity: 0.08 }}
        />
      )}

      <div className="relative px-3.5 pt-3.5 pb-3.5 sm:px-4">
        {/* 상단열: 리그 · 경과분 배지 */}
        <div className="flex items-center justify-between gap-2">
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
          {live ? (
            <span
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
              style={{ background: CHIP_BG, color: "var(--gn-live)", letterSpacing: "0.06em" }}
            >
              {/* 라임은 LIVE 전용, 화면당 1곳 — 불판에서는 여기가 그 1곳 */}
              <span
                aria-hidden
                className="h-1.5 w-1.5 animate-pulse rounded-full"
                style={{ background: "var(--gn-live)" }}
              />
              {lfa?.minute ? <span className="gn-num">{lfa.minute}&#8242;</span> : "LIVE"}
            </span>
          ) : (
            <span
              className="gn-num shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold"
              style={{ background: CHIP_BG, color: CREAM_DIM, letterSpacing: "0.14em" }}
            >
              {finished ? "FT" : "예정"}
            </span>
          )}
        </div>

        {/* 스코어열 — 매치 헤더의 축소판 */}
        <div className="mt-3 mb-1 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-4">
          <span
            className="min-w-0 text-right text-[15px] leading-tight font-extrabold sm:text-[16px]"
            style={{ color: CREAM, wordBreak: "keep-all" }}
          >
            {homeLabel}
          </span>
          {showScore ? (
            <span
              className="gn-num text-center text-[32px] leading-none font-bold sm:text-[36px]"
              style={{ letterSpacing: "-0.02em" }}
            >
              <span style={{ color: homeTone }}>{homeScore}</span>
              <span style={{ opacity: 0.35, fontSize: "0.5em", padding: "0 9px", color: CREAM }}>
                –
              </span>
              <span style={{ color: awayTone }}>{awayScore}</span>
            </span>
          ) : (
            <span className="text-center">
              <span
                className="gn-num block text-[24px] leading-none font-bold"
                style={{ color: CREAM }}
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
            style={{ color: CREAM, wordBreak: "keep-all" }}
          >
            {awayLabel}
          </span>
        </div>

        {/* 이벤트 타임라인 — 최신이 위, 킥오프·하프타임·종료 마커가 척추.
            최근 7행만 펼치고 나머지는 접는다 (운영자: "목표는 댓글판" — 전광판이
            화면을 다 먹으면 안 된다) */}
        {started &&
          (() => {
            const rows: React.ReactNode[] = []
            if (finished) rows.push(<MarkerRow key="ft" chip="FT" label="경기 종료" />)
            secondHalf.forEach((e, i) =>
              rows.push(
                <EventRow key={`s${i}`} e={e} team={e.side === "away" ? awayLabel : homeLabel} />
              )
            )
            if (showHt) rows.push(<MarkerRow key="ht" chip="HT" label={`하프타임 ${halfTime}`} />)
            firstHalf.forEach((e, i) =>
              rows.push(
                <EventRow key={`f${i}`} e={e} team={e.side === "away" ? awayLabel : homeLabel} />
              )
            )
            rows.push(<MarkerRow key="ko" chip="KO" label="킥오프" />)
            const HEAD = 7
            return (
              <CollapsibleRows
                head={rows.slice(0, HEAD)}
                rest={rows.slice(HEAD)}
                restCount={Math.max(0, rows.length - HEAD)}
              />
            )
          })()}

        {/* 하단열: 매치센터 도선 */}
        <div className="mt-2.5 flex justify-end">
          <Link
            href={`/match/${gameId}`}
            className="text-[11.5px] font-bold no-underline"
            style={{ color: CREAM_DIM }}
          >
            매치센터에서 스탯·라인업 →
          </Link>
        </div>
      </div>
    </section>
  )
}

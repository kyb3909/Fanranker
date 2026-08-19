import Link from "@/components/ui/app-link"
import { getFixturesForDay, type FixtureRow } from "@/lib/match/get-fixtures"
import { displayTeamName, type TeamShortMap } from "@/lib/match/team-display"

/**
 * 매치센터 우측 레일 ① — 같은 매치데이의 다른 경기 (2026-08-20 시안 승인).
 *
 * 매치센터는 나가는 문이 "← 경기 일정" 하나뿐인 막다른 길이었다 (패널 공통 지적).
 * 데스크톱의 빈 좌우 여백을 **장식이 아니라 정보**로 채운다 — 재료는 일정 페이지와
 * 같은 getFixturesForDay 재사용이라 추가 외부 호출 0.
 *
 * fail-open: 이 경기 말고 보여줄 경기가 없으면 조용히 사라진다.
 */

/** 이 경기가 속한 매치데이 시작일 — 백링크와 같은 공식 (KST 06:00 경계 = +3h UTC) */
function matchdayOf(matchTime: string): string {
  return new Date(new Date(matchTime).getTime() + 3 * 3600_000).toISOString().slice(0, 10)
}

function fmtKstTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  })
}

function RowTime({ m }: { m: FixtureRow }) {
  if (m.status === "completed") {
    return (
      <span
        className="gn-num text-[10.5px] font-bold"
        style={{ color: "var(--wc-mute-2)", letterSpacing: "0.08em" }}
      >
        FT
      </span>
    )
  }
  if (m.status === "cancelled") {
    return (
      <span className="text-[10.5px] font-bold" style={{ color: "var(--wc-mute-2)" }}>
        취소
      </span>
    )
  }
  return (
    <span className="gn-num text-[12px] font-bold" style={{ color: "var(--wc-ink)" }}>
      {fmtKstTime(m.matchTime)}
    </span>
  )
}

export async function MatchdayRail({
  currentGameId,
  matchTime,
  shortNames,
}: {
  currentGameId: string
  matchTime: string
  shortNames: TeamShortMap
}) {
  const date = matchdayOf(matchTime)
  const fixtures = await getFixturesForDay(date).catch(() => [] as FixtureRow[])
  if (fixtures.length <= 1) return null

  // 현재 경기를 맨 위로, 나머지는 킥오프 순 — 레일은 8행까지만 (지면이 아니라 곁창이다)
  const current = fixtures.find((f) => f.gameId === currentGameId)
  const others = fixtures
    .filter((f) => f.gameId !== currentGameId)
    .sort((a, b) => a.matchTime.localeCompare(b.matchTime))
    .slice(0, 7)
  const rows = current ? [current, ...others] : others
  if (rows.length <= 1) return null

  const label = (name: string) => displayTeamName(name, shortNames)

  return (
    <section
      className="overflow-hidden rounded-2xl"
      style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
    >
      <div
        className="flex items-baseline justify-between px-4 pt-3.5 pb-2"
        style={{ borderBottom: "1px solid var(--wc-line)" }}
      >
        <span
          className="text-[12px] font-extrabold"
          style={{ color: "var(--wc-mute)", letterSpacing: "0.06em" }}
        >
          이 매치데이의 경기
        </span>
        <Link
          href={`/matches?date=${date}`}
          className="text-[12px] font-bold no-underline"
          style={{ color: "var(--wc-burgundy)" }}
        >
          전체 일정 →
        </Link>
      </div>
      <ul>
        {rows.map((m, i) => {
          const isCurrent = m.gameId === currentGameId
          const inner = (
            <span
              className="grid grid-cols-[42px_1fr_auto] items-baseline gap-2 px-4 py-2.5"
              style={{
                borderTop: i > 0 ? "1px solid var(--wc-line)" : undefined,
                background: isCurrent ? "var(--wc-soft)" : undefined,
              }}
            >
              <RowTime m={m} />
              <span
                className={`truncate text-[12.5px] ${isCurrent ? "font-extrabold" : "font-semibold"}`}
                style={{ color: isCurrent ? "var(--wc-ink)" : "var(--wc-mute)" }}
              >
                {label(m.homeTeam)} – {label(m.awayTeam)}
              </span>
              {m.status === "completed" && m.homeScore != null && m.awayScore != null ? (
                <span
                  className="gn-num text-[12.5px] font-bold"
                  style={{ color: isCurrent ? "var(--wc-ink)" : "var(--wc-mute)" }}
                >
                  {m.homeScore}-{m.awayScore}
                </span>
              ) : (
                <span />
              )}
            </span>
          )
          return (
            <li key={m.matchKey}>
              {m.gameId && !isCurrent ? (
                <Link
                  href={`/match/${m.gameId}`}
                  className="block no-underline transition-colors hover:bg-[var(--wc-soft)]"
                >
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

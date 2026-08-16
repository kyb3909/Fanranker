import type { Metadata } from "next"
import Link from "@/components/ui/app-link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { PageBand, PageBandStat } from "@/components/page-band"
import { getFixturesForDay, todayKst, kstDayRange, type FixtureRow } from "@/lib/match/get-fixtures"
import { leagueLabel, leagueOrder } from "@/lib/match/leagues"

/**
 * 경기 일정 — `/matches` (2026-08-16)
 *
 * 대상: 매치 페이지와 동일한 화이트리스트(유럽 대항전·5대 리그·컵). 날짜는 KST 달력일 —
 * 베팅 윈도우(08:00 경계) 말고 사람의 "토요일 경기" 직관을 따른다.
 *
 * 디자인: 전 페이지 공용 다크 밴드(PageBand) + 웜 페이퍼 지면. 리그별 섹션(대항전 →
 * 5대 리그 → 컵 순), 행은 시각/상태 — 팀 — 스코어. 대상 리그라 모든 행이 매치 페이지로
 * 간다. LIVE 는 버건디 배지 + 스코어, FT 는 스코어가 주인공, 예정은 킥오프 시각이 주인공.
 */
export const revalidate = 60

export const metadata: Metadata = {
  title: "경기 일정",
  description: "챔피언스리그·유로파리그·유럽 5대 리그 경기 일정과 결과",
  alternates: { canonical: "/matches" },
}

function fmtKstTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  })
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const

function dateParts(dateKst: string) {
  const d = new Date(`${dateKst}T00:00:00+09:00`)
  return {
    month: d.getUTCMonth() /* +09 로 만든 UTC 자정 기준 */,
    label: `${Number(dateKst.slice(5, 7))}월 ${Number(dateKst.slice(8, 10))}일`,
    short: `${Number(dateKst.slice(5, 7))}.${Number(dateKst.slice(8, 10))}`,
    weekday: WEEKDAYS[new Date(`${dateKst}T12:00:00+09:00`).getUTCDay()],
  }
}

function shiftDate(dateKst: string, days: number): string {
  const d = new Date(`${dateKst}T12:00:00+09:00`)
  return new Date(d.getTime() + days * 24 * 3600_000).toISOString().slice(0, 10)
}

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const today = todayKst()
  const date = params.date && kstDayRange(params.date) ? params.date : today
  const fixtures = await getFixturesForDay(date)

  // 리그별 섹션 — 대항전 → 5대 리그 → 컵 (leagues.ts 삽입 순서)
  const sections = new Map<string, FixtureRow[]>()
  for (const f of fixtures) {
    const arr = sections.get(f.leagueCode) ?? []
    arr.push(f)
    sections.set(f.leagueCode, arr)
  }
  const ordered = [...sections.entries()].sort((a, b) => leagueOrder(a[0]) - leagueOrder(b[0]))

  const dp = dateParts(date)
  const liveCount = fixtures.filter((f) => f.status === "in_progress").length

  return (
    <div className="worldcup-scope min-h-[100dvh]">
      <PageBand
        kicker="Fixtures"
        title="경기 일정"
        description="챔피언스리그 · 유로파리그 · 유럽 5대 리그와 주요 컵대회"
        aside={
          <PageBandStat
            value={fixtures.length}
            label={liveCount > 0 ? `${liveCount} LIVE` : "MATCHES"}
          />
        }
      />

      <main className="mx-auto max-w-[760px] px-4 py-6 sm:px-6">
        {/* 날짜 내비 — 오늘 ±3일 칩 + 화살표. 서버 렌더 링크라 상태 없이 동작 */}
        <nav className="flex items-center gap-1.5" aria-label="날짜 선택">
          <Link
            href={`/matches?date=${shiftDate(date, -1)}`}
            aria-label="전날"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
            style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
          >
            <ChevronLeft className="h-4 w-4" style={{ color: "var(--wc-mute)" }} />
          </Link>
          <div className="scrollbar-none flex flex-1 items-center gap-1.5 overflow-x-auto">
            {[-2, -1, 0, 1, 2, 3].map((off) => {
              const d = shiftDate(today, off)
              const p = dateParts(d)
              const active = d === date
              return (
                <Link
                  key={d}
                  href={off === 0 ? "/matches" : `/matches?date=${d}`}
                  aria-current={active ? "date" : undefined}
                  className="flex shrink-0 flex-col items-center rounded-lg px-3 py-1.5 no-underline"
                  style={{
                    background: active ? "var(--wc-burgundy)" : "var(--wc-card)",
                    border: `1px solid ${active ? "var(--wc-burgundy)" : "var(--wc-line)"}`,
                  }}
                >
                  <span
                    className="text-[10.5px] font-bold"
                    style={{ color: active ? "rgba(255,255,255,.75)" : "var(--wc-mute-2)" }}
                  >
                    {off === 0 ? "오늘" : p.weekday}
                  </span>
                  <span
                    className="gn-num text-[13px] leading-tight font-bold"
                    style={{ color: active ? "#fff" : "var(--wc-ink)" }}
                  >
                    {p.short}
                  </span>
                </Link>
              )
            })}
          </div>
          <Link
            href={`/matches?date=${shiftDate(date, 1)}`}
            aria-label="다음날"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
            style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
          >
            <ChevronRight className="h-4 w-4" style={{ color: "var(--wc-mute)" }} />
          </Link>
        </nav>

        {/* 날짜 표제 — 매거진 일정면의 날짜 마스트헤드 */}
        <div className="mt-6 flex items-baseline gap-2.5">
          <h2
            className="text-[22px] leading-none"
            style={{
              fontFamily: "var(--font-display-ko), var(--font-title)",
              fontWeight: 700,
              color: "var(--wc-ink)",
              letterSpacing: "-0.03em",
            }}
          >
            {dp.label}
          </h2>
          <span className="text-[13px] font-bold" style={{ color: "var(--wc-mute)" }}>
            {dp.weekday}요일{date === today ? " · 오늘" : ""}
          </span>
        </div>

        {ordered.length === 0 && (
          <p
            className="mt-6 rounded-xl px-4 py-10 text-center text-[13.5px]"
            style={{
              background: "var(--wc-card)",
              border: "1px solid var(--wc-line)",
              color: "var(--wc-mute)",
            }}
          >
            이 날짜에는 대상 리그 경기가 없습니다.
          </p>
        )}

        <div className="mt-4 space-y-6">
          {ordered.map(([code, rows]) => (
            <section key={code}>
              {/* 리그 섹션 헤더 — 스몰캡스 + 괘선 (편집 지면 문법) */}
              <div className="flex items-center gap-3">
                <h3
                  className="shrink-0 text-[12px] font-extrabold"
                  style={{ color: "var(--wc-burgundy)", letterSpacing: "0.06em" }}
                >
                  {leagueLabel(code)}
                </h3>
                <span
                  aria-hidden
                  className="h-px flex-1"
                  style={{ background: "var(--wc-line-2)" }}
                />
                <span
                  className="gn-num shrink-0 text-[11px] font-bold"
                  style={{ color: "var(--wc-mute-2)" }}
                >
                  {rows.length}
                </span>
              </div>

              <ul
                className="mt-2 overflow-hidden rounded-xl"
                style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
              >
                {rows.map((m, i) => (
                  <li
                    key={m.matchKey}
                    style={i > 0 ? { borderTop: "1px solid var(--wc-line)" } : undefined}
                  >
                    <Link
                      href={`/match/${m.gameId}`}
                      className="grid grid-cols-[56px_1fr] items-center gap-3 px-4 py-3 no-underline transition-colors hover:bg-[var(--wc-soft)]"
                    >
                      {/* 좌: 시각 또는 상태 */}
                      {m.status === "in_progress" ? (
                        <span
                          className="gn-num rounded px-1.5 py-[3px] text-center text-[10.5px] font-extrabold"
                          style={{
                            background: "var(--wc-burgundy)",
                            color: "#fff",
                            letterSpacing: "0.08em",
                          }}
                        >
                          LIVE
                        </span>
                      ) : m.status === "completed" ? (
                        <span
                          className="gn-num text-center text-[11px] font-bold"
                          style={{ color: "var(--wc-mute-2)", letterSpacing: "0.08em" }}
                        >
                          FT
                        </span>
                      ) : m.status === "cancelled" ? (
                        <span
                          className="text-center text-[11px] font-bold"
                          style={{ color: "var(--wc-mute-2)" }}
                        >
                          취소
                        </span>
                      ) : (
                        <span
                          className="gn-num text-center text-[15px] font-bold"
                          style={{ color: "var(--wc-ink)" }}
                          suppressHydrationWarning
                        >
                          {fmtKstTime(m.matchTime)}
                        </span>
                      )}

                      {/* 우: 팀 + 스코어 */}
                      <span className="grid min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <span
                          className="truncate text-right text-[14px] font-bold"
                          style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
                        >
                          {m.homeTeam}
                        </span>
                        <span
                          className="gn-num text-center text-[15px] font-bold"
                          style={{
                            color:
                              m.homeScore != null
                                ? m.status === "in_progress"
                                  ? "var(--wc-burgundy)"
                                  : "var(--wc-ink)"
                                : "var(--wc-mute-2)",
                            minWidth: 34,
                          }}
                        >
                          {m.homeScore != null && m.awayScore != null
                            ? `${m.homeScore}:${m.awayScore}`
                            : "vs"}
                        </span>
                        <span
                          className="truncate text-left text-[14px] font-bold"
                          style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
                        >
                          {m.awayTeam}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}

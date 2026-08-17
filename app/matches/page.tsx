import type { Metadata } from "next"
import Link from "@/components/ui/app-link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { PageBand, PageBandStat } from "@/components/page-band"
import {
  getFixturesForDay,
  todayKst,
  kstDayRange,
  matchdayEndDate,
  type FixtureRow,
} from "@/lib/match/get-fixtures"
import { leagueLabel, leagueOrder } from "@/lib/match/leagues"
import { getLfaDayIndex, lookupLfaDayEntry } from "@/lib/lfa/match"

/**
 * 경기 일정 — `/matches` (2026-08-16)
 *
 * 대상: 매치 페이지와 동일한 화이트리스트(유럽 대항전·5대 리그·컵). 날짜는 KST 달력일 —
 * 베팅 윈도우(08:00 경계) 말고 사람의 "토요일 경기" 직관을 따른다.
 *
 * 디자인: 전 페이지 공용 다크 밴드(PageBand) + 웜 페이퍼 지면. 리그별 섹션(대항전 →
 * 5대 리그 → 컵 순), 행은 시각/상태 — 팀 — 스코어. 대상 리그라 모든 행이 매치 페이지로
 * 간다. FT 는 스코어가 주인공, 예정·진행 중은 킥오프 시각이 주인공 — 라이브 스코어는
 * 제공하지 않는다 (2026-08-16 운영자: 라이브 없이 종료 후 매치 리포트 형태로).
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

/**
 * 매치데이 라벨 — 한 창이 KST 06:00~다음날 06:00 이라 **두 날짜에 걸친다**.
 * 유럽 경기가 한국 새벽이라 "8월 16일"만 쓰면 그날 밤 경기가 다른 날처럼 보인다
 * (2026-08-17 운영자). 그래서 "8월 16-17일" / "8.16-17" 로 짝지어 표기한다.
 */
function dateParts(dateKst: string) {
  const end = matchdayEndDate(dateKst)
  const m = Number(dateKst.slice(5, 7))
  const d1 = Number(dateKst.slice(8, 10))
  const m2 = Number(end.slice(5, 7))
  const d2 = Number(end.slice(8, 10))
  // 달을 넘어가면 종료일에도 월을 붙인다 (8월 31-9월 1일)
  const crossesMonth = m !== m2
  return {
    label: crossesMonth ? `${m}월 ${d1}일-${m2}월 ${d2}일` : `${m}월 ${d1}-${d2}일`,
    short: crossesMonth ? `${m}.${d1}-${m2}.${d2}` : `${m}.${d1}-${d2}`,
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
  const rawFixtures = await getFixturesForDay(date)

  // betman 은 종료를 1~1.5시간 늦게 반영한다. 킥오프가 지났는데 아직 스코어가 없는 경기가
  // 하나라도 있을 때만 LFA 를 부른다 — 이미 다 정산된 날에는 크레딧을 쓰지 않는다.
  const needsLfa = rawFixtures.some(
    (f) =>
      new Date(f.matchTime).getTime() < Date.now() &&
      f.status !== "cancelled" &&
      (f.status !== "completed" || f.homeScore == null)
  )
  const lfaIndex = needsLfa ? await getLfaDayIndex(date) : null
  const fixtures: FixtureRow[] = lfaIndex
    ? rawFixtures.map((f) => {
        const hit = lookupLfaDayEntry(lfaIndex, f)
        if (!hit) return f
        return {
          ...f,
          status: hit.finished && f.status !== "cancelled" ? "completed" : f.status,
          homeScore: f.homeScore ?? hit.homeScore,
          awayScore: f.awayScore ?? hit.awayScore,
        }
      })
    : rawFixtures

  // 리그별 섹션 — 대항전 → 5대 리그 → 컵 (leagues.ts 삽입 순서)
  const sections = new Map<string, FixtureRow[]>()
  for (const f of fixtures) {
    const arr = sections.get(f.leagueCode) ?? []
    arr.push(f)
    sections.set(f.leagueCode, arr)
  }
  const ordered = [...sections.entries()].sort((a, b) => leagueOrder(a[0]) - leagueOrder(b[0]))

  const dp = dateParts(date)

  return (
    <div className="worldcup-scope min-h-[100dvh]">
      <PageBand
        kicker="Fixtures"
        title="경기 일정"
        description="챔피언스리그 · 유로파리그 · 유럽 5대 리그와 주요 컵대회"
        aside={<PageBandStat value={fixtures.length} label="MATCHES" />}
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
            {dp.weekday}요일 밤{date === today ? " · 오늘" : ""}
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
                      {/* 좌: 시각 또는 상태 — 진행 중도 킥오프 시각으로 (라이브 표기 없음) */}
                      {m.status === "completed" ? (
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
                              m.status === "completed" && m.homeScore != null
                                ? "var(--wc-ink)"
                                : "var(--wc-mute-2)",
                            minWidth: 34,
                          }}
                        >
                          {/* 스코어는 종료 후에만 — 진행 중 표시는 갱신 소스가 없어 오정보 */}
                          {m.status === "completed" && m.homeScore != null && m.awayScore != null
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

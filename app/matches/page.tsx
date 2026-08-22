import type { Metadata } from "next"
import Link from "@/components/ui/app-link"
import { PageBand, PageBandStat } from "@/components/page-band"
import { MatchHubTabs } from "@/components/match/hub-tabs"
import { EmptyScene } from "@/components/empty-scene"
import { FixturesTarotHook } from "@/components/tarot/fixtures-tarot-hook"
import { BridgeRow } from "@/components/bridge-row"
import {
  getFixturesForDay,
  todayKst,
  kstDayRange,
  matchdayEndDate,
  type FixtureRow,
} from "@/lib/match/get-fixtures"
import { leagueLabel, leagueOrder } from "@/lib/match/leagues"
import { hasFamousClub } from "@/lib/match/famous-clubs"
import { getLfaDayIndex, lookupLfaDayEntry } from "@/lib/lfa/match"
import { displayTeamName, loadTeamShortMap } from "@/lib/match/team-display"

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
  // page title 은 og 로 자동 전파되지 않는다 (2026-08-20 PM 실측 — 공유 카드가 기본 문구였다)
  openGraph: {
    title: "경기 일정",
    description: "챔피언스리그·유로파리그·유럽 5대 리그 경기 일정과 결과",
  },
  twitter: { title: "경기 일정" },
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

/**
 * 아직 한글 표기가 없는 팀은 색을 낮춘다 — 숨기지 않고 "미번역"을 시각적으로 인정한다.
 * 한 지면에서 한글과 로마자가 번갈아 나오면 어떤 타이포로도 못 살린다 (2026-08-18 감사).
 */
/**
 * 접을 리그인가 — 5대 리그·유럽 대항전은 절대 접지 않고, 컵대회가 9경기 이상일 때만 접는다.
 * (컵 1라운드에 하부리그 30경기가 통째로 들어와 지면을 8,921px 로 늘리던 것을 막는다)
 */
const NEVER_COLLAPSE = new Set([
  "EPL",
  "라리가",
  "세리에A",
  "분데스리",
  "프리그1",
  "UCL",
  "UEL",
  "UECL",
])
function collapsed(leagueCode: string, count: number): boolean {
  return !NEVER_COLLAPSE.has(leagueCode) && count > 8
}

/**
 * 팀명은 전부 잉크 한 색 (2026-08-20 편집 감리 A-1).
 * ⚠️ 종전엔 한글 표기 없는 팀만 회색으로 낮췄는데, 독자에게 그 규칙(사전 유무)은
 *    존재하지 않는 정보다 — 회색 팀명은 "비활성/오류"로 읽혀 데이터가 덜 익은 인상만 준다.
 *    색 차이에는 반드시 읽히는 규칙이 있어야 한다.
 */
function teamTone(): string {
  return "var(--wc-ink)"
}

/**
 * 행 껍데기 — 목적지는 매치센터, 없으면 링크 없음 (2026-08-22 운영자: "매치센터
 * 들어갈 방법이 없어졌다 — 관문을 하나 더 두더라도 매치센터로"). 8/20의 불판 우선
 * 스왑을 되돌린 것 — 불판은 매치센터 상단의 참여 행으로 들어간다.
 */
function FixtureRowShell({
  gameId,
  children,
}: {
  gameId: string | null
  children: React.ReactNode
}) {
  const cls = "grid grid-cols-[56px_1fr] items-center gap-3 px-4 py-3"
  const href = gameId ? `/match/${gameId}` : null
  if (!href) return <div className={cls}>{children}</div>
  return (
    <Link href={href} className={`${cls} no-underline transition-colors hover:bg-[var(--wc-soft)]`}>
      {children}
    </Link>
  )
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
  // 접힌 컵대회를 펼친 리그 코드들 — 서버 컴포넌트라 상태 대신 쿼리로 든다.
  // ⚠️ 종전 "접힘"은 hidden 클래스만 붙이고 펼칠 수단이 없는 **영구 삭제**였다
  //    (2026-08-19 PM 실측: FA컵 130경기 도달 불가).
  const expanded = new Set((params.expand ?? "").split(",").filter(Boolean))
  // getFixturesForDay 가 LFA(정본) + betman(보강)을 이미 병합해 준다 — 스코어·종료 판정도
  // 그 안에서 끝난다. 예전의 별도 LFA 보정 단계는 중복이라 제거했다 (2026-08-17).
  const fixtures: FixtureRow[] = await getFixturesForDay(date)

  // 리그별 섹션 — 대항전 → 5대 리그 → 컵 (leagues.ts 삽입 순서)
  const sections = new Map<string, FixtureRow[]>()
  for (const f of fixtures) {
    const arr = sections.get(f.leagueCode) ?? []
    arr.push(f)
    sections.set(f.leagueCode, arr)
  }
  const ordered = [...sections.entries()].sort((a, b) => leagueOrder(a[0]) - leagueOrder(b[0]))

  // 지면 표기는 사전 통칭으로 (2026-08-19 운영자: "인테르나치오날레 그냥 인테르").
  // ⚠️ 라벨만 바꾼다 — m.homeTeam 원문은 LFA 해석 키라 건드리면 경기 매칭이 깨진다.
  const shortNames = await loadTeamShortMap()
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
        {/* 경기 허브 — 일정과 순위는 같은 질문의 앞뒷면이라 한 지붕 아래 둔다 */}
        <div className="-mx-4 mb-5 sm:-mx-6">
          <MatchHubTabs active="fixtures" />
        </div>
        {/* 날짜 내비 (2026-08-18 리디자인 6단계).
            ⚠️ 범위 기준이 `today` 였다 — 8/22 를 보고 있으면 칩이 오늘 ±3 만 그려져
            **활성 칩이 하나도 없었다.** 보고 있는 날짜(`date`) 기준으로 바꾼다.
            화살표 2개는 삭제: 칩이 좌우로 스크롤되고 맨 끝 칩이 곧 이동 수단이다. */}
        <nav className="wc-chip-tabs" aria-label="날짜 선택">
          {[-3, -2, -1, 0, 1, 2, 3].map((off) => {
            const d = shiftDate(date, off)
            const p = dateParts(d)
            const active = off === 0
            return (
              <Link
                key={d}
                href={d === today ? "/matches" : `/matches?date=${d}`}
                aria-current={active ? "date" : undefined}
                className={`no-underline ${active ? "on" : ""}`}
              >
                <span style={{ opacity: 0.75 }}>{d === today ? "오늘" : p.weekday}</span>
                <span className="gn-num font-bold">{p.short}</span>
              </Link>
            )
          })}
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
          <div
            className="mt-6 rounded-xl px-4 pt-8 pb-9 text-center"
            style={{
              background: "var(--wc-card)",
              border: "1px solid var(--wc-line)",
            }}
          >
            <EmptyScene src="/images/empty/empty-no-matches.webp" size={320} />
            <p className="mt-4 text-[13.5px]" style={{ color: "var(--wc-mute)" }}>
              이 날짜에는 대상 리그 경기가 없습니다.
            </p>
          </div>
        )}

        <div className="mt-4 space-y-6">
          {ordered.map(([code, rows]) => (
            <section key={code}>
              {/* 리그 섹션 헤더 — 스몰캡스 + 괘선 (편집 지면 문법) */}
              <div className="flex items-center gap-3">
                <h3
                  className="shrink-0 text-[12px] font-extrabold"
                  style={{ color: "var(--wc-ink)", letterSpacing: "0.06em" }}
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

              {/* 컵대회 1라운드는 한 리그에 30경기씩 들어온다 (DFB 포칼·카라바오컵).
                  8경기를 넘으면 접어 둔다 — 지면이 8,921px 까지 늘어나던 주범 (2026-08-18). */}
              <ul
                className={`mt-2 overflow-hidden rounded-xl ${collapsed(code, rows.length) && !expanded.has(code) ? "hidden" : ""}`}
                style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
              >
                {rows.map((m, i) => {
                  // 타로 노출 판정을 미리 계산 — 버튼은 행 위에 절대배치로 겹친다.
                  // flex 형제로 두면 버튼 있는 행만 셸 폭이 줄어 vs 기준선이 왼쪽으로
                  // 밀렸다 (2026-08-22 운영자: "vs 위치가 일정해야 해").
                  const tarot =
                    m.status === "scheduled" &&
                    new Date(m.matchTime).getTime() > Date.now() &&
                    hasFamousClub(
                      displayTeamName(m.homeTeam, shortNames),
                      displayTeamName(m.awayTeam, shortNames)
                    )
                  return (
                    <li
                      key={m.matchKey}
                      style={i > 0 ? { borderTop: "1px solid var(--wc-line)" } : undefined}
                    >
                      {/* betman 에 아직 마켓이 없는 경기는 매치 페이지가 없다 (라인업·리포트가
                        betman id 로 걸려 있다) — 링크 없이 목록에만 싣는다 */}
                      <div className="relative flex items-center">
                        <div className="min-w-0 flex-1">
                          <FixtureRowShell gameId={m.gameId}>
                            {/* 좌: 시각 또는 상태. 진행 중은 "경기 중" — 킥오프 시각을 그대로 두면
                          "아직 안 시작했나?" 로 오독된다 (2026-08-19 팬·UIUX 합치).
                          라이브 스코어 미제공 정책은 그대로 — 상태 카피만 바꾼다. */}
                            {m.status === "completed" ? (
                              <span
                                className="gn-num text-center text-[11px] font-bold"
                                style={{ color: "var(--wc-mute-2)", letterSpacing: "0.08em" }}
                              >
                                FT
                              </span>
                            ) : m.status === "in_progress" ||
                              (m.status === "scheduled" &&
                                // 킥오프 후 ~3시간까지만 — 종료 신호가 안 온 옛 경기에 "경기 중"을
                                // 계속 달아두면 그게 더 큰 거짓말이 된다
                                Date.now() - new Date(m.matchTime).getTime() > 0 &&
                                Date.now() - new Date(m.matchTime).getTime() < 3 * 3600_000) ? (
                              <span
                                className="text-center text-[11px] leading-tight font-bold"
                                style={{ color: "var(--wc-burgundy)" }}
                              >
                                경기 중
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
                                style={{ color: teamTone(), wordBreak: "keep-all" }}
                              >
                                {displayTeamName(m.homeTeam, shortNames)}
                              </span>
                              <span
                                className="gn-num text-center text-[15px] font-bold"
                                style={{
                                  color:
                                    (m.status === "completed" || m.status === "in_progress") &&
                                    m.homeScore != null
                                      ? "var(--wc-ink)"
                                      : "var(--wc-mute-2)",
                                  minWidth: 34,
                                }}
                              >
                                {/* 진행 중에도 스코어를 낸다 (2026-08-20 운영자 — LFA 라이브 실측
                              확인으로 "갱신 소스 없음" 전제 폐기). day 목록 5분 캐시라 목록의
                              라이브 스코어는 최대 5분 지연 — 분 단위 정밀은 매치 페이지가 담당.
                              예정 경기는 vs 를 낸다 (2026-08-22 운영자 — 8/18 "공백이면
                              충분" 결정 폐기. 빈칸은 대진인지 렌더 누락인지 안 읽힌다).
                              반복 잡음은 크기·톤으로 죽인다 — 스코어보다 작고 연하게. */}
                                {(m.status === "completed" || m.status === "in_progress") &&
                                m.homeScore != null &&
                                m.awayScore != null ? (
                                  `${m.homeScore}–${m.awayScore}`
                                ) : (
                                  <span className="text-[11px] font-semibold tracking-wide">
                                    vs
                                  </span>
                                )}
                              </span>
                              <span
                                // 버튼이 겹치는 행만 원정팀 텍스트를 일찍 자른다 — 패딩은
                                // 1fr 트랙 폭을 안 바꾸므로 vs 기준선은 그대로다
                                className={`truncate text-left text-[14px] font-bold${tarot ? "pr-[80px]" : ""}`}
                                style={{ color: teamTone(), wordBreak: "keep-all" }}
                              >
                                {displayTeamName(m.awayTeam, shortNames)}
                              </span>
                            </span>
                          </FixtureRowShell>
                        </div>
                        {/* 행 우측 타로점 (2026-08-21 운영자: "각 경기 오른쪽에, 유명 클럽이
                          있을 때만"). 킥오프 전 경기 한정 — 시작·종료된 경기 점괘는 무의미 */}
                        {tarot && (
                          <div className="absolute top-1/2 right-3 -translate-y-1/2">
                            <FixturesTarotHook
                              question={`${displayTeamName(m.homeTeam, shortNames)} vs ${displayTeamName(m.awayTeam, shortNames)}, 승부의 흐름은?`}
                            />
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
              {collapsed(code, rows.length) && !expanded.has(code) && (
                <Link
                  href={`/matches?date=${date}&expand=${[...expanded, code].join(",")}`}
                  scroll={false}
                  className="mt-2 flex items-baseline justify-between rounded-xl px-4 py-3 text-[12.5px] no-underline"
                  style={{
                    background: "var(--wc-soft)",
                    color: "var(--wc-mute)",
                  }}
                >
                  <span>{rows.length}경기 — 하부 라운드 포함</span>
                  <span className="font-bold" style={{ color: "var(--wc-burgundy)" }}>
                    모두 보기
                  </span>
                </Link>
              )}
            </section>
          ))}
        </div>
        {/* 지면 종단 도선 (2026-08-20 UX 패널 — 일정 끝이 데드엔드였다).
            실록 행은 2026-08-22 3자 토의 만장일치 — 시즌 사가 인덱스의 유일했던
            무입구 문제 봉합 (workspace/saga-entry-FINAL-20260822.md) */}
        <div className="mt-8 space-y-2">
          <BridgeRow
            href="/saga?utm_source=matches"
            title="시즌 사가 · 이적 사가"
            action="사가 →"
          />
          <BridgeRow
            href="/standings/epl"
            title="5대 리그 순위는 어떻게 됐을까"
            action="순위표 →"
          />
          <BridgeRow href="/" title="오늘의 축구 소식 보러 가기" action="담벼락 →" />
        </div>
      </main>
    </div>
  )
}

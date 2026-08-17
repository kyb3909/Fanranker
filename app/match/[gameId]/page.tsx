import type { Metadata } from "next"
import { Suspense } from "react"
import { notFound } from "next/navigation"

import { getMatchByGameId } from "@/lib/match/get-match"
import { isMatchExtrasLeague } from "@/lib/match/leagues"
import { getLfaMatchInfo } from "@/lib/lfa/match"
import { MatchHeader } from "./match-header"
import { MatchExtrasSection } from "./match-extras-section"
import { MatchStatsSection } from "./match-stats-section"
import { MatchInfoSection } from "./match-info-section"
import { MatchTabs } from "./match-tabs"
import { MatchLineup } from "@/components/match/match-lineup"

/**
 * 매치 페이지 — `/match/[gameId]` (2026-08-16, 1차)
 *
 * "새벽 라리가 경기 어떻게 됐지?"에 답하는 경기별 고유 URL. 홈 밴드의 LIVE/FT 행과
 * lineup-preview 가 여기로 링크한다.
 *
 * 범위(운영자 확정): 유럽 대항전(UCL/UEL/UECL/U슈퍼컵) + 5대 리그 + 그 컵대회만
 * (lib/match/leagues.ts). 목록 밖 리그·타 종목은 404.
 *
 * 1차 구성: 스코어 헤더 + 선발 라인업(soccerway, FT 후 24h까지). **라이브 스코어는
 * 제공하지 않는다** — wisetoto 개편으로 수집이 끊겨, 라이브 없이 종료 후 매치 리포트
 * 형태로 확정 (2026-08-16 운영자). 스코어는 결과 동기화(betman) 후 표시. 리포트+기초
 * 스탯은 **FT 후 + MATCH_EXTRAS_LEAGUES(5대 리그·UCL·잉슈퍼컵) 한정**. 과거 아카이브는
 * 실록 단계 3~4(fixtures 영속화)에서 — 여기는 betman_games 읽기 전용이라 24h 지난
 * 경기의 라인업은 비고 스코어만 남는다.
 */
export const revalidate = 30

interface Props {
  params: Promise<{ gameId: string }>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { gameId } = await params
  if (!UUID_RE.test(gameId)) return { title: "경기" }
  const m = await getMatchByGameId(gameId)
  if (!m) return { title: "경기" }
  const score =
    m.homeScore != null && m.awayScore != null ? ` ${m.homeScore}:${m.awayScore} ` : " vs "
  return {
    title: `${m.homeTeam}${score}${m.awayTeam}`,
    description: `${m.leagueCode} — ${m.homeTeam} vs ${m.awayTeam} 경기 정보·스코어·선발 라인업`,
    alternates: { canonical: `/match/${m.gameId}` },
  }
}

export default async function MatchPage({ params }: Props) {
  const { gameId } = await params
  if (!UUID_RE.test(gameId)) notFound()

  const match = await getMatchByGameId(gameId)
  if (!match) notFound()

  // betman 은 종료를 1~1.5시간 늦게 반영한다 (2026-08-16 실측). LFA 가 먼저 주는 FT·스코어를
  // 함께 보고, 어느 쪽이든 먼저 종료를 알려주면 그때부터 스코어·스탯·리포트를 연다.
  const lfa = await getLfaMatchInfo({
    gameId: match.gameId,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    matchTime: match.matchTime,
    leagueCode: match.leagueCode,
  })
  const finished = match.status === "completed" || lfa?.finished === true
  const homeScore = match.homeScore ?? lfa?.homeScore ?? null
  const awayScore = match.awayScore ?? lfa?.awayScore ?? null
  const hasLfaStats = (lfa?.stats.length ?? 0) > 0

  return (
    <div className="min-h-[80vh]" style={{ background: "var(--wc-paper)" }}>
      {/* 스코어를 밴드로 — 페이지 선언 (2026-08-18 리디자인 1단계) */}
      <MatchHeader match={match} finished={finished} homeScore={homeScore} awayScore={awayScore} />

      <main className="mx-auto max-w-[720px] px-0 pt-6 pb-16 sm:px-6">
        {/* 종이 1장 — 흰 상자를 여러 개 겹치지 않고 한 장 위에 괘선으로 단을 나눈다.
            모바일에서는 풀블리드(라운드·좌우 테두리 없음)로 글 폭을 10% 넓힌다. */}
        <div
          className="px-4 py-6 sm:rounded-2xl sm:px-6 sm:py-7"
          style={{
            background: "var(--wc-card)",
            border: "1px solid var(--wc-line)",
            borderLeftWidth: 0,
            borderRightWidth: 0,
            boxShadow: "0 1px 2px rgba(24,18,21,.05)",
          }}
        >
          <MatchTabs
            initial={finished ? "stats" : "info"}
            info={
              lfa ? (
                <Suspense fallback={null}>
                  <MatchInfoSection
                    matchId={lfa.matchId}
                    homeTeam={match.homeTeam}
                    awayTeam={match.awayTeam}
                  />
                </Suspense>
              ) : null
            }
            lineup={
              <section>
                <MatchLineup
                  gameId={match.gameId}
                  matchTime={match.matchTime}
                  alwaysOpen
                  withPitch
                />
                <p className="mt-2 text-[11.5px]" style={{ color: "var(--wc-mute-2)" }}>
                  라인업은 킥오프 약 1시간 전 발표되며, 일부 경기는 제공되지 않을 수 있습니다.
                </p>
              </section>
            }
            stats={
              finished && lfa ? (
                <MatchStatsSection info={lfa} homeTeam={match.homeTeam} awayTeam={match.awayTeam} />
              ) : null
            }
            report={
              /* 첫 생성이 LLM 파이프라인이라 수십 초 — Suspense 로 분리 */
              finished && isMatchExtrasLeague(match.leagueCode) ? (
                <Suspense fallback={null}>
                  <MatchExtrasSection
                    gameId={match.gameId}
                    homeTeam={match.homeTeam}
                    awayTeam={match.awayTeam}
                    withStats={!hasLfaStats}
                  />
                </Suspense>
              ) : null
            }
          />
        </div>
      </main>
    </div>
  )
}

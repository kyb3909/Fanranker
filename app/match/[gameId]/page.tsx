import type { Metadata } from "next"
import { Suspense } from "react"
import { notFound } from "next/navigation"

import { after } from "next/server"
import Link from "@/components/ui/app-link"
import { BridgeRow } from "@/components/bridge-row"

import { getMatchByGameId } from "@/lib/match/get-match"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { isMatchExtrasLeague } from "@/lib/match/leagues"
import { getLfaMatchInfo } from "@/lib/lfa/match"
import { getMatchExtras, hasStoredReport } from "@/lib/soccerway/match-extras"
import { MatchHeader } from "./match-header"
import { LiveRefresher } from "./live-refresher"
import { MatchExtrasSection } from "./match-extras-section"
import { MatchStatsSection } from "./match-stats-section"
import { MatchInfoSection } from "./match-info-section"
import { MatchTabs } from "./match-tabs"
import { MatchLineup } from "@/components/match/match-lineup"
import { MatchMiniStandings } from "@/components/match/mini-standings"
import { MatchdayRail } from "@/components/match/matchday-rail"
import { getMatchLineup } from "@/lib/match/get-lineup"
import { enrichLineupWithTimeline } from "@/lib/match/enrich-lineup"
import { displayTeamName, loadTeamShortMap } from "@/lib/match/team-display"

/**
 * 매치 페이지 — `/match/[gameId]` (2026-08-16, 1차)
 *
 * "새벽 라리가 경기 어떻게 됐지?"에 답하는 경기별 고유 URL. 홈 밴드의 LIVE/FT 행과
 * lineup-preview 가 여기로 링크한다.
 *
 * 범위(운영자 확정): 유럽 대항전(UCL/UEL/UECL/U슈퍼컵) + 5대 리그 + 그 컵대회만
 * (lib/match/leagues.ts). 목록 밖 리그·타 종목은 404.
 *
 * 1차 구성: 스코어 헤더 + 선발 라인업. ~~라이브 스코어는 제공하지 않는다~~ →
 * **2026-08-20 폐기**: LFA 피드가 라이브(분·스코어·실시간 스탯)를 준다는 것을 실측
 * 확인, 진행 중엔 라이브 매치센터로 동작한다 (LiveRefresher 60초 갱신). 8/16 결정은
 * wisetoto 기준이었다. 리포트는 여전히 **FT 후 + MATCH_EXTRAS_LEAGUES 한정**.
 * 과거 아카이브는 실록 단계 3~4(fixtures 영속화)에서 — 여기는 betman_games 읽기
 * 전용이라 24h 지난 경기의 라인업은 비고 스코어만 남는다.
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
  const title = `${m.homeTeam}${score}${m.awayTeam}`
  const description = `${m.leagueCode} — ${m.homeTeam} vs ${m.awayTeam} 경기 정보·스코어·선발 라인업`
  return {
    title,
    description,
    alternates: { canonical: `/match/${m.gameId}` },
    // ⚠️ page 의 title 은 og:title 로 자동 전파되지 않는다 — 루트 layout 의 openGraph 가
    //    이겨서 카톡·디스코드에 붙는 카드가 전부 사이트 기본 문구였다 (2026-08-20 PM 실측).
    //    스코어가 og:title 에 실려야 경기 링크 공유가 정보가 된다.
    openGraph: { title, description },
    twitter: { title, description },
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
  // 라이브 (2026-08-20 운영자: "경기 중엔 실시간 스탯과 점수가 보여야 매치센터지") —
  // LFA 라이브 스코어·분·스탯을 그대로 낸다. 갱신은 LiveRefresher(60초 router.refresh).
  const live = !finished && lfa?.live === true
  // 라이브 중 스코어는 LFA 가 정본 — betman 은 종료 후에나 채워진다
  const homeScore = live ? (lfa?.homeScore ?? null) : (match.homeScore ?? lfa?.homeScore ?? null)
  const awayScore = live ? (lfa?.awayScore ?? null) : (match.awayScore ?? lfa?.awayScore ?? null)
  const hasLfaStats = (lfa?.stats.length ?? 0) > 0

  // 지면 표기는 사전 통칭 — 원문(match.homeTeam)은 LFA·soccerway 해석 키라 그대로 둔다
  const shortNames = await loadTeamShortMap()
  const homeLabel = displayTeamName(match.homeTeam, shortNames)
  const awayLabel = displayTeamName(match.awayTeam, shortNames)

  // "리포트" 탭은 **저장분이 있을 때만** 만든다 (2026-08-19 패널 — 빈 탭 데드엔드).
  // 없으면 탭 대신 응답 후 백그라운드로 생성을 걸어 둔다(after) — 다음 방문자부터 보인다.
  // 예외: LFA 스탯이 없는 경기는 이 섹션이 soccerway 스탯 폴백을 겸하므로 탭을 유지한다.
  // 라인업 서버 선적재 (2026-08-20 운영자: "라인업이 너무 느리다") — 종전엔 클라이언트가
  // API 왕복으로만 받아 탭이 몇 초 비었다. 저장분·캐시가 있어 서버에서는 대체로 즉답이다.
  const lineupRaw = await getMatchLineup(match.gameId).catch(() => null)
  // 저장 라인업은 킥오프 스냅샷이라 인시던트가 없다 — LFA 타임라인을 입힌다
  // (2026-08-20 운영자: "교체가 전혀 표기가 안 된다")
  const lineupInitial =
    lineupRaw && lfa?.timeline.length
      ? enrichLineupWithTimeline(lineupRaw, lfa.timeline)
      : lineupRaw

  const extrasLeague = finished && isMatchExtrasLeague(match.leagueCode)
  const storedReport = extrasLeague ? await hasStoredReport(match.gameId) : false
  if (extrasLeague && !storedReport) {
    after(() => getMatchExtras(match.gameId).catch(() => {}))
  }

  // 불판 — 이 경기의 라이브 스레드 게시물 (크론이 라인업 발표 시 생성, lib/match/thread.ts).
  // ⚠️ betman 은 같은 경기를 마켓별 중복 행으로 갖는다 — 불판은 그중 한 행에 걸리므로
  //    같은 (팀, 킥오프)의 **모든 행 id** 로 찾는다. 아니면 어느 행으로 들어왔느냐에
  //    따라 배너가 있다 없다 한다 (2026-08-20 실측).
  const admin = createServiceRoleClient()
  const { data: dupRows } = await admin
    .from("betman_games")
    .select("id")
    .eq("home_team_name", match.homeTeam)
    .eq("away_team_name", match.awayTeam)
    .eq("match_time", match.matchTime)
  const gameIds = [...new Set([match.gameId, ...(dupRows ?? []).map((r) => String(r.id))])]
  const { data: threadRows } = await admin
    .from("posts")
    .select("id, comment_count")
    .in("match_game_id", gameIds)
    .is("deleted_at", null)
    .limit(1)
  const thread = threadRows?.[0] ?? null

  return (
    <div className="min-h-[80vh]" style={{ background: "var(--wc-paper)" }}>
      {/* 스코어를 밴드로 — 페이지 선언 (2026-08-18 리디자인 1단계) */}
      <MatchHeader
        match={match}
        finished={finished}
        homeScore={homeScore}
        awayScore={awayScore}
        homeLabel={homeLabel}
        awayLabel={awayLabel}
        live={live}
        minute={lfa?.minute ?? null}
      />
      {/* 진행 중에만 마운트 — FT 로 다시 그려지면 스스로 빠진다 */}
      {live && <LiveRefresher />}

      {/* 불판 참여 — 경기를 보는 사람을 댓글 판으로 (2026-08-20). 불판이 있을 때만 */}
      {thread && (
        <div className="mx-auto max-w-[1080px] px-4 pt-4 sm:px-6">
          <Link
            href={`/post/${thread.id}?utm_source=matchcenter`}
            className="flex items-baseline justify-between rounded-xl px-4 py-3 no-underline transition-colors hover:bg-[var(--wc-tint)]"
            style={{ background: "var(--wc-wine-tint)", border: "1px solid var(--wc-line)" }}
          >
            <span className="text-[13.5px] font-bold" style={{ color: "var(--wc-ink)" }}>
              이 경기 불판에서 같이 봐요
            </span>
            <span className="text-[12.5px] font-bold" style={{ color: "var(--wc-burgundy)" }}>
              {thread.comment_count > 0 ? `댓글 ${thread.comment_count} · ` : ""}참여 →
            </span>
          </Link>
        </div>
      )}

      {/* 데스크톱 2단: 본문 720(현행 그대로) + 우측 레일 (2026-08-20 시안 승인 —
          "좌우가 너무 비어 있다"). 레일은 lg 이상에서만 — 모바일 무변화. */}
      <main className="mx-auto max-w-[1080px] px-0 pt-6 pb-16 sm:px-6 lg:grid lg:grid-cols-[minmax(0,720px)_minmax(280px,1fr)] lg:items-start lg:gap-6">
        <div className="min-w-0">
          {/* 승부예측 도선 (2026-08-19 패널 만장일치 1순위) — 예정 경기를 보는 유저는
            픽 직전 유저인데 종전엔 매치센터↔예측이 양방향 0링크였다. 목적지는 /season
            (예측이 이벤트 전용이라 규칙·참가가 있는 허브부터 — GNB 와 같은 판단).
            베팅/픽 카드 다크 금지 규칙에 따라 라이트 틴트로. */}
          {!finished && (
            <div className="px-4 pb-4 sm:px-0 lg:hidden">
              <Link
                href="/season?ref=match"
                className="flex items-baseline justify-between rounded-xl px-4 py-3 no-underline transition-colors hover:bg-[var(--wc-tint)]"
                style={{ background: "var(--wc-wine-tint)", border: "1px solid var(--wc-line)" }}
              >
                <span className="text-[13.5px] font-bold" style={{ color: "var(--wc-ink)" }}>
                  이 경기, 승부예측으로
                </span>
                <span className="text-[12.5px] font-bold" style={{ color: "var(--wc-burgundy)" }}>
                  시즌 이벤트 픽 남기기 →
                </span>
              </Link>
            </div>
          )}
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
              /* 종료인데 스탯이 없으면 "정보"(경기 전 정보)로 떨어지지 않게 라인업으로 —
               결장·부상을 종료 경기의 첫 화면으로 보여주는 것은 오답이다 (2026-08-19 UIUX).
               라이브도 같은 규칙 — 경기 중의 첫 화면은 실시간 스탯이다 (2026-08-20) */
              initial={finished || live ? (hasLfaStats ? "stats" : "lineup") : "info"}
              info={
                lfa ? (
                  <>
                    <Suspense fallback={null}>
                      <MatchInfoSection
                        matchId={lfa.matchId}
                        homeTeam={match.homeTeam}
                        awayTeam={match.awayTeam}
                        homeLabel={homeLabel}
                        awayLabel={awayLabel}
                      />
                    </Suspense>
                    {/* 미니 순위표 — "이 결과로 몇 위" (2026-08-19 팬 A8). 대조는 원문 팀명.
                      데스크톱은 레일에 상시 노출되므로 탭 안 것은 모바일 전용 */}
                    <div className="lg:hidden">
                      <Suspense fallback={null}>
                        <MatchMiniStandings
                          leagueCode={match.leagueCode}
                          homeTeam={match.homeTeam}
                          awayTeam={match.awayTeam}
                        />
                      </Suspense>
                    </div>
                  </>
                ) : null
              }
              lineup={
                <section>
                  <MatchLineup
                    gameId={match.gameId}
                    matchTime={match.matchTime}
                    initial={lineupInitial}
                    alwaysOpen
                    withPitch
                  />
                  {/* 대기 블록(match-lineup 내부)이 같은 안내를 하므로 ready 일 때만 각주 */}
                  {lineupInitial?.status === "ready" && (
                    <p className="mt-2 text-[11.5px]" style={{ color: "var(--wc-mute-2)" }}>
                      일부 경기는 라인업이 제공되지 않을 수 있습니다.
                    </p>
                  )}
                </section>
              }
              stats={
                (finished || live) && lfa ? (
                  <MatchStatsSection info={lfa} homeTeam={homeLabel} awayTeam={awayLabel} />
                ) : null
              }
              report={
                /* 저장 리포트가 있거나, LFA 스탯이 없어 soccerway 스탯 폴백이 필요한 경우만.
                 그 외에는 탭 자체를 만들지 않는다 — 빈 패널 데드엔드 방지 (2026-08-19). */
                extrasLeague && (storedReport || !hasLfaStats) ? (
                  <Suspense fallback={null}>
                    <MatchExtrasSection
                      gameId={match.gameId}
                      homeTeam={homeLabel}
                      awayTeam={awayLabel}
                      withStats={!hasLfaStats}
                    />
                  </Suspense>
                ) : null
              }
            />
          </div>

          {/* 지면 종단 도선 (2026-08-20 UX 패널 — 모바일 매치센터 하단이 데드엔드였다).
              lg 는 우측 레일이 같은 역할이라 모바일만 */}
          <div className="mt-4 px-4 sm:px-0 lg:hidden">
            <BridgeRow href="/matches" title="오늘 다른 경기 보기" action="경기 일정 →" />
          </div>
        </div>

        {/* ── 우측 레일 (lg 전용) — 빈 여백을 장식이 아니라 정보로 채운다 ── */}
        <aside className="hidden lg:flex lg:flex-col lg:gap-4">
          <Suspense fallback={null}>
            <MatchdayRail
              currentGameId={match.gameId}
              matchTime={match.matchTime}
              leagueCode={match.leagueCode}
              shortNames={shortNames}
            />
          </Suspense>
          <Suspense fallback={null}>
            <MatchMiniStandings
              variant="rail"
              leagueCode={match.leagueCode}
              homeTeam={match.homeTeam}
              awayTeam={match.awayTeam}
            />
          </Suspense>
          <Link
            href="/season?ref=match"
            className="flex items-baseline justify-between rounded-2xl px-4 py-3 no-underline transition-colors hover:bg-[var(--wc-tint)]"
            style={{ background: "var(--wc-wine-tint)", border: "1px solid var(--wc-line)" }}
          >
            <span className="text-[13px] font-bold" style={{ color: "var(--wc-ink)" }}>
              승부예측으로
            </span>
            <span className="text-[12px] font-bold" style={{ color: "var(--wc-burgundy)" }}>
              시즌 이벤트 픽 남기기 →
            </span>
          </Link>
        </aside>
      </main>
    </div>
  )
}

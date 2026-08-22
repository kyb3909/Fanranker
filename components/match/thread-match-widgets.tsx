import { ThreadScoreStrip } from "@/components/match/thread-score-strip"
import { CollapsibleSection } from "@/components/match/collapsible-section"
import { MatchStatsSection } from "@/app/match/[gameId]/match-stats-section"
import { MatchLineup } from "@/components/match/match-lineup"
import { getMatchByGameId } from "@/lib/match/get-match"
import { getLfaMatchInfo } from "@/lib/lfa/match"
import { getMatchLineup } from "@/lib/match/get-lineup"
import { enrichLineupWithTimeline } from "@/lib/match/enrich-lineup"
import { displayTeamName, loadTeamShortMap } from "@/lib/match/team-display"

/**
 * 불판 중계 위젯 묶음 (2026-08-20 운영자: "스탯이나 이런 게 경기 중계 위젯이잖아 —
 * 불판에 다 박아넣고 일정에서 누르면 불판으로").
 *
 * 게시물 카드 안, 제목 아래: [전광판(다크)] → [경기 스탯 · 접힘] → [선발 라인업 · 접힘].
 * 접힘이 기본 — 불판의 주인공은 댓글판이다. 매치센터는 예정 경기 정보·리포트의
 * 폴백으로 남고, 전광판의 "매치센터 →" 링크가 그 문이다.
 *
 * 데이터는 전부 매치센터와 같은 캐시(getLfaMatchInfo 60초/6시간, 라인업 저장분) —
 * ThreadScoreStrip 이 내부에서 또 부르지만 unstable_cache 가 흡수해 추가 호출 0.
 */
export async function ThreadMatchWidgets({ gameId }: { gameId: string }) {
  const match = await getMatchByGameId(gameId).catch(() => null)
  if (!match) return null

  const [lfa, lineupRaw, shortNames] = await Promise.all([
    getLfaMatchInfo({
      gameId: match.gameId,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      matchTime: match.matchTime,
      leagueCode: match.leagueCode,
    }).catch(() => null),
    getMatchLineup(match.gameId).catch(() => null),
    loadTeamShortMap(),
  ])

  const lineup =
    lineupRaw && lfa?.timeline.length
      ? enrichLineupWithTimeline(lineupRaw, lfa.timeline)
      : lineupRaw

  return (
    <div className="space-y-3">
      <ThreadScoreStrip gameId={gameId} />
      {lfa && lfa.stats.length > 0 && (
        <CollapsibleSection title="경기 스탯">
          <MatchStatsSection
            info={lfa}
            homeTeam={displayTeamName(match.homeTeam, shortNames)}
            awayTeam={displayTeamName(match.awayTeam, shortNames)}
            hideTimeline
          />
        </CollapsibleSection>
      )}
      {lineup?.status === "ready" && (
        <MatchLineup gameId={match.gameId} matchTime={match.matchTime} initial={lineup} withPitch />
      )}
    </div>
  )
}

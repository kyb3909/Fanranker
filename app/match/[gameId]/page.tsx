import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getMatchByGameId } from "@/lib/match/get-match"
import { MatchHeader } from "./match-header"
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
 * 1차 구성: 스코어 헤더(LIVE 면 60초 갱신) + 선발 라인업(soccerway, FT 후 24h까지).
 * 리포트·통계·과거 아카이브는 실록 단계 3~4(fixtures 영속화)에서 — 여기는 betman_games
 * 읽기 전용이라 24h 지난 경기의 라인업은 비고 스코어만 남는다.
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

  return (
    <div className="worldcup-scope min-h-[80vh]">
      <main className="mx-auto max-w-[720px] px-4 py-6 sm:px-6">
        <MatchHeader initial={match} />

        {/* 선발 라인업 — 매핑·발표 없으면 스스로 숨는다 (fail-open) */}
        <section
          className="mt-4 rounded-xl px-4 py-3.5"
          style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
        >
          {/* 섹션 제목은 컴포넌트의 토글이 겸한다 — 같은 문구가 두 번 보이던 중복 제거 */}
          <MatchLineup gameId={match.gameId} matchTime={match.matchTime} defaultOpen />
          <p className="mt-2 text-[11.5px]" style={{ color: "var(--wc-mute)" }}>
            라인업은 킥오프 약 1시간 전 발표되며, 일부 경기는 제공되지 않을 수 있습니다.
          </p>
        </section>
      </main>
    </div>
  )
}

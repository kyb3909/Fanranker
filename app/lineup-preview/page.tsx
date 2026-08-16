import { Suspense } from "react"
import type { Metadata } from "next"
import { getGamesPayloadForSsr } from "@/lib/betman/games-payload"
import { LineupPreviewClient, type PreviewMatch } from "./lineup-preview-client"
import type { GroupedMatch } from "@/types/betting"

/**
 * 라인업 검증 프리뷰 — `/lineup-preview` (미공개, 2026-08-16)
 *
 * 운영자: "바로 덮어씌우지 말고 미공개로 하나 페이지를." 경기 카드 배선은 검증이 끝날
 * 때까지 빼두고, 이 페이지에서만 라인업을 본다. GNB 미노출 — 직접 URL 접근.
 *
 * 카드와 달리 **상태를 숨기지 않는다** — 검증 페이지라 none/pending 사유가 보여야
 * "안 뜨는 게 정상인지 고장인지"를 가릴 수 있다. 실사용 배선 복원 시에는 원래의
 * fail-open(조용함)으로 돌아간다.
 */
export const revalidate = 60

export const metadata: Metadata = {
  title: "라인업 프리뷰",
  robots: { index: false, follow: false },
}

export default async function LineupPreviewPage() {
  const payload = await getGamesPayloadForSsr().catch(() => null)
  const groups = (payload?.groupedGames ?? []) as unknown as GroupedMatch[]

  // 예정(scheduled) + 진행 중 + 당일 종료를 병합 — 종전엔 서버 status 필터 때문에
  // 킥오프한 경기가 목록에서 빠져 검증 창(+180분)을 다 못 봤다 (2026-08-16 수정).
  const byKey = new Map<string, PreviewMatch>()
  for (const g of groups) {
    if (g.sport !== "축구" || !g.games[0]?.id) continue
    byKey.set(g.matchKey, {
      gameId: String(g.games[0].id),
      leagueCode: g.leagueCode,
      homeTeam: g.homeTeam,
      awayTeam: g.awayTeam,
      matchTime: g.matchTime,
      phase: "scheduled",
    })
  }
  for (const m of [...(payload?.liveMatches ?? []), ...(payload?.finishedMatches ?? [])]) {
    byKey.set(m.matchKey, {
      gameId: m.gameId,
      leagueCode: m.leagueCode,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      matchTime: m.matchTime,
      phase: m.status === "in_progress" ? "live" : "finished",
      score: m.homeScore != null && m.awayScore != null ? `${m.homeScore}:${m.awayScore}` : null,
    })
  }
  const matches = [...byKey.values()].sort((a, b) => a.matchTime.localeCompare(b.matchTime))

  return (
    <Suspense>
      <LineupPreviewClient matches={matches} />
    </Suspense>
  )
}

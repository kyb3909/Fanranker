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

  // 오늘 윈도우의 축구 경기 전부 — 시작 여부 무관 (검증 페이지라 창 밖도 목록엔 보인다)
  const matches: PreviewMatch[] = groups
    .filter((g) => g.sport === "축구" && g.games[0]?.id)
    .map((g) => ({
      gameId: String(g.games[0].id),
      leagueCode: g.leagueCode,
      homeTeam: g.homeTeam,
      awayTeam: g.awayTeam,
      matchTime: g.matchTime,
    }))
    .sort((a, b) => a.matchTime.localeCompare(b.matchTime))

  return (
    <Suspense>
      <LineupPreviewClient matches={matches} />
    </Suspense>
  )
}

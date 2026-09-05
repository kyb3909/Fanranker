import { notFound } from "next/navigation"
import { MatchLineup } from "@/components/match/match-lineup"
import { MatchStatComparison } from "@/components/match/match-stat-comparison"
import { previewLineup, previewStats } from "./fixtures"

export default function MatchPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound()
  return (
    <main className="worldcup-scope mx-auto max-w-4xl space-y-8 px-4 py-8">
      <p className="text-[13px]" style={{ color: "var(--wc-mute)" }}>
        UI 미리보기 · 가상 데이터 · 실제 경기와 무관
      </p>
      <MatchLineup
        gameId="ui-preview"
        matchTime={previewLineup.kickoff}
        initial={previewLineup}
        alwaysOpen
      />
      <MatchStatComparison
        stats={previewStats}
        homeTeam={previewLineup.home.teamLabel}
        awayTeam={previewLineup.away.teamLabel}
      />
    </main>
  )
}

import { getStoredMatchReport } from "@/lib/match/stored-report"

/** Stored article only. All new scores, stats and lineups come from paid LFA. */
export async function MatchExtrasSection({ gameId }: { gameId: string }) {
  const report = await getStoredMatchReport(gameId).catch(() => null)
  if (!report) return null
  return (
    <section className="mt-8">
      <h2 className="sheet-lab">경기 리포트</h2>
      <h3
        className="mt-1.5 text-[16px] leading-snug"
        style={{
          fontFamily: "var(--font-display-ko), var(--font-title)",
          fontWeight: 700,
          color: "var(--wc-ink)",
          letterSpacing: "-0.02em",
          wordBreak: "keep-all",
        }}
      >
        {report.title}
      </h3>
      <div className="mt-2.5 space-y-2.5">
        {report.paragraphs.map((p, i) => (
          <p
            key={i}
            className="text-[13px] leading-relaxed"
            style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
          >
            {p}
          </p>
        ))}
      </div>
    </section>
  )
}

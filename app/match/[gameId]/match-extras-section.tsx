import { getMatchExtras } from "@/lib/soccerway/match-extras"

/**
 * 경기 리포트 + (폴백) 기초 스탯 — 서버 컴포넌트, fail-open.
 * 데이터가 없으면 스스로 사라진다 — 스켈레톤·에러 문구 금지 (라인업과 같은 계약).
 *
 * 스탯은 live-football-api 쪽이 더 풍부해서 그쪽이 있으면 여기선 안 그린다
 * (`withStats={false}`). soccerway 스탯은 LFA 해석 실패 시의 폴백으로만 남는다.
 * 리포트(한국어 서사)는 여전히 이 경로가 유일하다.
 */
export async function MatchExtrasSection({
  gameId,
  homeTeam,
  awayTeam,
  withStats = true,
}: {
  gameId: string
  homeTeam: string
  awayTeam: string
  withStats?: boolean
}) {
  const { stats: rawStats, report } = await getMatchExtras(gameId).catch(() => ({
    stats: null,
    report: null,
  }))
  const stats = withStats ? rawStats : null
  if (!stats && !report) return null

  return (
    <>
      {stats && (
        <section>
          <h2 className="sheet-lab">경기 스탯</h2>
          <div
            className="mt-1 flex items-baseline justify-between text-[11.5px] font-bold"
            style={{ color: "var(--wc-mute)" }}
          >
            <span className="truncate">{homeTeam}</span>
            <span className="truncate">{awayTeam}</span>
          </div>
          <ul className="mt-2 space-y-2.5">
            {stats.map((s) => {
              const total = s.homeNum != null && s.awayNum != null ? s.homeNum + s.awayNum : null
              const homePct = total && total > 0 ? (s.homeNum! / total) * 100 : 50
              return (
                <li key={s.label}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className="gn-num text-[14px] font-bold"
                      style={{ color: "var(--wc-ink)" }}
                    >
                      {s.home}
                    </span>
                    <span className="text-[11.5px] font-bold" style={{ color: "var(--wc-mute)" }}>
                      {s.label}
                    </span>
                    <span
                      className="gn-num text-[14px] font-bold"
                      style={{ color: "var(--wc-ink)" }}
                    >
                      {s.away}
                    </span>
                  </div>
                  <div
                    aria-hidden
                    className="mt-1 flex h-[5px] gap-[3px] overflow-hidden rounded-full"
                  >
                    <span
                      style={{
                        width: `${homePct}%`,
                        background: "var(--wc-burgundy)",
                        borderRadius: 99,
                      }}
                    />
                    <span
                      className="flex-1"
                      style={{ background: "var(--wc-line-2)", borderRadius: 99 }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {report && (
        <section className="mt-8">
          <h2 className="sheet-lab">경기 리포트</h2>
          <h3
            className="mt-1.5 text-[16.5px] leading-snug"
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
                className="text-[13.5px] leading-relaxed"
                style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
              >
                {p}
              </p>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

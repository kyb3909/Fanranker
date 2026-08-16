import { getMatchExtras } from "@/lib/soccerway/match-extras"

/**
 * 기초 스탯 + 경기 리포트 (2026-08-16) — 서버 컴포넌트, fail-open.
 * 데이터가 없으면 스스로 사라진다 — 스켈레톤·에러 문구 금지 (라인업과 같은 계약).
 */
export async function MatchExtrasSection({
  gameId,
  homeTeam,
  awayTeam,
}: {
  gameId: string
  homeTeam: string
  awayTeam: string
}) {
  const { stats, report } = await getMatchExtras(gameId).catch(() => ({
    stats: null,
    report: null,
  }))
  if (!stats && !report) return null

  return (
    <>
      {stats && (
        <section
          className="mt-4 rounded-xl px-4 py-3.5"
          style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
        >
          <h2 className="text-[13px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
            경기 스탯
          </h2>
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
        <section
          className="mt-4 rounded-xl px-4 py-4"
          style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
        >
          <h2
            className="text-[12px] font-extrabold"
            style={{ color: "var(--wc-burgundy)", letterSpacing: "0.06em" }}
          >
            경기 리포트
          </h2>
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
          <p className="mt-3 text-[11px]" style={{ color: "var(--wc-mute-2)" }}>
            외신 경기 리포트를 요약 재구성한 내용입니다.
          </p>
        </section>
      )}
    </>
  )
}

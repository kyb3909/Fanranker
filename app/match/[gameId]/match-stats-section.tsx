import type { LfaMatchInfo } from "@/lib/lfa/match"

/**
 * 득점 요약 + 경기 스탯 (2026-08-17).
 *
 * live-football-api 의 구조화된 데이터라 LLM 추출 단계가 없다 — 환각이 원천적으로 없고
 * betman 종료 반영(1~1.5시간 지연)을 기다리지 않는다. 지표 한글화·숫자 정규화는
 * lib/lfa/match.ts 가 끝낸 상태로 온다 (뜻이 불확실한 지표는 거기서 버려진다).
 */
export function MatchStatsSection({
  info,
  homeTeam,
  awayTeam,
}: {
  info: LfaMatchInfo
  homeTeam: string
  awayTeam: string
}) {
  // 득점과 퇴장을 한 줄기 시간순으로 — 퇴장이 몇 분에 나왔는지가 경기 해석의 핵심이다
  const timeline = [
    ...info.goals.map((g) => ({ ...g, kind: "goal" as const })),
    ...info.reds.map((r) => ({ ...r, score: "", kind: "red" as const })),
  ].sort((a, b) => (Number(a.minute) || 0) - (Number(b.minute) || 0))
  const hasStats = info.stats.length > 0
  if (timeline.length === 0 && !hasStats) return null

  return (
    <>
      {timeline.length > 0 && (
        <section
          className="mt-4 rounded-xl px-4 py-3.5"
          style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
        >
          <h2 className="text-[13px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
            주요 기록
          </h2>
          <ul className="mt-2 space-y-1.5">
            {timeline.map((e, i) => (
              <li key={i} className="flex items-baseline gap-2 text-[13.5px]">
                <span
                  className="gn-num shrink-0 text-[12px] font-bold"
                  style={{
                    color: e.kind === "red" ? "var(--wc-mute-2)" : "var(--wc-burgundy)",
                    minWidth: 30,
                  }}
                >
                  {e.minute}&apos;
                </span>
                {e.kind === "red" && (
                  <span
                    aria-hidden
                    className="inline-block shrink-0 rounded-[2px]"
                    style={{ width: 9, height: 12, background: "#c2352f" }}
                  />
                )}
                <span className="font-bold" style={{ color: "var(--wc-ink)" }}>
                  {e.player}
                </span>
                <span className="text-[12px]" style={{ color: "var(--wc-mute)" }}>
                  {e.side === "home" ? homeTeam : awayTeam}
                  {e.kind === "red" ? " · 퇴장" : ""}
                </span>
                {e.score && (
                  <span
                    className="gn-num ml-auto text-[12.5px] font-bold"
                    style={{ color: "var(--wc-mute)" }}
                  >
                    {e.score}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasStats && (
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
            {info.stats.map((s) => {
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
    </>
  )
}

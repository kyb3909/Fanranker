"use client"

import useSWR from "swr"
import type { RaceRow, RaceStanding } from "@/lib/event/gunners-season"

const fetcher = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null))

/**
 * 내 레이스 현황 + 구너 랭킹 TOP 5 — 개인화 데이터라 클라이언트에서 가져온다
 * (서버 ISR 페이지에 내 순위를 심으면 캐시로 다른 유저에게 샌다).
 */
export function RaceStandingPanel() {
  const { data } = useSWR<RaceStanding & { event: { live: boolean } }>(
    "/api/event/gunners-season/standing",
    fetcher,
    { revalidateOnFocus: false }
  )

  const cardStyle = {
    background: "var(--wc-card)",
    border: "1px solid var(--wc-line)",
    boxShadow: "var(--wc-shadow-1)",
  } as const

  const winRate = (r: RaceRow) => (r.slips > 0 ? Math.round((r.won / r.slips) * 100) : 0)

  return (
    <>
      <section className="rounded-xl p-4" style={cardStyle}>
        <h2 className="text-[15px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
          내 레이스 현황
        </h2>
        {data?.me ? (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[20px] font-extrabold" style={{ color: "var(--wc-burgundy)" }}>
                {data.me.rank}위
              </p>
              <p className="text-[11px]" style={{ color: "var(--wc-mute)" }}>
                / {data.participants}명
              </p>
            </div>
            <div>
              <p className="text-[20px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
                {data.me.points.toLocaleString()}P
              </p>
              <p className="text-[11px]" style={{ color: "var(--wc-mute)" }}>
                net 포인트
              </p>
            </div>
            <div>
              <p className="text-[20px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
                {winRate(data.me)}%
              </p>
              <p className="text-[11px]" style={{ color: "var(--wc-mute)" }}>
                적중률 ({data.me.won}/{data.me.slips})
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--wc-mute)" }}>
            기간 내 축구 예측 슬립이 곧 레이스 참가입니다 — 지금 픽 하나면 순위표에 올라가요.
          </p>
        )}
      </section>

      <section className="rounded-xl p-4" style={cardStyle}>
        <h2 className="text-[15px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
          🏆 구너 랭킹 TOP 5
        </h2>
        {data?.top?.length ? (
          <ul className="mt-3 space-y-1.5">
            {data.top.map((r, i) => (
              <li
                key={r.userId}
                className="flex items-center justify-between gap-2 rounded-lg px-3 py-2"
                style={
                  i === 0
                    ? { background: "color-mix(in srgb, var(--wc-gold) 22%, white)" }
                    : { background: "var(--wc-soft)" }
                }
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="w-5 shrink-0 text-center text-[13px] font-extrabold"
                    style={{ color: i === 0 ? "var(--wc-gold-deep)" : "var(--wc-mute)" }}
                  >
                    {i + 1}
                  </span>
                  <span
                    className="truncate text-[13.5px] font-bold"
                    style={{ color: "var(--wc-ink)" }}
                  >
                    {r.nickname}
                  </span>
                </span>
                <span
                  className="shrink-0 text-[13px] font-extrabold tabular-nums"
                  style={{ color: "var(--wc-ink-2)" }}
                >
                  {r.points.toLocaleString()}P
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13px]" style={{ color: "var(--wc-mute)" }}>
            아직 순위가 없어요 — 첫 주인공이 되어보세요.
          </p>
        )}
      </section>
    </>
  )
}

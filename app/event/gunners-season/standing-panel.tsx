"use client"

import useSWR from "swr"
import type { RaceRow, RaceStanding } from "@/lib/event/gunners-season"

const fetcher = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null))

/**
 * 내 레이스 현황 + 구너 랭킹 TOP 5 — 개인화 데이터라 클라이언트에서 가져온다
 * (서버 ISR 페이지에 내 순위를 심으면 캐시로 다른 유저에게 샌다).
 *
 * 2026-08-14 허브 통합: /season S2 레이스 허브가 ①내 순위 … ⑤TOP5 로 두 카드를
 * 떨어뜨려 배치하므로 컴포넌트를 둘로 분리했다. SWR 키가 같아 요청은 1회로 dedupe.
 */

type StandingResponse = RaceStanding & { event: { live: boolean } }

function useRaceStanding() {
  return useSWR<StandingResponse>("/api/event/gunners-season/standing", fetcher, {
    revalidateOnFocus: false,
  })
}

const cardStyle = {
  background: "var(--wc-card)",
  border: "1px solid var(--wc-line)",
  boxShadow: "var(--wc-shadow-1)",
} as const

/**
 * 적중률 분모는 **정산이 끝난 예측**만 쓴다. 대기·취소를 분모에 넣으면 점수는 그대로인데
 * 적중률만 떨어져 "왜 내 적중률이 내려갔냐"가 된다 (기획 검수 P1-7).
 * /season/results 요약도 같은 분모를 쓴다 — 두 화면 숫자가 갈리면 안 된다.
 */
const winRate = (r: RaceRow) => (r.settled > 0 ? Math.round((r.won / r.settled) * 100) : null)

/** ① 내 레이스 현황 — S2 허브 최상단 (재방문자가 3초 안에 자기 숫자를 찾는 카드) */
export function RaceMyPanel() {
  const { data } = useRaceStanding()

  return (
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
              점수
            </p>
          </div>
          <div>
            <p className="text-[20px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
              {winRate(data.me) === null ? "—" : `${winRate(data.me)}%`}
            </p>
            <p className="text-[11px]" style={{ color: "var(--wc-mute)" }}>
              적중률 ({data.me.won}/{data.me.settled})
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--wc-mute)" }}>
          순위를 불러오는 중입니다.
        </p>
      )}
    </section>
  )
}

/** ⑤ 구너 랭킹 TOP 5 — S2 허브 하단 (콘텐츠 섹션 뒤, 닉네임 리스트는 후순위) */
export function RaceTopPanel() {
  const { data } = useRaceStanding()

  return (
    <section className="rounded-xl p-4" style={cardStyle}>
      <h2 className="text-[15px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
        구너 순위 상위 5명
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
          아직 아무도 예측하지 않았습니다. 지금 예측하면 1위입니다.
        </p>
      )}
    </section>
  )
}

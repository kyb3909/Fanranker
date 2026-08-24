"use client"

import { useMemo, useState } from "react"
import { getAllPlayers, type Player, type Position } from "@/lib/draft/players"
import { POSITION_HEX } from "@/lib/draft/visual-helpers"
import type { PickStats } from "./use-pick-stats"

/**
 * 전체 선수 픽 랭킹 (2026-08-25 운영자: "전체 선수들 랭킹을 볼 수 있는 그런 게").
 *
 * 드래프트 안의 뱃지·결과 표는 "내가 만난 선수"만 보여준다 — 여기는 **풀 전체를
 * 픽 인기순으로** 세운 보드다. 시작 화면에 두는 이유: 판을 시작하기 전에
 * "요즘 다들 누굴 데려가나"를 보고 전략을 세우는 자리가 여기다.
 *
 * 데이터 우선순위는 게임 전체와 같은 규칙:
 * - 우리 판이 1판이라도 있으면 **우리 유저 픽 데이터** (막대 = 픽률)
 * - 아직 0판이면 FPL 전 세계 소유율로 폴백 — 빈 보드보다 낫다
 */
export function DraftRanking({ pickStats }: { pickStats: PickStats }) {
  const [pos, setPos] = useState<Position | "ALL">("ALL")
  const ours = pickStats.games > 0

  const rows = useMemo(() => {
    const all = getAllPlayers()
    if (all.length === 0) return []
    const filtered = pos === "ALL" ? all : all.filter((p) => p.position === pos)
    if (ours) {
      return filtered
        .map((p) => ({ p, stat: pickStats.byId[p.id] }))
        .filter((r) => r.stat)
        .sort(
          (a, b) =>
            b.stat!.picks - a.stat!.picks ||
            a.stat!.avgRound - b.stat!.avgRound ||
            b.p.price - a.p.price
        )
        .slice(0, 15)
        .map((r) => ({
          p: r.p,
          value: r.stat!.rate,
          valueLabel: `${r.stat!.rate.toFixed(0)}%`,
          sub: `평균 ${r.stat!.avgRound}R`,
        }))
    }
    return filtered
      .filter((p) => (p.owned ?? 0) > 0)
      .sort((a, b) => (b.owned ?? 0) - (a.owned ?? 0))
      .slice(0, 15)
      .map((p) => ({
        p,
        value: p.owned ?? 0,
        valueLabel: `${(p.owned ?? 0).toFixed(1)}%`,
        sub: `£${p.price.toFixed(1)}`,
      }))
  }, [pos, ours, pickStats])

  if (rows.length === 0) return null
  const max = Math.max(...rows.map((r) => r.value), 1)

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2">
        <h2 className="text-[16px] font-black" style={{ color: "var(--wc-ink)" }}>
          선수 픽 랭킹
        </h2>
        <span className="text-[11.5px]" style={{ color: "var(--wc-mute)" }}>
          {ours
            ? `유저 드래프트 ${pickStats.games}판 기준`
            : "FPL 전 세계 소유율 기준 (판이 쌓이면 유저 픽으로 바뀝니다)"}
        </span>
      </div>

      {/* 포지션 탭 */}
      <div className="mb-3 flex gap-1.5">
        {(["ALL", "GK", "DF", "MF", "FW"] as const).map((t) => {
          const on = pos === t
          return (
            <button
              key={t}
              onClick={() => setPos(t)}
              className="rounded-full px-3 py-1 text-[12px] font-bold transition-colors"
              style={
                on
                  ? { background: "var(--wc-ink)", color: "#fff" }
                  : {
                      background: "var(--wc-card)",
                      color: "var(--wc-mute)",
                      border: "1px solid var(--wc-line)",
                    }
              }
            >
              {t === "ALL" ? "전체" : t}
            </button>
          )
        })}
      </div>

      <div
        className="rounded-2xl"
        style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
      >
        {rows.map((r, i) => (
          <RankRow key={r.p.id} rank={i + 1} row={r} max={max} last={i === rows.length - 1} />
        ))}
      </div>
    </section>
  )
}

function RankRow({
  rank,
  row,
  max,
  last,
}: {
  rank: number
  row: { p: Player; value: number; valueLabel: string; sub: string }
  max: number
  last: boolean
}) {
  const { p } = row
  const top3 = rank <= 3
  return (
    <div
      className="flex items-center gap-3 px-4 py-[9px]"
      style={{ borderBottom: last ? "none" : "1px solid var(--wc-line)" }}
    >
      {/* 순위 — 1~3위만 버건디로 세운다 */}
      <span
        className="gn-num w-6 shrink-0 text-right text-[15px]"
        style={{
          fontWeight: 700,
          color: top3 ? "var(--wc-burgundy)" : "var(--wc-mute)",
        }}
      >
        {rank}
      </span>
      <span
        className="gn-num shrink-0"
        style={{
          width: 26,
          height: 20,
          borderRadius: 5,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: `${POSITION_HEX[p.position]}1a`,
          color: POSITION_HEX[p.position],
          fontWeight: 700,
          fontSize: 11,
        }}
      >
        {p.position}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[13.5px] font-bold" style={{ color: "var(--wc-ink)" }}>
            {p.nameKo}
          </span>
          <span className="shrink-0 text-[11px]" style={{ color: "var(--wc-mute)" }}>
            {p.teamKo}
          </span>
        </div>
        {/* 막대 — 뷰 안 최대값 기준 상대 길이 */}
        <div
          className="mt-1 h-[5px] overflow-hidden rounded-full"
          style={{ background: "var(--wc-soft)" }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${(row.value / max) * 100}%`,
              background: top3 ? "var(--wc-burgundy)" : "var(--wc-mute-2)",
            }}
          />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div
          className="gn-num text-[14px] leading-none"
          style={{ fontWeight: 700, color: top3 ? "var(--wc-burgundy)" : "var(--wc-ink)" }}
        >
          {row.valueLabel}
        </div>
        <div className="gn-num mt-0.5 text-[10.5px]" style={{ color: "var(--wc-mute)" }}>
          {row.sub}
        </div>
      </div>
    </div>
  )
}

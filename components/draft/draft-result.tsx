"use client"

import { POSITION_HEX } from "@/lib/draft/visual-helpers"
import { type DraftState, type Formation } from "@/lib/draft/engine"
import type { Player, Position } from "@/lib/draft/players"
import { PitchViz, mergeRosterIntoSlots } from "./pitch-viz"
import { PageBand, PageBandStat } from "@/components/page-band"

interface DraftResultProps {
  state: DraftState
  mySeat: number
  /** 도판에 손으로 놓은 배치 (슬롯 코드 → 선수). 비어 있으면 자동 배치로 채운다. */
  arrangement: Record<string, Player | null>
  onRestart: () => void
}

const POS_ORDER: Record<Position, number> = { GK: 0, DF: 1, MF: 2, FW: 3 }

/** 값이 없는 칸은 0 이 아니라 점(·)이다 — 0 으로 쓰면 "0점" 이라는 거짓말이 된다. */
const dot = (v: number | null | undefined, fmt: (n: number) => string) =>
  v == null || v === 0 ? "·" : fmt(v)

/** 합계는 **값이 있는 선수만** 모은다. 없으면 null → 그 칸이 점으로 눕는다. */
function sumOf(roster: Player[], key: "owned" | "points" | "epNext"): number | null {
  const vals = roster.map((p) => p[key]).filter((v): v is number => typeof v === "number" && v > 0)
  return vals.length === 0 ? null : vals.reduce((a, b) => a + b, 0)
}

/**
 * 소유율 막대 + 포지션 내 순위 (2026-08-25 운영자 요청: "얼마나 자주 영입되었는지를
 * 비주얼로, 그리고 미드필더 중·수비수 중 몇 번째인지도").
 *
 * 숫자만 있으면 68.8%와 3.2%가 같은 크기로 보인다 — 막대가 그 차이를 눈에 넣는다.
 * ⚠️ 막대 길이는 **소유율 원값**(0~100%)이다. 순위로 그리면 1위와 2위가 똑같이
 *    꽉 차 보여서 "홀란드 68.8% vs 주앙 페드루 64.7%" 같은 실제 격차가 사라진다.
 * ⚠️ 순위 분모는 포지션 총원이다 (GK 67 · DF 202 · MF 268 · FW 73). 미드는 268명이라
 *    "MF 14위"가 수비 14위보다 훨씬 어렵다 — 분모를 같이 적어야 읽힌다.
 * ⚠️ 이건 **FPL 전 세계 유저의 보유율**이지 우리 게임의 드래프트 기록이 아니다.
 *    "선택된 평균 순서"는 우리가 드래프트 결과를 저장해야 나온다 — 아직 미구현.
 */
function OwnedBar({ player }: { player: Player }) {
  const owned = player.owned ?? 0
  if (!owned) {
    return (
      <span className="draft-num text-[12px]" style={{ color: "var(--draft-line)" }}>
        ·
      </span>
    )
  }
  const rank = player.ownedRank ?? 0
  const total = player.posTotal ?? 0
  // 상위 10% 안이면 "이 포지션에서 인기 있는 선수" 로 읽어 강조한다
  const hot = rank > 0 && total > 0 && rank <= Math.max(3, total * 0.1)
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 124 }}>
      <div
        style={{
          position: "relative",
          flex: 1,
          height: 6,
          borderRadius: 999,
          background: "var(--draft-neutral)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${Math.min(100, owned)}%`,
            background: hot ? "var(--draft-burgundy)" : "var(--draft-ink-soft)",
            borderRadius: 999,
          }}
        />
      </div>
      <span
        className="draft-num"
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: hot ? "var(--draft-burgundy)" : "var(--draft-ink-soft)",
          minWidth: 40,
          textAlign: "right",
        }}
      >
        {owned.toFixed(1)}%
      </span>
      {rank > 0 && total > 0 && (
        <span
          className="draft-num"
          style={{ fontSize: 11, color: "var(--draft-mute)", whiteSpace: "nowrap", minWidth: 52 }}
        >
          {player.position} {rank}/{total}
        </span>
      )}
    </div>
  )
}

/**
 * 드래프트 결과 — **스쿼드 성적표**다 (2026-08-25 재작업 2차).
 *
 * 1차에서는 잔디를 크게 깔았는데, 화면의 주인공이 그림이 되고 선수 이름은 작아져
 * "누구를 뽑았나" 가 안 읽혔다 (운영자: "축구장 표만 크고 선수들이 너무 작다").
 * 이제 **스탯 표가 주인공**이고 잔디는 배치 확인용 조연이다.
 *
 * ⚠️ 시즌 초에는 총점·폼이 거의 비어 있다 (GW1 실측: 610명 중 295명만 값 있음).
 *    그래서 지금도 채워져 있는 **소유율**(481명)·**예상 점수**(516명)를 앞세우고,
 *    총점은 시즌이 갈수록 스스로 채워지게 뒀다. 값 없는 칸은 점으로 눕힌다.
 *    소유율은 시즌 초에 특히 좋은 지표다 — "내 픽이 대중적인가, 남들이 안 보는
 *    선수인가" 를 지금 당장 말해 준다.
 */
export function DraftResult({ state, mySeat, arrangement, onRestart }: DraftResultProps) {
  const me = state.participants.find((p) => p.seatIndex === mySeat)
  const myFormation = (me?.formation ?? "4-3-3") as Formation
  const myRoster = state.roster[mySeat] || []
  const mySpent = myRoster.reduce((s, p) => s + p.price, 0)
  const myLeft = state.budget[mySeat] ?? 0
  const slots = mergeRosterIntoSlots(arrangement, myRoster, myFormation)
  const star = myRoster.reduce<Player | null>((a, b) => (!a || b.price > a.price ? b : a), null)

  const ordered = [...myRoster].sort(
    (a, b) => POS_ORDER[a.position] - POS_ORDER[b.position] || b.price - a.price
  )

  const ownedSum = sumOf(myRoster, "owned")
  const ownedCount = myRoster.filter((p) => (p.owned ?? 0) > 0).length
  const avgOwned = ownedSum == null ? null : ownedSum / ownedCount
  const totalPoints = sumOf(myRoster, "points")
  const totalEp = sumOf(myRoster, "epNext")

  const rivals = state.participants
    .filter((p) => p.seatIndex !== mySeat)
    .map((p) => {
      const roster = state.roster[p.seatIndex] || []
      return {
        ...p,
        spent: roster.reduce((s, pl) => s + pl.price, 0),
        ep: sumOf(roster, "epNext"),
        star: roster.reduce<Player | null>((a, b) => (!a || b.price > a.price ? b : a), null),
      }
    })

  const summary = [
    { label: "총 지출", value: `£${mySpent.toFixed(1)}`, sub: `잔여 £${myLeft.toFixed(1)}` },
    {
      label: "평균 소유율",
      value: avgOwned == null ? "·" : `${avgOwned.toFixed(1)}%`,
      sub:
        avgOwned == null ? "집계 없음" : avgOwned >= 20 ? "대중적인 스쿼드" : "남들이 안 보는 픽",
    },
    {
      label: "예상 점수",
      value: totalEp == null ? "·" : totalEp.toFixed(0),
      sub: "다음 라운드 합계",
    },
  ]

  const cols: { head: string; get: (p: Player) => string }[] = [
    { head: "가격", get: (p) => `£${p.price.toFixed(1)}` },
    { head: "총점", get: (p) => dot(p.points, (n) => String(n)) },
    { head: "예상", get: (p) => dot(p.epNext, (n) => n.toFixed(1)) },
  ]

  const totals = [
    `£${mySpent.toFixed(1)}`,
    totalPoints == null ? "·" : String(totalPoints),
    totalEp == null ? "·" : totalEp.toFixed(1),
  ]

  const cell = {
    padding: "8px 12px",
    borderBottom: "1px solid var(--draft-line)",
    whiteSpace: "nowrap" as const,
  }
  const head = { ...cell, borderBottom: "2px solid var(--draft-ink)", fontSize: 10 }

  return (
    <div className="draft-scope" style={{ background: "var(--draft-paper)" }}>
      <PageBand
        kicker="Squad Complete"
        title={`${me?.name ?? "내"}의 스쿼드`}
        description={`${myFormation} · ${myRoster.length}명 완성 · 예산 £${state.initialBudget}`}
        aside={<PageBandStat value={`£${mySpent.toFixed(1)}`} label="Spent" />}
      />

      <div className="mx-auto max-w-[1000px] px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-7">
          {/* ── 주인공: 스쿼드 성적표 ── */}
          <div className="min-w-0 flex-1">
            <div className="mb-4 grid grid-cols-3 gap-3">
              {summary.map((m) => (
                <div key={m.label} className="draft-card p-3.5">
                  <div className="draft-eyebrow" style={{ fontSize: 10 }}>
                    {m.label}
                  </div>
                  <div
                    className="draft-num mt-1 leading-none"
                    style={{ fontSize: 26, fontWeight: 700, color: "var(--draft-ink)" }}
                  >
                    {m.value}
                  </div>
                  <div className="mt-1.5 text-[11px]" style={{ color: "var(--draft-mute)" }}>
                    {m.sub}
                  </div>
                </div>
              ))}
            </div>

            <div className="draft-card overflow-x-auto">
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                <thead>
                  <tr>
                    <th style={{ ...head, width: 42 }} />
                    {["선수", "팀"].map((h) => (
                      <th key={h} className="draft-eyebrow" style={{ ...head, textAlign: "left" }}>
                        {h}
                      </th>
                    ))}
                    <th
                      className="draft-eyebrow"
                      style={{ ...head, textAlign: "left", minWidth: 132 }}
                    >
                      인기 · 포지션 순위
                    </th>
                    {cols.map((c) => (
                      <th
                        key={c.head}
                        className="draft-eyebrow"
                        style={{ ...head, textAlign: "right" }}
                      >
                        {c.head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ordered.map((p) => (
                    <tr key={p.id}>
                      <td style={{ ...cell, paddingRight: 0 }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 26,
                            height: 20,
                            borderRadius: 5,
                            background: `${POSITION_HEX[p.position]}1a`,
                            color: POSITION_HEX[p.position],
                            fontFamily: "var(--font-cond), sans-serif",
                            fontWeight: 700,
                            fontSize: 11,
                          }}
                        >
                          {p.position}
                        </span>
                      </td>
                      <td
                        style={{
                          ...cell,
                          fontWeight: 700,
                          fontSize: 13.5,
                          color: "var(--draft-ink)",
                        }}
                      >
                        {p.nameKo}
                      </td>
                      <td style={{ ...cell, fontSize: 11.5, color: "var(--draft-mute)" }}>
                        {p.teamKo}
                      </td>
                      <td style={cell}>
                        <OwnedBar player={p} />
                      </td>
                      {cols.map((c) => {
                        const v = c.get(p)
                        return (
                          <td
                            key={c.head}
                            className="draft-num"
                            style={{
                              ...cell,
                              textAlign: "right",
                              fontSize: 13,
                              color: v === "·" ? "var(--draft-line)" : "var(--draft-ink-soft)",
                            }}
                          >
                            {v}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  <tr>
                    <td
                      colSpan={3}
                      style={{ padding: "10px 12px", fontSize: 11.5, fontWeight: 700 }}
                    >
                      합계
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span
                        className="draft-num text-[12px]"
                        style={{ color: "var(--draft-mute)" }}
                      >
                        평균 {avgOwned == null ? "·" : `${avgOwned.toFixed(1)}%`}
                      </span>
                    </td>
                    {totals.map((v, k) => (
                      <td
                        key={k}
                        className="draft-num"
                        style={{
                          padding: "10px 12px",
                          textAlign: "right",
                          fontSize: 14,
                          fontWeight: 700,
                          color: "var(--draft-ink)",
                        }}
                      >
                        {v}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ── 조연: 배치 확인 ── */}
          <div className="mx-auto w-full max-w-[300px] shrink-0 lg:mx-0">
            <div className="draft-eyebrow mb-2">배치 · {myFormation}</div>
            <PitchViz formation={myFormation} filled={slots} compact />
            {star && (
              <div
                className="mt-3 rounded-xl p-3"
                style={{
                  background: "var(--draft-burgundy-soft)",
                  border: "1px solid var(--draft-line)",
                }}
              >
                <div className="draft-eyebrow draft-eyebrow-burg" style={{ fontSize: 10 }}>
                  최고가 영입
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span style={{ fontWeight: 800, fontSize: 15, color: "var(--draft-burgundy)" }}>
                    {star.nameKo}
                  </span>
                  <span
                    className="draft-num ml-auto"
                    style={{ fontSize: 15, fontWeight: 700, color: "var(--draft-burgundy)" }}
                  >
                    £{star.price.toFixed(1)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── 상대 팀 — 비교용이라 압축 ── */}
        <div className="mt-10">
          <div
            className="draft-eyebrow pb-2"
            style={{ borderBottom: "2px solid var(--draft-ink)" }}
          >
            상대 팀 {rivals.length}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {rivals.map((r) => (
              <div key={r.seatIndex} className="draft-card p-4">
                <div className="flex items-baseline gap-2">
                  <span style={{ fontWeight: 800, fontSize: 15, color: "var(--draft-ink)" }}>
                    {r.name}
                  </span>
                  <span className="draft-num text-[11px]" style={{ color: "var(--draft-mute)" }}>
                    {r.formation}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-3">
                  <span
                    className="draft-num leading-none"
                    style={{ fontSize: 22, fontWeight: 700, color: "var(--draft-ink)" }}
                  >
                    £{r.spent.toFixed(1)}
                  </span>
                  <span className="draft-num text-[12px]" style={{ color: "var(--draft-mute)" }}>
                    예상 {r.ep == null ? "·" : r.ep.toFixed(0)}
                  </span>
                </div>
                {r.star && (
                  <div
                    className="mt-3 pt-2 text-[12px]"
                    style={{ borderTop: "1px solid var(--draft-line)" }}
                  >
                    <span style={{ color: "var(--draft-mute)" }}>최고가 </span>
                    <span style={{ color: "var(--draft-ink)", fontWeight: 700 }}>
                      {r.star.nameKo}
                    </span>
                    <span className="draft-num ml-1" style={{ color: "var(--draft-ink-soft)" }}>
                      £{r.star.price.toFixed(1)}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 flex justify-center">
          <button
            onClick={onRestart}
            className="rounded-xl px-10 py-3.5 text-sm font-bold transition-all"
            style={{
              background: "var(--draft-burgundy)",
              color: "#fff",
              boxShadow: "var(--draft-shadow-2)",
            }}
          >
            다시 하기
          </button>
        </div>
      </div>
    </div>
  )
}

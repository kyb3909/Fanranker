"use client"

import { POSITION_HEX } from "@/lib/draft/visual-helpers"
import { type DraftState, type Formation } from "@/lib/draft/engine"
import type { Player, Position } from "@/lib/draft/players"
import { PitchViz, mergeRosterIntoSlots } from "./pitch-viz"

interface DraftResultProps {
  state: DraftState
  mySeat: number
  /** 도판에 손으로 놓은 배치 (슬롯 코드 → 선수). 비어 있으면 자동 배치로 채운다. */
  arrangement: Record<string, Player | null>
  onRestart: () => void
}

const LINES: { pos: Position; label: string }[] = [
  { pos: "GK", label: "골키퍼" },
  { pos: "DF", label: "수비" },
  { pos: "MF", label: "미드필드" },
  { pos: "FW", label: "공격" },
]

/**
 * 드래프트 결과 — **완성된 스쿼드를 보여주는 지면**이다 (2026-08-25 재작업).
 *
 * 종전엔 4팀을 2×2 로 늘어놓은 텍스트 목록이었다. 유저가 30분 동안 고르고 잔디에
 * 손으로 배치한 결과가, 마지막 순간에 스프레드시트로 납작해졌다 — 시각적 보상이
 * 가장 커야 할 자리에서 사라진 셈이다. 게다가 배치 결과는 아예 전달조차 안 됐다.
 *
 * 이제 **내 11명이 잔디 위에 그대로** 뜬다. 도판은 보드/배치 화면과 같은 PitchViz 를
 * 재사용한다 — 세 화면의 잔디가 갈라지지 않게 하는 유일한 방법이다.
 * 상대 3팀은 비교용이므로 아래에 압축해 둔다.
 */
export function DraftResult({ state, mySeat, arrangement, onRestart }: DraftResultProps) {
  const me = state.participants.find((p) => p.seatIndex === mySeat)
  const myFormation = (me?.formation ?? "4-3-3") as Formation
  const myRoster = state.roster[mySeat] || []
  const mySpent = myRoster.reduce((s, p) => s + p.price, 0)
  const myLeft = state.budget[mySeat] ?? 0
  const slots = mergeRosterIntoSlots(arrangement, myRoster, myFormation)
  const star = myRoster.reduce<Player | null>((a, b) => (!a || b.price > a.price ? b : a), null)

  const rivals = state.participants
    .filter((p) => p.seatIndex !== mySeat)
    .map((p) => {
      const roster = state.roster[p.seatIndex] || []
      return {
        ...p,
        roster,
        spent: roster.reduce((s, pl) => s + pl.price, 0),
        left: state.budget[p.seatIndex] ?? 0,
        star: roster.reduce<Player | null>((a, b) => (!a || b.price > a.price ? b : a), null),
      }
    })

  return (
    <div className="draft-scope" style={{ background: "var(--draft-paper)" }}>
      {/* ── 선언 밴드 ──
          다크는 사이트에서 "선언 영역"(밴드·푸터)에만 쓴다. 드래프트 완료는 결과 발표라
          그 조건에 맞고, 아래 웜 페이퍼와 대비되며 시선을 잔디로 떨어뜨린다. */}
      <div
        style={{
          background: "var(--draft-ink)",
          color: "var(--draft-paper)",
          borderBottom: "3px solid var(--draft-burgundy)",
        }}
      >
        <div className="mx-auto flex max-w-[1000px] flex-wrap items-end justify-between gap-4 px-4 py-6 sm:px-6">
          <div>
            <div className="draft-eyebrow" style={{ color: "rgba(245,239,231,0.5)" }}>
              SQUAD COMPLETE
            </div>
            <h1
              className="draft-title mt-1 text-[26px] sm:text-[32px]"
              style={{ color: "var(--draft-paper)" }}
            >
              {me?.name ?? "내 팀"}
            </h1>
            <div className="mt-1 flex items-center gap-2 text-[12px]">
              <span className="draft-num" style={{ color: "rgba(245,239,231,0.75)" }}>
                {myFormation}
              </span>
              <span style={{ color: "rgba(245,239,231,0.3)" }}>·</span>
              <span style={{ color: "rgba(245,239,231,0.75)" }}>{myRoster.length}명 완성</span>
            </div>
          </div>

          {/* 지출 — 이 화면에서 가장 큰 숫자 하나 */}
          <div className="text-right">
            <div className="draft-eyebrow" style={{ color: "rgba(245,239,231,0.5)" }}>
              SPENT
            </div>
            <div
              className="draft-num leading-none"
              style={{ fontSize: 40, fontWeight: 700, color: "var(--draft-paper)" }}
            >
              £{mySpent.toFixed(1)}
            </div>
            <div className="draft-num mt-1 text-[12px]" style={{ color: "rgba(245,239,231,0.6)" }}>
              잔여 £{myLeft.toFixed(1)} / 예산 £{state.initialBudget}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1000px] px-4 py-8 sm:px-6">
        {/* ── 내 스쿼드: 잔디 + 라인별 명단 ── */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
          <div className="mx-auto w-full max-w-[420px] shrink-0 lg:mx-0">
            <PitchViz formation={myFormation} filled={slots} />
          </div>

          <div className="min-w-0 flex-1">
            {star && (
              <div
                className="mb-5 rounded-2xl p-4"
                style={{
                  background: "var(--draft-burgundy-soft)",
                  border: "1px solid var(--draft-line)",
                }}
              >
                <div className="draft-eyebrow draft-eyebrow-burg">최고가 영입</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span
                    className="draft-title text-[20px]"
                    style={{ color: "var(--draft-burgundy)" }}
                  >
                    {star.nameKo}
                  </span>
                  <span className="text-[12px]" style={{ color: "var(--draft-ink-soft)" }}>
                    {star.teamKo}
                  </span>
                  <span
                    className="draft-num ml-auto text-[18px]"
                    style={{ color: "var(--draft-burgundy)", fontWeight: 700 }}
                  >
                    £{star.price.toFixed(1)}
                  </span>
                </div>
              </div>
            )}

            {LINES.map(({ pos, label }) => {
              const line = myRoster
                .filter((p) => p.position === pos)
                .sort((a, b) => b.price - a.price)
              if (line.length === 0) return null
              return (
                <div key={pos} className="mb-4">
                  <div
                    className="draft-eyebrow flex items-center gap-2 pb-1.5"
                    style={{ borderBottom: "1px solid var(--draft-line)" }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        background: POSITION_HEX[pos],
                      }}
                    />
                    {label}
                    <span className="draft-num" style={{ color: "var(--draft-mute)" }}>
                      {line.length}
                    </span>
                  </div>
                  {line.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-baseline gap-2 py-[7px]"
                      style={{ borderBottom: "1px solid var(--draft-line)" }}
                    >
                      <span
                        className="truncate text-[14px] font-bold"
                        style={{ color: "var(--draft-ink)" }}
                      >
                        {p.nameKo}
                      </span>
                      <span className="truncate text-[11px]" style={{ color: "var(--draft-mute)" }}>
                        {p.teamKo}
                      </span>
                      <span
                        className="draft-num ml-auto text-[13px]"
                        style={{ color: "var(--draft-ink-soft)" }}
                      >
                        £{p.price.toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              )
            })}
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
                  <span className="draft-title text-[15px]" style={{ color: "var(--draft-ink)" }}>
                    {r.name}
                  </span>
                  <span className="draft-num text-[11px]" style={{ color: "var(--draft-mute)" }}>
                    {r.formation}
                  </span>
                </div>
                <div
                  className="draft-num mt-2 text-[22px] leading-none"
                  style={{ color: "var(--draft-ink)", fontWeight: 700 }}
                >
                  £{r.spent.toFixed(1)}
                </div>
                <div className="draft-num text-[11px]" style={{ color: "var(--draft-mute)" }}>
                  잔여 £{r.left.toFixed(1)}
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
            className="draft-title rounded-xl px-10 py-3.5 text-sm transition-all"
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

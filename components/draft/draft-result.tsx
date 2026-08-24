"use client"

import { POSITION_HEX } from "@/lib/draft/visual-helpers"
import { getSeatLimits, type DraftState } from "@/lib/draft/engine"

interface DraftResultProps {
  state: DraftState
  mySeat: number
  onRestart: () => void
}

export function DraftResult({ state, mySeat, onRestart }: DraftResultProps) {
  return (
    /* ⚠️ draft-scope 필수 (2026-08-25 정렬) — 종전엔 결과 화면만 스코프 밖이라
       shadcn 기본 팔레트로 렌더돼 드래프트 보드와 다른 사이트처럼 보였다. */
    <div className="draft-scope" style={{ background: "var(--draft-paper)" }}>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="draft-card p-8">
          <div className="mb-8 text-center">
            <div className="text-5xl">🏆</div>
            <h1 className="draft-title mt-3 text-2xl" style={{ color: "var(--draft-ink)" }}>
              드래프트 완료!
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--draft-ink-soft)" }}>
              모든 팀의 로스터가 완성되었습니다
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {state.participants.map((p) => {
              const roster = state.roster[p.seatIndex] || []
              const totalValue = roster.reduce((sum, pl) => sum + pl.price, 0)
              const isMe = p.seatIndex === mySeat

              return (
                <div
                  key={p.seatIndex}
                  className="rounded-xl border p-4"
                  /* 내 팀 강조는 배경 틴트 + 테두리 전체로. 한쪽 면 액센트 보더는 금지 패턴. */
                  style={
                    isMe
                      ? {
                          borderColor: "var(--draft-burgundy)",
                          background: "var(--draft-burgundy-soft)",
                        }
                      : { borderColor: "var(--draft-line)" }
                  }
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="draft-title text-base" style={{ color: "var(--draft-ink)" }}>
                        {p.name}
                      </span>
                      <span
                        className="draft-num rounded px-1.5 py-0.5 text-[10px] font-bold"
                        style={{
                          background: "var(--draft-neutral)",
                          color: "var(--draft-ink-soft)",
                        }}
                      >
                        {p.formation}
                      </span>
                      {isMe && (
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                          style={{ background: "var(--draft-burgundy)", color: "#fff" }}
                        >
                          나
                        </span>
                      )}
                      {p.isAI && (
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                          style={{
                            background: "var(--draft-neutral)",
                            color: "var(--draft-mute)",
                            border: "1px solid var(--draft-line)",
                          }}
                        >
                          AI
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <span
                        className="draft-num text-sm font-bold"
                        style={{ color: "var(--draft-ink)" }}
                      >
                        £{totalValue.toFixed(1)}
                      </span>
                      <span
                        className="draft-num ml-2 text-xs"
                        style={{ color: "var(--draft-ink-soft)" }}
                      >
                        잔여 £{(state.budget[p.seatIndex] ?? 0).toFixed(1)}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {roster
                      .sort((a, b) => {
                        const posOrder = { GK: 0, DF: 1, MF: 2, FW: 3 }
                        return posOrder[a.position] - posOrder[b.position]
                      })
                      .map((player) => (
                        <div
                          key={player.id}
                          className="flex items-center gap-2 rounded border px-2 py-1"
                          style={{
                            borderColor: "var(--draft-line)",
                            background: "var(--draft-neutral)",
                          }}
                        >
                          <span
                            className="draft-title rounded px-1 py-0.5 text-[9px]"
                            style={{ background: POSITION_HEX[player.position], color: "#fff" }}
                          >
                            {player.position}
                          </span>
                          <span
                            className="flex-1 text-xs font-medium"
                            style={{ color: "var(--draft-ink)" }}
                          >
                            {player.nameKo}
                          </span>
                          <span className="text-[10px]" style={{ color: "var(--draft-mute)" }}>
                            {player.teamKo}
                          </span>
                          <span
                            className="draft-num text-[10px] font-semibold"
                            style={{ color: "var(--draft-ink-soft)" }}
                          >
                            £{player.price.toFixed(1)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-8 flex justify-center gap-3">
            <button
              onClick={onRestart}
              className="draft-title rounded-xl px-8 py-3 text-sm transition-all"
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
    </div>
  )
}

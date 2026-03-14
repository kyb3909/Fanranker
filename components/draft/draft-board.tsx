"use client"

import { useState } from "react"
import { PickTimer } from "./pick-timer"
import { PlayerPool } from "./player-pool"
import { MyRoster } from "./my-roster"
import { POSITION_COLORS, type Position } from "@/lib/draft/players"
import type { DraftState } from "@/lib/draft/engine"
import { getCurrentSeat, getCurrentRound, getSeatLimits } from "@/lib/draft/engine"

interface DraftBoardProps {
  state: DraftState
  mySeat: number
  onPick: (playerId: string) => void
  onTimeout: () => void
  timerReset: number
}

const POSITIONS: Position[] = ["GK", "DF", "MF", "FW"]

export function DraftBoard({ state, mySeat, onPick, onTimeout, timerReset }: DraftBoardProps) {
  const [viewSeat, setViewSeat] = useState(mySeat)
  const currentSeat = getCurrentSeat(state)
  const currentRound = getCurrentRound(state)
  const myTurn = currentSeat === mySeat
  const isActive = state.status === "drafting"
  const currentParticipant = state.participants.find((p) => p.seatIndex === currentSeat)

  // 최근 픽 히스토리 (최대 8개)
  const recentPicks = state.picks.slice(-8).reverse()

  // 현재 보고 있는 팀의 로스터
  const viewParticipant = state.participants.find((p) => p.seatIndex === viewSeat)
  const viewRoster = state.roster[viewSeat] || []
  const viewBudget = state.budget[viewSeat] ?? 0

  return (
    <div className="flex h-[calc(100vh-160px)] min-h-[400px] flex-col gap-3 lg:min-h-[600px] lg:flex-row">
      {/* 왼쪽: 선수 풀 (모바일: 탭으로 전환) */}
      <div className="border-border bg-card flex max-h-[50vh] flex-col rounded-xl border shadow-sm lg:max-h-none lg:w-[420px]">
        <PlayerPool state={state} myTurn={myTurn} mySeat={mySeat} onPick={onPick} />
      </div>

      {/* 중앙: 드래프트 보드 */}
      <div className="flex flex-1 flex-col gap-3">
        {/* 상단: 타이머 + 현재 차례 */}
        <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <span className="text-muted-foreground text-xs">라운드 {currentRound}/11</span>
              <div className="flex items-center gap-2">
                <span className="text-foreground text-lg font-bold">
                  {myTurn ? "🎯 내 차례!" : `${currentParticipant?.name || ""}의 차례`}
                </span>
                {currentParticipant?.isAI && !myTurn && (
                  <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-bold text-violet-400">
                    AI
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <span className="text-muted-foreground text-xs">
                픽 {state.currentPick + 1}/{state.snakeOrder.length}
              </span>
            </div>
          </div>
          <PickTimer
            duration={30}
            isActive={isActive && myTurn}
            onTimeout={onTimeout}
            onReset={timerReset}
          />
        </div>

        {/* 참가자 요약 - 클릭하면 로스터 확인 */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {state.participants.map((p) => {
            const isCurrentTurn = p.seatIndex === currentSeat
            const isMe = p.seatIndex === mySeat
            const isViewing = p.seatIndex === viewSeat
            const rosterCount = (state.roster[p.seatIndex] || []).length
            const budget = state.budget[p.seatIndex] ?? 0

            return (
              <button
                key={p.seatIndex}
                onClick={() => setViewSeat(p.seatIndex)}
                className={`rounded-lg border p-3 text-left transition-all ${
                  isViewing
                    ? "border-primary bg-primary/10 ring-primary/30 ring-1"
                    : isCurrentTurn
                      ? "border-primary/50 bg-primary/5 shadow-md"
                      : "border-border/50 bg-card hover:border-border"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                      isMe ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {p.seatIndex + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="text-foreground truncate text-sm font-semibold">
                        {p.name}
                      </span>
                      {p.isAI && (
                        <span className="shrink-0 rounded bg-violet-500/20 px-1 py-0.5 text-[9px] font-bold text-violet-400">
                          AI
                        </span>
                      )}
                      {isMe && (
                        <span className="shrink-0 rounded bg-emerald-500/20 px-1 py-0.5 text-[9px] font-bold text-emerald-400">
                          나
                        </span>
                      )}
                    </div>
                    <div className="text-muted-foreground flex items-center gap-2 text-[11px]">
                      <span>{rosterCount}/11명</span>
                      <span>£{budget.toFixed(1)}</span>
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* 최근 픽 히스토리 */}
        <div className="border-border bg-card flex-1 overflow-hidden rounded-xl border shadow-sm">
          <div className="border-border border-b px-4 py-2.5">
            <h3 className="text-foreground text-sm font-bold">최근 픽</h3>
          </div>
          <div className="overflow-y-auto p-3">
            {recentPicks.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">아직 픽이 없습니다</p>
            ) : (
              <div className="space-y-1.5">
                {recentPicks.map((pick) => {
                  const participant = state.participants.find((p) => p.seatIndex === pick.seatIndex)
                  const player = state.roster[pick.seatIndex]?.find((p) => p.id === pick.playerId)
                  if (!player) return null

                  return (
                    <div
                      key={pick.pickNumber}
                      className="border-border/30 bg-muted/20 flex items-center gap-3 rounded-lg border px-3 py-2"
                    >
                      <span className="text-muted-foreground w-6 text-center text-xs font-bold">
                        #{pick.pickNumber + 1}
                      </span>
                      <span className="text-muted-foreground text-xs font-semibold">
                        {participant?.name}
                      </span>
                      <div className="flex flex-1 items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${POSITION_COLORS[player.position]}`}
                        >
                          {player.position}
                        </span>
                        <span className="text-foreground text-sm font-medium">{player.nameKo}</span>
                        <span className="text-muted-foreground text-[11px]">{player.teamKo}</span>
                      </div>
                      <span className="text-muted-foreground font-mono text-xs font-semibold">
                        £{player.price.toFixed(1)}
                      </span>
                      {pick.isAutoPick && (
                        <span className="rounded bg-orange-500/20 px-1 py-0.5 text-[9px] text-orange-400">
                          자동
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 오른쪽: 팀 로스터 */}
      <div className="border-border bg-card w-full rounded-xl border shadow-sm lg:w-[280px]">
        <MyRoster
          roster={viewRoster}
          budget={viewBudget}
          seatName={viewParticipant?.name || ""}
          positionLimits={getSeatLimits(state, viewSeat)}
        />
      </div>
    </div>
  )
}

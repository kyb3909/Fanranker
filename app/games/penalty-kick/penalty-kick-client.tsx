"use client"

import { useEffect, useState } from "react"
import { Coins, Target, Trophy, Zap } from "lucide-react"
import { usePenaltyKick } from "@/hooks/use-penalty-kick"
import { PenaltyKickCanvas } from "./penalty-kick-canvas"

interface TodayResult {
  goals: number
  gold_rewarded: number
  kick_details: Array<{
    kick_number: number
    result: string
    is_goal: boolean
  }>
}

interface RecentPlay {
  play_date: string
  goals: number
  gold_rewarded: number
}

const REWARD_TABLE: Record<number, number> = {
  0: 0,
  1: 2,
  2: 5,
  3: 10,
  4: 20,
  5: 50,
}

export function PenaltyKickClient() {
  const [loading, setLoading] = useState(true)
  const [canPlay, setCanPlay] = useState(false)
  const [todayResult, setTodayResult] = useState<TodayResult | null>(null)
  const [recentPlays, setRecentPlays] = useState<RecentPlay[]>([])

  const { state, startGame, handleAction, onShootAnimationEnd, submitResults } =
    usePenaltyKick()

  // Load status on mount
  useEffect(() => {
    fetch("/api/games/mini/status?game=penalty_kick")
      .then((r) => r.json())
      .then((data) => {
        setCanPlay(data.canPlay)
        setTodayResult(data.todayResult)
        setRecentPlays(data.recentPlays || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Auto-submit when game over
  useEffect(() => {
    if (state.phase === "GAME_OVER" && state.goldRewarded === null && !state.submitting) {
      submitResults()
    }
  }, [state.phase, state.goldRewarded, state.submitting, submitResults])

  // After successful submit, update local state
  useEffect(() => {
    if (state.goldRewarded !== null) {
      setCanPlay(false)
      setTodayResult({
        goals: state.totalGoals,
        gold_rewarded: state.goldRewarded,
        kick_details: state.kicks.map((k) => ({
          kick_number: k.kick_number,
          result: k.result,
          is_goal: k.is_goal,
        })),
      })
    }
  }, [state.goldRewarded, state.totalGoals, state.kicks])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    )
  }

  // Phase instruction text
  const phaseText: Record<string, string> = {
    AIMING: "화면을 클릭하여 조준을 고정하세요!",
    POWERING: "클릭하여 파워를 결정하세요! (초록 구간이 스윗스팟)",
    SHOOTING: "슈팅!",
    RESULT: "클릭하여 다음 킥으로",
    GAME_OVER: "",
  }

  return (
    <div className="space-y-4 py-4">
      {/* Title */}
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-sm">
          <Target className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold">페널티킥</h1>
          <p className="text-muted-foreground text-xs">
            5번의 킥으로 최대한 많은 골을 넣으세요!
          </p>
        </div>
      </div>

      {/* Game Area */}
      {state.phase !== "IDLE" && state.phase !== "GAME_OVER" ? (
        <div className="space-y-3">
          {/* Progress bar */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              킥 {state.currentKick}/5
            </span>
            <div className="flex gap-1">
              {Array.from({ length: 5 }, (_, i) => {
                const kick = state.kicks[i]
                return (
                  <div
                    key={i}
                    className={`h-2.5 w-8 rounded-full ${
                      kick
                        ? kick.is_goal
                          ? "bg-green-500"
                          : "bg-primary"
                        : i === state.currentKick - 1
                          ? "bg-primary animate-pulse"
                          : "bg-muted"
                    }`}
                  />
                )
              })}
            </div>
            <span className="ml-auto text-sm font-semibold text-green-600">
              {state.totalGoals}골
            </span>
          </div>

          {/* Canvas */}
          <PenaltyKickCanvas
            state={state}
            onAction={handleAction}
            onShootAnimationEnd={onShootAnimationEnd}
          />

          {/* Phase instruction */}
          <p className="text-center text-sm font-medium text-muted-foreground">
            {phaseText[state.phase] || ""}
          </p>
        </div>
      ) : state.phase === "GAME_OVER" ? (
        /* Game Over screen */
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <Trophy className="mx-auto h-12 w-12 text-amber-500" />
          <h2 className="mt-3 text-xl font-bold">게임 종료!</h2>
          <p className="mt-1 text-3xl font-black text-green-600">
            {state.totalGoals}골 / 5킥
          </p>

          {state.submitting ? (
            <p className="mt-3 text-sm text-muted-foreground animate-pulse">
              결과 저장 중...
            </p>
          ) : state.error ? (
            <p className="mt-3 text-sm text-primary">{state.error}</p>
          ) : state.goldRewarded !== null ? (
            <div className="mt-3 flex items-center justify-center gap-1.5 text-lg font-bold text-amber-600">
              <Coins className="h-5 w-5" />
              {state.goldRewarded > 0
                ? `+${state.goldRewarded}G 획득!`
                : "보상 없음"}
            </div>
          ) : null}

          {/* Kick details */}
          <div className="mt-4 flex justify-center gap-2">
            {state.kicks.map((kick) => (
              <div
                key={kick.kick_number}
                className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${
                  kick.is_goal
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-primary/15 text-primary dark:bg-primary/20 dark:text-primary"
                }`}
                title={kick.result}
              >
                {kick.is_goal ? "G" : "X"}
              </div>
            ))}
          </div>
        </div>
      ) : todayResult ? (
        /* Already played today */
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <Trophy className="mx-auto h-10 w-10 text-amber-500" />
          <h2 className="mt-2 text-lg font-bold">오늘 도전 완료!</h2>
          <p className="text-2xl font-black text-green-600">
            {todayResult.goals}골 / 5킥
          </p>
          <div className="mt-2 flex items-center justify-center gap-1.5 text-amber-600 font-semibold">
            <Coins className="h-4 w-4" />
            {todayResult.gold_rewarded > 0
              ? `+${todayResult.gold_rewarded}G 획득`
              : "보상 없음"}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            내일 다시 도전할 수 있습니다
          </p>
        </div>
      ) : (
        /* Start screen */
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <Target className="mx-auto h-12 w-12 text-green-600" />
          <h2 className="mt-3 text-lg font-bold">오늘의 페널티킥</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            5번의 킥 찬스! 타이밍에 맞춰 조준하고 파워를 조절하세요.
          </p>

          <button
            onClick={startGame}
            disabled={!canPlay}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
          >
            <Zap className="h-4 w-4" />
            게임 시작
          </button>
        </div>
      )}

      {/* Reward Table */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Coins className="h-4 w-4 text-amber-500" />
          보상 테이블
        </h3>
        <div className="mt-2 grid grid-cols-6 gap-1.5 text-center text-xs">
          {Object.entries(REWARD_TABLE).map(([goals, gold]) => (
            <div
              key={goals}
              className={`rounded-lg py-2 ${
                Number(goals) >= 4
                  ? "bg-amber-100 dark:bg-amber-900/20"
                  : "bg-muted/50"
              }`}
            >
              <p className="font-bold">{goals}골</p>
              <p className={`font-semibold ${gold > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                {gold > 0 ? `${gold}G` : "-"}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent History */}
      {recentPlays.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Trophy className="h-4 w-4 text-amber-500" />
            최근 기록
          </h3>
          <div className="mt-2 space-y-1.5">
            {recentPlays.map((play) => (
              <div
                key={play.play_date}
                className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-1.5 text-xs"
              >
                <span className="text-muted-foreground">
                  {play.play_date}
                </span>
                <span className="font-semibold">{play.goals}골</span>
                <span className="font-semibold text-amber-600">
                  {play.gold_rewarded > 0 ? `+${play.gold_rewarded}G` : "-"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* How to play */}
      <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground text-sm mb-2">플레이 방법</p>
        <ol className="space-y-1 list-decimal list-inside">
          <li>
            <strong>조준</strong>: 크로스헤어가 움직입니다. 원하는 위치에서 클릭!
          </li>
          <li>
            <strong>파워</strong>: 게이지가 올라갑니다. 초록 구간(30~80%)에서 클릭!
          </li>
          <li>코너를 노리면 골키퍼가 막기 어렵습니다</li>
          <li>파워가 너무 약하거나 강하면 실패!</li>
          <li>하루 1회, 5킥 1라운드</li>
        </ol>
      </div>
    </div>
  )
}

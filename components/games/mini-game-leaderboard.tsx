"use client"

import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { Trophy } from "lucide-react"

interface Entry {
  user_id: string
  nickname: string
  best_score: number
  plays: number
}

type MiniGameId = "corner-hero" | "pass-survivor" | "rondo"

const RANK_EMOJI = ["🥇", "🥈", "🥉"]

/**
 * 게임 화면 아래 "오늘의 순위" 패널.
 * 게임 iframe 의 postMessage({type:'minigame:score'}) 를 받아 점수를 저장하고 순위를 갱신.
 * 오늘(KST) 유저별 최고점 TOP 10. 비로그인은 조회만 가능.
 */
export function MiniGameLeaderboard({ game }: { game: MiniGameId }) {
  const { isSignedIn, userId } = useAuth()
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<"idle" | "saved" | "need-login">("idle")

  const load = useCallback(
    async (bustCache = false) => {
      try {
        const url = `/api/minigames/leaderboard?game=${game}${bustCache ? `&t=${Date.now()}` : ""}`
        const res = await fetch(url, bustCache ? { cache: "no-store" } : undefined)
        if (!res.ok) return
        const json = await res.json()
        setEntries(json.entries ?? [])
      } catch {
        /* 조회 실패는 조용히 무시 — 게임 플레이에 영향 없음 */
      } finally {
        setLoading(false)
      }
    },
    [game]
  )

  useEffect(() => {
    void load()
  }, [load])

  // 게임 iframe → postMessage 수신 → 점수 저장 → 순위 갱신
  useEffect(() => {
    const onMessage = async (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      const d = e.data
      if (!d || d.type !== "minigame:score" || d.game !== game) return
      const score = Number(d.score)
      if (!Number.isFinite(score) || score < 0) return

      if (!isSignedIn) {
        setSaveState("need-login")
        return
      }
      try {
        const res = await fetch("/api/minigames/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ game, score: Math.round(score) }),
        })
        if (res.ok) {
          setSaveState("saved")
          void load(true)
        }
      } catch {
        /* 저장 실패 — 다음 판에서 재시도됨 */
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [game, isSignedIn, load])

  return (
    <section
      aria-label="오늘의 순위"
      className="mt-4 rounded-lg border p-4"
      style={{ borderColor: "var(--wc-line, #E2E5EA)", background: "var(--wc-card, #ffffff)" }}
    >
      <div className="mb-3 flex items-center gap-2">
        <Trophy className="h-4 w-4 text-amber-500" />
        <h2 className="text-[14px] font-bold">오늘의 순위</h2>
        <span className="text-muted-foreground text-[12px]">자정(KST) 리셋 · 유저별 최고점</span>
        {saveState === "saved" && (
          <span className="ml-auto text-[12px] font-medium text-emerald-600">기록 저장됨 ✓</span>
        )}
        {saveState === "need-login" && (
          <span className="text-muted-foreground ml-auto text-[12px]">
            로그인하면 순위에 기록됩니다
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-muted-foreground py-4 text-center text-[13px]">불러오는 중…</p>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-[13px]">
          아직 기록이 없습니다. 첫 번째 도전자가 되어보세요!
        </p>
      ) : (
        <ol className="space-y-1">
          {entries.map((entry, i) => {
            const isMe = entry.user_id === userId
            return (
              <li
                key={entry.user_id}
                className={`flex items-center gap-3 rounded-md px-3 py-1.5 text-[13px] ${
                  isMe ? "bg-amber-50 font-semibold" : ""
                }`}
              >
                <span className="w-7 shrink-0 text-center font-bold">
                  {RANK_EMOJI[i] ?? `${i + 1}`}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {entry.nickname}
                  {isMe && <span className="ml-1 text-[11px] text-amber-600">(나)</span>}
                </span>
                <span className="text-muted-foreground shrink-0 text-[12px]">{entry.plays}판</span>
                <span className="w-16 shrink-0 text-right font-bold tabular-nums">
                  {entry.best_score.toLocaleString()}점
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

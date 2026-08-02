"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * 주간 추첨 무대 — 운영자가 추첨하는 장면을 그대로 녹화해 영상·커뮤니티에 쓰기 위한 화면.
 *
 * ⚠️ 여기서 당첨자를 뽑지 않는다. 서버(/api/admin/season/weekly-draw)가 이미 정한 결과를
 *    받아서 **연출만** 한다. 클라이언트 난수로 뽑으면 조작 가능·검증 불가이기 때문이다.
 *    결과가 고정이므로 녹화에 실패해도 [다시 재생]으로 몇 번이든 같은 장면을 만든다.
 *
 * 연출: 5칸이 각자 후보 닉네임을 빠르게 돌리다가 **왼쪽부터 순차로** 멈춘다.
 *      긴장이 5번 반복돼 영상 소재로 쓰기 좋다.
 */

interface Candidate {
  user_id: string
  nickname: string
}
interface Winner {
  user_id: string
  nickname: string
}

interface Props {
  candidates: Candidate[]
  winners: Winner[]
  /** 칸 하나가 멈추는 간격 (ms) — 전체 길이 = 첫 지연 + 간격 × 인원 */
  stagger?: number
  weekStart: string
  candidatesHash?: string | null
}

const ROLL_TICK_MS = 70

export function WeeklyDrawStage({
  candidates,
  winners,
  stagger = 1400,
  weekStart,
  candidatesHash,
}: Props) {
  // 각 칸이 확정됐는지 / 굴러가는 동안 보여줄 임시 이름
  const [locked, setLocked] = useState<boolean[]>(() => winners.map(() => false))
  const [rolling, setRolling] = useState<string[]>(() => winners.map(() => ""))
  const [playing, setPlaying] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearAll = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    if (ticker.current) {
      clearInterval(ticker.current)
      ticker.current = null
    }
  }, [])

  const play = useCallback(() => {
    if (candidates.length === 0 || winners.length === 0) return
    clearAll()
    setPlaying(true)
    setLocked(winners.map(() => false))

    // 아직 안 멈춘 칸만 계속 이름을 갈아끼운다
    ticker.current = setInterval(() => {
      setRolling((prev) =>
        prev.map((cur, i) =>
          lockedRef.current[i]
            ? cur
            : (candidates[Math.floor(Math.random() * candidates.length)]?.nickname ?? cur)
        )
      )
    }, ROLL_TICK_MS)

    winners.forEach((_, i) => {
      timers.current.push(
        setTimeout(
          () => {
            setLocked((prev) => {
              const next = [...prev]
              next[i] = true
              return next
            })
            if (i === winners.length - 1) {
              clearAll()
              setPlaying(false)
            }
          },
          stagger * (i + 1)
        )
      )
    })
  }, [candidates, winners, stagger, clearAll])

  // setInterval 콜백이 최신 locked 를 보게 하는 미러 (의존성 재생성 방지)
  const lockedRef = useRef(locked)
  useEffect(() => {
    lockedRef.current = locked
  }, [locked])

  useEffect(() => clearAll, [clearAll])

  const done = locked.every(Boolean)

  return (
    <div
      className="rounded-2xl px-6 py-8"
      style={{ background: "#0b0a0e", border: "1px solid rgba(255,255,255,.08)" }}
    >
      <div className="mb-6 text-center">
        <p
          className="text-[12px] font-extrabold"
          style={{ color: "var(--wc-burgundy, #8b1e3f)", letterSpacing: "0.18em" }}
        >
          WEEKLY DRAW · {weekStart}
        </p>
        <p className="mt-1 text-[15px]" style={{ color: "rgba(245,239,231,.72)" }}>
          응모 자격 충족 <b style={{ color: "#fff" }}>{candidates.length}명</b> 중{" "}
          <b style={{ color: "#fff" }}>{winners.length}명</b> 추첨
        </p>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${winners.length}, 1fr)` }}>
        {winners.map((w, i) => {
          const isLocked = locked[i]
          return (
            <div
              key={w.user_id}
              className="flex min-h-[132px] flex-col items-center justify-center rounded-xl px-2 transition-all"
              style={{
                background: isLocked ? "rgba(139,30,63,.22)" : "rgba(255,255,255,.04)",
                border: `1px solid ${isLocked ? "rgba(139,30,63,.9)" : "rgba(255,255,255,.08)"}`,
                transform: isLocked ? "scale(1)" : "scale(.97)",
              }}
            >
              <span
                className="text-center leading-tight font-extrabold break-keep"
                style={{
                  fontSize: "clamp(18px, 2vw, 26px)",
                  color: isLocked ? "#fff" : "rgba(245,239,231,.45)",
                  textShadow: isLocked ? "0 2px 18px rgba(139,30,63,.8)" : "none",
                }}
              >
                {isLocked ? w.nickname : rolling[i] || "…"}
              </span>
              <span
                className="mt-2 text-[11px] font-bold"
                style={{ color: isLocked ? "rgba(245,239,231,.7)" : "rgba(245,239,231,.3)" }}
              >
                {isLocked ? `${i + 1}번 당첨` : "추첨 중"}
              </span>
            </div>
          )
        })}
      </div>

      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={play}
          disabled={playing}
          className="rounded-lg px-5 py-2.5 text-[14px] font-bold disabled:opacity-40"
          style={{ background: "var(--wc-burgundy, #8b1e3f)", color: "#fff" }}
        >
          {playing ? "추첨 중…" : done ? "다시 재생" : "추첨 시작"}
        </button>
      </div>

      {candidatesHash && (
        <p
          className="mt-5 text-center font-mono text-[10px] break-all"
          style={{ color: "rgba(245,239,231,.32)" }}
        >
          명단 지문 {candidatesHash.slice(0, 32)}…
        </p>
      )}
    </div>
  )
}

"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * 이번 주 당첨자 공개 — /season 랭킹 보드에 붙는다.
 *
 * 추첨은 이미 백단(cron)에서 끝났고, 여기서는 **결과를 연출로 공개**만 한다.
 * 숫자 한 줄로 이름을 나열하면 발표가 아니라 공지가 된다 — 칸이 돌다가 하나씩
 * 멈추면 보는 사람이 잠깐이라도 기대하게 되고, 그게 매주 다시 올 이유가 된다.
 *
 * 같은 회차를 볼 때마다 다시 돌면 성가시므로 **주차당 1회만 재생**하고(localStorage),
 * 그 뒤에는 결과를 바로 보여준다. [다시 보기]로 언제든 재생할 수 있다.
 */

interface Winner {
  user_id: string
  nickname: string
}

interface Props {
  weekStart: string
  winners: Winner[]
  candidateCount: number
  /** 굴러가는 동안 스쳐 보일 이름들 (없으면 당첨자 이름으로 대체) */
  poolNames?: string[]
  /** 칸 하나가 멈추는 간격 (ms) */
  stagger?: number
}

const ROLL_TICK_MS = 70
const SEEN_KEY = "gn:season:draw-seen"

export function WeeklyDrawReveal({
  weekStart,
  winners,
  candidateCount,
  poolNames,
  stagger = 900,
}: Props) {
  const names = poolNames?.length ? poolNames : winners.map((w) => w.nickname)

  // 처음엔 전부 확정 상태로 그린다 — 재생하기로 결정되면 그때 풀어준다.
  // (SSR/hydration 시점엔 localStorage 를 못 읽어서, 깜빡임 없이 결과부터 보여준다)
  const [locked, setLocked] = useState<boolean[]>(() => winners.map(() => true))
  const [rolling, setRolling] = useState<string[]>(() => winners.map(() => ""))
  const [playing, setPlaying] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null)
  const lockedRef = useRef(locked)

  useEffect(() => {
    lockedRef.current = locked
  }, [locked])

  const clearAll = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    if (ticker.current) {
      clearInterval(ticker.current)
      ticker.current = null
    }
  }, [])

  const play = useCallback(() => {
    if (winners.length === 0) return
    clearAll()
    setPlaying(true)
    const unlocked = winners.map(() => false)
    setLocked(unlocked)
    lockedRef.current = unlocked

    ticker.current = setInterval(() => {
      setRolling((prev) =>
        prev.map((cur, i) =>
          lockedRef.current[i] ? cur : (names[Math.floor(Math.random() * names.length)] ?? cur)
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
              lockedRef.current = next
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
  }, [winners, names, stagger, clearAll])

  // 이 주차를 처음 보는 사람에게만 자동 재생
  useEffect(() => {
    if (winners.length === 0) return
    let seen: string | null = null
    try {
      seen = window.localStorage.getItem(SEEN_KEY)
    } catch {
      /* 사생활 보호 모드 등 — 그냥 재생하지 않는다 */
    }
    if (seen !== weekStart) {
      try {
        window.localStorage.setItem(SEEN_KEY, weekStart)
      } catch {
        /* 저장 실패해도 재생은 한다 */
      }
      play()
    }
    return clearAll
  }, [weekStart, winners.length, play, clearAll])

  if (winners.length === 0) return null

  return (
    <div
      className="rounded-2xl px-5 py-6 sm:px-6"
      style={{ background: "#0b0a0e", border: "1px solid rgba(255,255,255,.08)" }}
    >
      <div className="mb-5 text-center">
        <p
          className="text-[11px] font-extrabold"
          style={{ color: "var(--wc-burgundy, #8b1e3f)", letterSpacing: "0.18em" }}
        >
          THIS WEEK&apos;S WINNERS
        </p>
        <p className="mt-1.5 text-[14px]" style={{ color: "rgba(245,239,231,.72)" }}>
          응모 자격 충족 <b style={{ color: "#fff" }}>{candidateCount}명</b> 중{" "}
          <b style={{ color: "#fff" }}>{winners.length}명</b> — 스팀 기프트카드 5만원권
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {winners.map((w, i) => {
          const isLocked = locked[i]
          return (
            <div
              key={w.user_id}
              className="flex min-h-[96px] flex-col items-center justify-center rounded-xl px-2 transition-all duration-300"
              style={{
                background: isLocked ? "rgba(139,30,63,.22)" : "rgba(255,255,255,.04)",
                border: `1px solid ${isLocked ? "rgba(139,30,63,.9)" : "rgba(255,255,255,.08)"}`,
                transform: isLocked ? "scale(1)" : "scale(.97)",
              }}
            >
              <span
                className="text-center leading-tight font-extrabold break-keep"
                style={{
                  fontSize: "clamp(15px, 1.6vw, 20px)",
                  color: isLocked ? "#fff" : "rgba(245,239,231,.45)",
                  textShadow: isLocked ? "0 2px 18px rgba(139,30,63,.8)" : "none",
                }}
              >
                {isLocked ? w.nickname : rolling[i] || "…"}
              </span>
            </div>
          )
        })}
      </div>

      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={play}
          disabled={playing}
          className="text-[12px] font-bold underline-offset-4 hover:underline disabled:opacity-40"
          style={{ color: "rgba(245,239,231,.5)" }}
        >
          {playing ? "추첨 공개 중…" : "다시 보기"}
        </button>
      </div>
    </div>
  )
}

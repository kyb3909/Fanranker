"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"

/**
 * 경기 라인업 (표시 전용, 2026-08-16) — /api/match/lineup 소비자.
 *
 * ## 조용함이 계약이다
 * - 킥오프 창(-150분~+180분) 밖이면 **호출 자체를 안 한다.**
 * - `ready` 가 아니면 **아무것도 렌더하지 않는다** — 스켈레톤·"라인업 없음" 문구 금지.
 *   라인업은 곁들이 정보라 없음/실패가 화면에 보이는 순간 카드 전체가 고장나 보인다.
 * - `pending` 이면 5분 간격 재조회 (탭이 숨겨져 있으면 스킵, 최대 24회 = 2시간).
 *   `ready` 를 받으면 즉시 정지 — 발표된 라인업은 불변이다.
 *
 * 표기: 사전에 있으면 한글, 없으면 로마자 (운영자 결정: 혼용 허용).
 */

interface DisplayPlayer {
  label: string
  number: number | null
}

interface DisplaySide {
  teamLabel: string
  formation: string | null
  starters: DisplayPlayer[]
  bench: DisplayPlayer[]
}

type LineupResponse =
  | { status: "none" }
  | { status: "pending"; kickoff: string }
  | { status: "ready"; kickoff: string; home: DisplaySide; away: DisplaySide; fetchedAt: string }

const WINDOW_BEFORE_MS = 150 * 60 * 1000
const WINDOW_AFTER_MS = 180 * 60 * 1000
const POLL_MS = 5 * 60 * 1000
const MAX_POLLS = 24

export interface MatchLineupProps {
  gameId: string
  /** betman 킥오프 ISO — 창 판정을 클라에서 먼저 해 창 밖 호출을 0으로 만든다 */
  matchTime: string
  compact?: boolean
}

export function MatchLineup({ gameId, matchTime, compact = false }: MatchLineupProps) {
  const [data, setData] = useState<LineupResponse | null>(null)
  const [open, setOpen] = useState(false)
  const polls = useRef(0)

  useEffect(() => {
    const kickoff = new Date(matchTime).getTime()
    if (!Number.isFinite(kickoff)) return
    const inWindow = () => {
      const now = Date.now()
      return now >= kickoff - WINDOW_BEFORE_MS && now <= kickoff + WINDOW_AFTER_MS
    }
    if (!inWindow()) return

    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const load = async () => {
      if (stopped) return
      if (document.hidden) {
        // 백그라운드 탭에서는 부르지 않는다 — 돌아오면 다음 틱이 잡는다
        timer = setTimeout(load, POLL_MS)
        return
      }
      try {
        const res = await fetch(`/api/match/lineup?gameId=${gameId}`)
        const j = (await res.json()) as LineupResponse
        if (stopped) return
        setData(j)
        if (j.status === "pending" && polls.current < MAX_POLLS && inWindow()) {
          polls.current += 1
          timer = setTimeout(load, POLL_MS)
        }
        // ready → 불변, 정지. none → 영구 조용.
      } catch {
        // fail-open — 조용히 포기 (재시도는 pending 응답을 받았을 때만)
      }
    }
    void load()
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [gameId, matchTime])

  if (data?.status !== "ready") return null

  return (
    <div className={compact ? "mt-2" : "mt-2.5"}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-[12px] font-bold transition-colors"
        style={{ color: "var(--wc-burgundy)" }}
      >
        선발 라인업
        <ChevronDown
          className="h-3.5 w-3.5 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : undefined }}
        />
      </button>

      {open && (
        <div
          className="mt-2 grid grid-cols-2 gap-3 rounded-lg p-3"
          style={{ background: "var(--wc-soft)", border: "1px solid var(--wc-line)" }}
        >
          {[data.home, data.away].map((side) => (
            <div key={side.teamLabel} className="min-w-0">
              <div className="mb-1.5 flex items-baseline gap-1.5">
                <span
                  className="truncate text-[12.5px] font-bold"
                  style={{ color: "var(--wc-ink)" }}
                >
                  {side.teamLabel}
                </span>
                {side.formation && (
                  <span
                    className="gn-num shrink-0 text-[10.5px] font-bold"
                    style={{ color: "var(--wc-mute-2)" }}
                  >
                    {side.formation}
                  </span>
                )}
              </div>
              <ol className="space-y-0.5">
                {side.starters.map((p, i) => (
                  <li key={i} className="flex items-baseline gap-1.5 text-[12px] leading-[1.45]">
                    <span
                      className="gn-num w-4 shrink-0 text-right text-[10.5px] font-bold"
                      style={{ color: "var(--wc-mute-2)" }}
                    >
                      {p.number ?? "-"}
                    </span>
                    <span className="truncate" style={{ color: "var(--wc-ink-2)" }}>
                      {p.label}
                    </span>
                  </li>
                ))}
              </ol>
              {side.bench.length > 0 && (
                <details className="mt-1.5">
                  <summary
                    className="cursor-pointer list-none text-[11px] font-semibold"
                    style={{ color: "var(--wc-mute)" }}
                  >
                    벤치 {side.bench.length}
                  </summary>
                  <ol className="mt-1 space-y-0.5">
                    {side.bench.map((p, i) => (
                      <li
                        key={i}
                        className="flex items-baseline gap-1.5 text-[11.5px] leading-[1.45]"
                      >
                        <span
                          className="gn-num w-4 shrink-0 text-right text-[10px]"
                          style={{ color: "var(--wc-mute-2)" }}
                        >
                          {p.number ?? "-"}
                        </span>
                        <span className="truncate" style={{ color: "var(--wc-mute)" }}>
                          {p.label}
                        </span>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

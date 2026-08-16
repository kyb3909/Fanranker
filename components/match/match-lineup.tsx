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
// 서버(lineup-lookup)와 동일 — FT 후에도 하루 동안 조회 가능 (매치 페이지, 2026-08-16)
const WINDOW_AFTER_MS = 24 * 3600 * 1000
const POLL_MS = 5 * 60 * 1000
const MAX_POLLS = 24

export interface MatchLineupProps {
  gameId: string
  /** betman 킥오프 ISO — 창 판정을 클라에서 먼저 해 창 밖 호출을 0으로 만든다 */
  matchTime: string
  compact?: boolean
  /** 매치 페이지처럼 라인업이 주인공인 곳은 접지 않고 바로 펼친다 (2026-08-16) */
  defaultOpen?: boolean
}

export function MatchLineup({
  gameId,
  matchTime,
  compact = false,
  defaultOpen = false,
}: MatchLineupProps) {
  const [data, setData] = useState<LineupResponse | null>(null)
  const [open, setOpen] = useState(defaultOpen)
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

      {/* 편집 지면 문법 (2026-08-16 리디자인) — 베이지 패널을 걷어내고 흰 지면 위에
          괘선으로만 구조를 세운다. 등번호는 와인 틴트 칩, 포메이션은 pill. */}
      {open && (
        <div className="mt-2.5 grid grid-cols-2">
          {[data.home, data.away].map((side, sideIdx) => (
            <div
              key={side.teamLabel}
              className={`min-w-0 ${sideIdx === 0 ? "pr-3" : "pl-3"}`}
              style={sideIdx === 1 ? { borderLeft: "1px solid var(--wc-line)" } : undefined}
            >
              {/* 팀 헤더 — 팀명 볼드 + 포메이션 pill, 아래 굵은 괘선 */}
              <div
                className="flex items-center justify-between gap-1.5 pb-1.5"
                style={{ borderBottom: "2px solid var(--wc-ink)" }}
              >
                <span
                  className="truncate text-[13px] font-extrabold"
                  style={{ color: "var(--wc-ink)", letterSpacing: "-0.01em" }}
                >
                  {side.teamLabel}
                </span>
                {side.formation && (
                  <span
                    className="gn-num shrink-0 rounded-full px-1.5 py-[1px] text-[10px] font-bold"
                    style={{
                      background: "var(--wc-wine-tint)",
                      color: "var(--wc-burgundy)",
                    }}
                  >
                    {side.formation}
                  </span>
                )}
              </div>
              <ol className="mt-1.5 space-y-[3px]">
                {side.starters.map((p, i) => (
                  <li key={i} className="flex items-center gap-2 text-[12.5px] leading-[1.5]">
                    <span
                      className="gn-num grid h-[19px] w-[19px] shrink-0 place-items-center rounded-full text-[10px] font-extrabold"
                      style={{
                        background: "var(--wc-wine-tint)",
                        color: "var(--wc-burgundy)",
                      }}
                    >
                      {p.number ?? "·"}
                    </span>
                    <span
                      className="truncate font-medium"
                      style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
                    >
                      {p.label}
                    </span>
                  </li>
                ))}
              </ol>
              {side.bench.length > 0 && (
                <details className="mt-2">
                  <summary
                    className="inline-flex cursor-pointer list-none items-center gap-1 rounded-full px-2 py-[2px] text-[10.5px] font-bold"
                    style={{
                      background: "var(--wc-soft)",
                      color: "var(--wc-mute)",
                      letterSpacing: "0.02em",
                    }}
                  >
                    벤치 {side.bench.length}
                    <ChevronDown className="h-3 w-3" />
                  </summary>
                  <ol className="mt-1.5 space-y-[3px]">
                    {side.bench.map((p, i) => (
                      <li key={i} className="flex items-center gap-2 text-[11.5px] leading-[1.5]">
                        <span
                          className="gn-num grid h-[17px] w-[17px] shrink-0 place-items-center rounded-full text-[9.5px] font-bold"
                          style={{ background: "var(--wc-soft)", color: "var(--wc-mute)" }}
                        >
                          {p.number ?? "·"}
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

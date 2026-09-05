"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import { FormationPitch, canShowFormation } from "@/components/match/formation-pitch"
import { EmptyScene } from "@/components/empty-scene"
import { Button } from "@/components/ui/button"

/**
 * 경기 라인업 (표시 전용, 2026-08-16) — /api/match/lineup 소비자.
 *
 * ## 조용함이 계약이다
 * - 킥오프 **150분 전보다 이르면** 호출하지 않는다 (있을 리 없는 것을 묻지 않는다).
 *   뒤로는 상한이 없다 — 지난 경기 라인업은 저장분/LFA 로 계속 나온다.
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
  goals?: number
  goalMinutes?: string[]
  ownGoals?: number
  red?: boolean
  subOut?: string | null
  subIn?: string | null
  subPartner?: string
}

/**
 * 인시던트 표기 (2026-08-16, 운영자 조정) —
 * 골·레드카드는 생성 아이콘(public/match/icons/), 교체는 축구 사이트 관행대로
 * **일반 화살표(▼/▲) + 분 + 교체 상대**. 화살표 아이콘은 정신없다는 피드백으로 폐기.
 */
function IncidentIcons({ p, size = 12 }: { p: DisplayPlayer; size?: number }) {
  const goals = p.goals ?? 0
  const ownGoals = p.ownGoals ?? 0
  if (!goals && !ownGoals && !p.red && !p.subOut && !p.subIn) return null
  const img = (src: string, alt: string, key?: string) => (
    // eslint-disable-next-line @next/next/no-img-element -- 12px 고정 소형 아이콘, next/image 불필요
    <img key={key} src={src} alt={alt} width={size} height={size} className="inline-block" />
  )
  return (
    // shrink-0: 선수 이름이 먼저 살아남는다 — 잘리는 건 아래 교체 상대(max-w)뿐
    <span className="inline-flex flex-wrap items-center gap-1.5 align-middle">
      {goals > 0 && (
        <span className="inline-flex items-center gap-[2px]">
          {Array.from({ length: Math.min(goals, 3) }, (_, i) =>
            img("/match/icons/goal.png", "득점", `g${i}`)
          )}
          {p.goalMinutes && p.goalMinutes.length > 0 && (
            <span className="gn-num text-[12px] font-bold" style={{ color: "var(--wc-mute)" }}>
              {p.goalMinutes.join(" ")}
            </span>
          )}
        </span>
      )}
      {ownGoals > 0 && (
        <span className="inline-flex items-center gap-[1px]">
          {img("/match/icons/goal.png", "자책골")}
          <span className="text-[12px] font-bold" style={{ color: "var(--wc-down)" }}>
            OG
          </span>
        </span>
      )}
      {p.red && img("/match/icons/red-card.png", "퇴장")}
      {p.subOut && (
        <span className="inline-flex min-w-0 items-baseline gap-[3px]" title="교체 아웃">
          <span className="text-[12px]" style={{ color: "var(--wc-down)" }}>
            ▼
          </span>
          <span className="gn-num text-[12px]" style={{ color: "var(--wc-mute-2)" }}>
            {p.subOut}
          </span>
          {p.subPartner && (
            <span className="text-[12px] break-words" style={{ color: "var(--wc-mute-2)" }}>
              {p.subPartner}
            </span>
          )}
        </span>
      )}
      {p.subIn && (
        <span className="inline-flex items-baseline gap-[3px]" title="교체 투입">
          <span className="text-[12px]" style={{ color: "var(--wc-go)" }}>
            ▲
          </span>
          <span className="gn-num text-[12px]" style={{ color: "var(--wc-mute-2)" }}>
            {p.subIn}
          </span>
        </span>
      )}
    </span>
  )
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
// ⚠️ 종전엔 킥오프 +24시간 상한이 있었다. 서버의 soccerway 창과 짝을 이루던 값인데,
//    그 창이 화면까지 꺼버려 하루 지난 경기를 열면 라인업 탭이 텅 비었다
//    (2026-08-18 운영자: "서비스가 너무 일관성이 없다"). 이제 상한이 없다 —
//    확보한 라인업은 `match_lineups` 에 남고, 없으면 LFA 가 지난 경기도 준다.
const POLL_MS = 5 * 60 * 1000
const MAX_POLLS = 24

interface MatchLineupProps {
  gameId: string
  /**
   * 서버 선적재 응답 (2026-08-20). 페이지가 getMatchLineup 으로 미리 받아 넘기면
   * ready 일 때 API 왕복 없이 즉시 그린다 — "라인업이 너무 느리다"의 처방 절반.
   * pending/none 이면 종전대로 클라이언트가 조회·폴링한다.
   */
  initial?: LineupResponse | null
  /** betman 킥오프 ISO — 창 판정을 클라에서 먼저 해 창 밖 호출을 0으로 만든다 */
  matchTime: string
  compact?: boolean
  /** 매치 페이지처럼 라인업이 주인공인 곳은 접지 않고 바로 펼친다 (2026-08-16) */
  defaultOpen?: boolean
  /**
   * 포메이션/명단 보기 전환을 제공한다 (매치 센터 전용).
   * 포메이션 파싱이 실패하면 명단만 표시한다.
   */
  withPitch?: boolean
  /** 토글 없이 항상 펼친 상태로 — 탭 안에서는 접기 버튼이 군더더기다 */
  alwaysOpen?: boolean
}

export function MatchLineup({
  gameId,
  matchTime,
  initial,
  compact = false,
  defaultOpen = false,
  withPitch = false,
  alwaysOpen = false,
}: MatchLineupProps) {
  const [data, setData] = useState<LineupResponse | null>(initial ?? null)
  const [open, setOpen] = useState(defaultOpen)
  const [view, setView] = useState<"pitch" | "list">("pitch")
  const [activeSide, setActiveSide] = useState(0)
  const polls = useRef(0)

  useEffect(() => {
    // 서버가 이미 확정 라인업을 넘겼으면 조회할 것이 없다 (발표된 라인업은 불변)
    if (initial?.status === "ready") return
    const kickoff = new Date(matchTime).getTime()
    if (!Number.isFinite(kickoff)) return
    const inWindow = () => {
      const now = Date.now()
      return now >= kickoff - WINDOW_BEFORE_MS
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
  }, [gameId, matchTime, initial])

  if (data?.status !== "ready") {
    // 매치 페이지(alwaysOpen)에서는 빈 방을 남기지 않는다 (2026-08-20 폴리시 2-1) —
    // 탭은 사용자가 명시적으로 부른 화면이라 조용한 대기 블록이 최소 예의다.
    // 스피너·스켈레톤 금지: 기다린다고 오는 것이 아니다. 곁들이 위젯(betting 카드 등)은
    // 종전대로 조용히 사라진다.
    if (alwaysOpen) {
      const t = new Date(matchTime)
      const kickoffLabel = Number.isFinite(t.getTime())
        ? t.toLocaleString("ko-KR", {
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "Asia/Seoul",
          })
        : null
      return (
        <div
          className="rounded-xl px-4 py-8 text-center"
          style={{ background: "var(--wc-soft)", color: "var(--wc-mute)" }}
        >
          {/* 빈 더그아웃 + 백지 전술판 삽화 (P2) — 대기가 "고장"이 아니라 "발표 전"으로 읽히게 */}
          <EmptyScene src="/images/empty/empty-lineup-wait.webp" size={260} />
          <p className="mt-3 text-[13px] font-semibold">라인업은 킥오프 약 1시간 전에 공개됩니다</p>
          {kickoffLabel && (
            <p className="mt-1 text-[12px]" style={{ color: "var(--wc-mute-2)" }}>
              킥오프 <span className="gn-num font-bold">{kickoffLabel}</span> KST
            </p>
          )}
        </div>
      )
    }
    return null
  }
  const shown = alwaysOpen || open
  const pitchAvailable = withPitch && canShowFormation(data.home) && canShowFormation(data.away)
  const showPitch = pitchAvailable && view === "pitch"

  return (
    <div className={compact ? "mt-2" : "mt-2.5"}>
      {!alwaysOpen && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          선발 라인업
          <ChevronDown aria-hidden className={open ? "rotate-180" : ""} />
        </Button>
      )}
      {shown && (
        <div className="space-y-4">
          {withPitch && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-bold" style={{ color: "var(--wc-ink)" }}>
                  라인업
                </h2>
                <p className="mt-1 text-[12px]" style={{ color: "var(--wc-mute)" }}>
                  {showPitch ? "선발 배치 · 교체 기록은 선수 명단에서" : "선발 선수와 교체 기록"}
                </p>
              </div>
              {pitchAvailable && (
                <div role="group" aria-label="라인업 보기 방식" className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={showPitch ? "default" : "ghost"}
                    aria-pressed={showPitch}
                    onClick={() => setView("pitch")}
                  >
                    포메이션
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={!showPitch ? "default" : "ghost"}
                    aria-pressed={!showPitch}
                    onClick={() => setView("list")}
                  >
                    선수 명단
                  </Button>
                </div>
              )}
            </div>
          )}
          <div role="group" aria-label="라인업 팀 선택" className="flex flex-wrap gap-2 sm:hidden">
            {[data.home, data.away].map((side, i) => (
              <Button
                key={i}
                type="button"
                size="sm"
                variant={activeSide === i ? "default" : "outline"}
                aria-pressed={activeSide === i}
                onClick={() => setActiveSide(i)}
              >
                {side.teamLabel}
              </Button>
            ))}
          </div>
          {showPitch && (
            <FormationPitch home={data.home} away={data.away} activeSide={activeSide} />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {[data.home, data.away].map((side, i) => (
              <section
                key={i}
                aria-label={side.teamLabel + " 선수 명단"}
                className={activeSide === i ? "min-w-0" : "hidden min-w-0 sm:block"}
              >
                {!showPitch && (
                  <div className="rounded-xl border border-[var(--wc-line)] p-3">
                    <div className="mb-2 flex items-center justify-between gap-2 px-1">
                      <h3 className="text-[14px] font-bold" style={{ color: "var(--wc-ink)" }}>
                        {side.teamLabel}
                      </h3>
                      <span
                        className="gn-num shrink-0 text-[12px]"
                        style={{ color: "var(--wc-mute)" }}
                      >
                        {side.formation ?? "포메이션 미제공"}
                      </span>
                    </div>
                    <PlayerList players={side.starters} label={side.teamLabel + " 선발 선수"} />
                  </div>
                )}
                {side.bench.length > 0 && (
                  <details
                    className="group mt-3 rounded-xl border border-[var(--wc-line)] px-3"
                    open={side.bench.some((p) => p.subIn)}
                  >
                    <summary
                      className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-[13px] font-semibold"
                      style={{ color: "var(--wc-mute)" }}
                    >
                      <span>
                        {side.teamLabel} · 벤치 <span className="gn-num">{side.bench.length}</span>
                      </span>
                      <ChevronDown aria-hidden className="size-4 group-open:rotate-180" />
                    </summary>
                    <PlayerList players={side.bench} label={side.teamLabel + " 벤치 선수"} />
                  </details>
                )}
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PlayerList({ players, label }: { players: DisplayPlayer[]; label: string }) {
  return (
    <ol aria-label={label} className="divide-y divide-[var(--wc-line)]">
      {players.map((p, i) => (
        <li key={i} className="flex min-h-11 items-center gap-3 py-2">
          <span
            className="gn-num grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-bold"
            style={{ background: "var(--wc-soft)", color: "var(--wc-burgundy)" }}
          >
            {p.number ?? "·"}
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-medium break-words" style={{ color: "var(--wc-ink)" }}>
              {p.label}
            </p>
            <IncidentIcons p={p} />
          </div>
        </li>
      ))}
    </ol>
  )
}

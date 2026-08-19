"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import { FormationPitch } from "@/components/match/formation-pitch"
import { EmptyScene } from "@/components/empty-scene"

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
    <span className="inline-flex shrink-0 items-center gap-[4px] align-middle">
      {goals > 0 && (
        <span className="inline-flex items-center gap-[2px]">
          {Array.from({ length: Math.min(goals, 3) }, (_, i) =>
            img("/match/icons/goal.png", "득점", `g${i}`)
          )}
          {p.goalMinutes && p.goalMinutes.length > 0 && (
            <span className="gn-num text-[9.5px] font-bold" style={{ color: "var(--wc-mute)" }}>
              {p.goalMinutes.join(" ")}
            </span>
          )}
        </span>
      )}
      {ownGoals > 0 && (
        <span className="inline-flex items-center gap-[1px]">
          {img("/match/icons/goal.png", "자책골")}
          <span className="text-[9px] font-bold" style={{ color: "var(--wc-down, #c03a3a)" }}>
            OG
          </span>
        </span>
      )}
      {p.red && img("/match/icons/red-card.png", "퇴장")}
      {p.subOut && (
        <span className="inline-flex min-w-0 items-baseline gap-[3px]" title="교체 아웃">
          <span className="text-[9px]" style={{ color: "var(--wc-down, #c03a3a)" }}>
            ▼
          </span>
          <span className="gn-num text-[9.5px]" style={{ color: "var(--wc-mute-2)" }}>
            {p.subOut}
          </span>
          {p.subPartner && (
            <span
              className="max-w-[64px] truncate text-[9.5px]"
              style={{ color: "var(--wc-mute-2)" }}
            >
              {p.subPartner}
            </span>
          )}
        </span>
      )}
      {p.subIn && (
        <span className="inline-flex items-baseline gap-[3px]" title="교체 투입">
          <span className="text-[9px]" style={{ color: "var(--wc-go, #2f7d5b)" }}>
            ▲
          </span>
          <span className="gn-num text-[9.5px]" style={{ color: "var(--wc-mute-2)" }}>
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
   * 포메이션 피치를 목록 위에 그린다 (매치 센터 전용, 2026-08-17).
   * 포메이션 파싱이 실패하면 스스로 빠지고 목록만 남는다.
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
          <p className="mt-3 text-[13.5px] font-semibold">
            라인업은 킥오프 약 1시간 전에 공개됩니다
          </p>
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

  return (
    <div className={compact ? "mt-2" : "mt-2.5"}>
      {!alwaysOpen && (
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
      )}

      {withPitch && shown && (
        <div className="mb-3">
          <FormationPitch home={data.home} away={data.away} />
        </div>
      )}

      {/* 편집 지면 문법 (2026-08-16 리디자인) — 베이지 패널을 걷어내고 흰 지면 위에
          괘선으로만 구조를 세운다. 등번호는 와인 틴트 칩, 포메이션은 pill. */}
      {shown && (
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
                    <IncidentIcons p={p} />
                  </li>
                ))}
              </ol>
              {side.bench.length > 0 && (
                // 교체 투입이 있으면 기본 펼침 — 누가 들어왔는지가 접혀 있으면 의미가 없다
                <details className="mt-2" open={side.bench.some((p) => p.subIn)}>
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
                        <IncidentIcons p={p} size={11} />
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

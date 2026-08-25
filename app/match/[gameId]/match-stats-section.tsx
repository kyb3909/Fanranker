import type { LfaMatchInfo, LfaTimelineEvent } from "@/lib/lfa/match"

/**
 * 매치 타임라인 + 경기 스탯 (2026-08-17 → 2026-08-19 데이터 회수 1차).
 *
 * live-football-api 의 구조화된 데이터라 LLM 추출 단계가 없다 — 환각이 원천적으로 없고
 * betman 종료 반영(1~1.5시간 지연)을 기다리지 않는다. 지표 한글화·숫자 정규화는
 * lib/lfa/match.ts 가 끝낸 상태로 온다 (뜻이 불확실한 지표는 거기서 버려진다).
 *
 * 타임라인 위계 (팬 패널 재방문 1순위 "완전한 타임라인" — 단 전부 같은 크기면 소음이다):
 *   골(어시·PK·자책) 굵게 > 카드 중간 > 교체 작게·mute. 전·후반 사이에 전반 스코어 괘선.
 */

/** "45 +4" → 45.04 (추가시간은 소수부로 — 정렬·전후반 판정용) */
function minuteKey(minute: string): number {
  const m = minute.match(/^(\d+)(?:\s*\+\s*(\d+))?/)
  if (!m) return 0
  return Number(m[1]) + (m[2] ? Math.min(Number(m[2]), 99) / 100 : 0)
}

/** 카드 색 — 실물 카드의 픽토그램이라 시맨틱 (빨강은 토큰 통일, 2026-08-19 감리 A-3) */
function CardSquare({ kind }: { kind: "yellow" | "red" }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 self-center rounded-[2px]"
      style={{
        width: 9,
        height: 12,
        background: kind === "red" ? "var(--wc-down)" : "#e2b93b",
      }}
    />
  )
}

function TimelineRow({
  e,
  teamOf,
}: {
  e: LfaTimelineEvent
  teamOf: (side: "home" | "away") => string
}) {
  const isScore = e.kind === "goal" || e.kind === "pen" || e.kind === "og"

  if (e.kind === "sub") {
    // 교체는 라인업 탭과 같은 관행 표기(▼ 아웃 ▲ 인) — 가장 조용한 층위
    return (
      <li className="flex items-baseline gap-2 text-[12px]" style={{ color: "var(--wc-mute-2)" }}>
        <span className="gn-num shrink-0 text-right text-[12px] font-bold" style={{ minWidth: 30 }}>
          {e.minute}&apos;
        </span>
        <span className="min-w-0 truncate">
          {/* 시스템 폰트 ▼▲ 글리프는 크기·베이스라인이 텍스트와 안 맞는다 (감리 A-3) —
              8px SVG 화살촉으로. 인(들어옴)만 잉크로 올려 기호에 위계를 만든다. */}
          <svg aria-hidden viewBox="0 0 8 8" className="mr-0.5 inline-block h-[8px] w-[8px]">
            <path d="M1 2.5h6L4 6.5Z" fill="currentColor" />
          </svg>
          {e.player}
          {e.inPlayer && (
            <>
              {" "}
              <svg
                aria-hidden
                viewBox="0 0 8 8"
                className="mr-0.5 inline-block h-[8px] w-[8px]"
                style={{ color: "var(--wc-ink)" }}
              >
                <path d="M1 5.5h6L4 1.5Z" fill="currentColor" />
              </svg>
              <span style={{ color: "var(--wc-mute)" }}>{e.inPlayer}</span>
            </>
          )}
        </span>
        <span className="ml-auto shrink-0 text-[12px]">{teamOf(e.side)}</span>
      </li>
    )
  }

  return (
    <li className="flex items-baseline gap-2 text-[13px]">
      <span
        className="gn-num shrink-0 text-right text-[12px] font-bold"
        style={{ color: isScore ? "var(--wc-burgundy)" : "var(--wc-mute-2)", minWidth: 30 }}
      >
        {e.minute}&apos;
      </span>
      {(e.kind === "red" || e.kind === "yellow") && <CardSquare kind={e.kind} />}
      <span className="min-w-0 truncate">
        <span
          className={isScore ? "font-bold" : "font-semibold"}
          style={{ color: "var(--wc-ink)" }}
        >
          {e.player}
        </span>
        {e.kind === "pen" && (
          <span className="text-[12px] font-bold" style={{ color: "var(--wc-mute)" }}>
            {" "}
            (PK)
          </span>
        )}
        {e.kind === "og" && (
          <span className="text-[12px] font-bold" style={{ color: "var(--wc-mute)" }}>
            {" "}
            (자책)
          </span>
        )}
        {e.assist && (
          <span className="text-[12px]" style={{ color: "var(--wc-mute)" }}>
            {" "}
            · 도움 {e.assist}
          </span>
        )}
      </span>
      <span className="shrink-0 text-[12px]" style={{ color: "var(--wc-mute)" }}>
        {teamOf(e.side)}
        {e.kind === "red" ? " · 퇴장" : ""}
      </span>
      {e.score && (
        <span
          className="gn-num ml-auto shrink-0 text-[12px] font-bold"
          style={{ color: "var(--wc-mute)" }}
        >
          {e.score}
        </span>
      )}
    </li>
  )
}

export function MatchStatsSection({
  info,
  homeTeam,
  awayTeam,
  hideTimeline = false,
}: {
  info: LfaMatchInfo
  homeTeam: string
  awayTeam: string
  /** 불판에선 전광판이 타임라인을 이미 보여준다 — 스탯 바만 (2026-08-20) */
  hideTimeline?: boolean
}) {
  // 교체는 싣지 않는다 (2026-08-20 운영자: "통계에 안 나와도 될듯") — 교체는 라인업
  // 탭(▼▲)과 불판 전광판이 담당한다. 여기 타임라인은 골·카드만: 경기의 결정 장면.
  const timeline = [...info.timeline]
    .filter((e) => e.kind !== "sub")
    .sort((a, b) => minuteKey(a.minute) - minuteKey(b.minute))
  const hasStats = info.stats.length > 0
  if (timeline.length === 0 && !hasStats) return null

  const teamOf = (side: "home" | "away") => (side === "home" ? homeTeam : awayTeam)
  // 전·후반 경계 — "45 +N" 은 전반 추가시간이므로 46 미만까지가 전반이다
  const firstHalf = timeline.filter((e) => minuteKey(e.minute) < 46)
  const secondHalf = timeline.filter((e) => minuteKey(e.minute) >= 46)
  const hasHt = info.htHome != null && info.htAway != null

  return (
    <>
      {/* 말이 통계 탭이니 스탯이 먼저다 (2026-08-20 운영자) — 타임라인은 그 아래 */}
      {hasStats && (
        <section>
          <h2 className="sheet-lab">경기 스탯</h2>
          <div
            className="mt-1 flex items-baseline justify-between text-[12px] font-bold"
            style={{ color: "var(--wc-mute)" }}
          >
            <span className="truncate">{homeTeam}</span>
            <span className="truncate">{awayTeam}</span>
          </div>
          <ul className="mt-2 space-y-2.5">
            {info.stats.map((s) => {
              const total = s.homeNum != null && s.awayNum != null ? s.homeNum + s.awayNum : null
              const homePct = total && total > 0 ? (s.homeNum! / total) * 100 : 50
              return (
                <li key={s.label}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className="gn-num text-[14px] font-bold"
                      style={{ color: "var(--wc-ink)" }}
                    >
                      {s.home}
                    </span>
                    <span className="text-[12px] font-bold" style={{ color: "var(--wc-mute)" }}>
                      {s.label}
                    </span>
                    <span
                      className="gn-num text-[14px] font-bold"
                      style={{ color: "var(--wc-ink)" }}
                    >
                      {s.away}
                    </span>
                  </div>
                  <div
                    aria-hidden
                    className="mt-1 flex h-[5px] gap-[3px] overflow-hidden rounded-full"
                  >
                    <span
                      style={{
                        width: `${homePct}%`,
                        background: "var(--wc-burgundy)",
                        borderRadius: 99,
                      }}
                    />
                    {/* 상대 팀을 회색으로 칠하면 "비어 있음"으로 읽혀 바가 거짓말을 한다 */}
                    <span
                      className="flex-1"
                      style={{ background: "var(--wc-ink)", opacity: 0.75, borderRadius: 99 }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}
      {!hideTimeline && timeline.length > 0 && (
        <section className={hasStats ? "mt-8" : ""}>
          <h2 className="sheet-lab">타임라인</h2>
          <ul className="mt-2 space-y-1.5">
            {firstHalf.map((e, i) => (
              <TimelineRow key={`f${i}`} e={e} teamOf={teamOf} />
            ))}
            {hasHt && (
              <li aria-label="전반 종료" className="flex items-center gap-3 py-1">
                <span
                  aria-hidden
                  className="h-px flex-1"
                  style={{ background: "var(--wc-line-2)" }}
                />
                <span
                  className="shrink-0 text-[12px] font-bold"
                  style={{ color: "var(--wc-mute-2)" }}
                >
                  전반{" "}
                  <span className="gn-num">
                    {info.htHome}-{info.htAway}
                  </span>
                </span>
                <span
                  aria-hidden
                  className="h-px flex-1"
                  style={{ background: "var(--wc-line-2)" }}
                />
              </li>
            )}
            {secondHalf.map((e, i) => (
              <TimelineRow key={`s${i}`} e={e} teamOf={teamOf} />
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

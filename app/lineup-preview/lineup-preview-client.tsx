"use client"

import { useEffect, useState } from "react"
import { MatchLineup } from "@/components/match/match-lineup"

/**
 * 라인업 검증 프리뷰 목록 (미공개 페이지 전용).
 *
 * 경기마다 두 층을 그린다:
 *  1. 상태 배지 — 이 페이지에서만 /api/match/lineup 을 직접 불러 none/pending/ready 를
 *     그대로 보여준다. 검증 페이지의 존재 이유: "안 뜨는 게 정상(매핑 없음)인지
 *     고장인지"를 눈으로 가리는 것.
 *  2. 실사용 컴포넌트(MatchLineup) — 카드에 실릴 바로 그 UI. ready 일 때만 토글이 뜬다
 *     (fail-open 계약까지 포함해 그대로 검증).
 */

export interface PreviewMatch {
  gameId: string
  leagueCode: string
  homeTeam: string
  awayTeam: string
  matchTime: string
}

type ProbeStatus = "loading" | "none" | "pending" | "ready" | "error"

const STATUS_LABEL: Record<ProbeStatus, { text: string; bg: string; fg: string }> = {
  loading: { text: "확인 중…", bg: "var(--wc-soft)", fg: "var(--wc-mute)" },
  none: { text: "라인업 없음 (매핑 없음/창 밖)", bg: "var(--wc-soft)", fg: "var(--wc-mute)" },
  pending: { text: "발표 대기 — 매핑 OK", bg: "#fff7e6", fg: "#9a6b1a" },
  ready: { text: "라인업 도착", bg: "#e9f7ef", fg: "#1e7a4a" },
  error: { text: "조회 실패", bg: "#fdeeee", fg: "#a33" },
}

function fmtKst(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  })
}

function StatusBadge({ gameId }: { gameId: string }) {
  const [status, setStatus] = useState<ProbeStatus>("loading")
  useEffect(() => {
    let dead = false
    fetch(`/api/match/lineup?gameId=${gameId}`)
      .then((r) => r.json())
      .then((j: { status?: string }) => {
        if (dead) return
        setStatus(
          j.status === "ready" || j.status === "pending" || j.status === "none" ? j.status : "error"
        )
      })
      .catch(() => !dead && setStatus("error"))
    return () => {
      dead = true
    }
  }, [gameId])
  const s = STATUS_LABEL[status]
  return (
    <span
      className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.text}
    </span>
  )
}

export function LineupPreviewClient({ matches }: { matches: PreviewMatch[] }) {
  return (
    <div className="worldcup-scope min-h-[80vh]">
      <main className="mx-auto max-w-[760px] px-4 py-8 sm:px-6">
        <p
          className="text-[11px] font-extrabold uppercase"
          style={{ color: "var(--wc-mute-2)", letterSpacing: "0.14em" }}
        >
          Unlisted Preview
        </p>
        <h1 className="mt-1 text-[24px] font-extrabold" style={{ color: "var(--wc-ink)" }}>
          선발 라인업 검증
        </h1>
        <p className="mt-1.5 text-[13px]" style={{ color: "var(--wc-mute)" }}>
          오늘 윈도우의 축구 경기 {matches.length}건. 라인업은 팀 사전에 등재된 경기(매핑
          proposed)에서 킥오프 약 1시간 전부터 뜹니다 — &ldquo;라인업 없음&rdquo;은 대부분 사전
          미등재가 원인입니다.
        </p>

        <ul className="mt-6 space-y-3">
          {matches.length === 0 && (
            <li
              className="rounded-xl p-6 text-center text-[13px]"
              style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
            >
              오늘 윈도우에 축구 경기가 없습니다.
            </li>
          )}
          {matches.map((m) => (
            <li
              key={m.gameId}
              className="rounded-xl px-4 py-3.5"
              style={{ background: "var(--wc-card)", border: "1px solid var(--wc-line)" }}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span
                  className="gn-num shrink-0 text-[11px] font-bold"
                  style={{ color: "var(--wc-mute-2)" }}
                >
                  {fmtKst(m.matchTime)}
                </span>
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-bold"
                  style={{ background: "var(--wc-soft)", color: "var(--wc-mute)" }}
                >
                  {m.leagueCode}
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-[14px] font-bold"
                  style={{ color: "var(--wc-ink)" }}
                >
                  {m.homeTeam} <span style={{ color: "var(--wc-mute-2)" }}>vs</span> {m.awayTeam}
                </span>
                <StatusBadge gameId={m.gameId} />
              </div>
              {/* 실사용 컴포넌트 그대로 — ready 일 때만 토글이 나타난다 */}
              <MatchLineup gameId={m.gameId} matchTime={m.matchTime} compact />
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}

"use client"

import { useState } from "react"
import Link from "@/components/ui/app-link"

/**
 * 사가 인덱스 본문 — **경기가 먼저** (2026-08-25 운영자).
 *
 * 종전엔 이적설 140건이 한 줄로 쏟아졌다. 운영자 지시는 "경기가 가장 중요하니까
 * 했던 경기들 내역이 나오고, 확장했을 때 그 경기 리포트가 나와야 한다"였다.
 * 그래서 기본 탭이 **경기**고, 각 행은 접힌 채로 있다가 눌러야 리포트가 펼쳐진다.
 *
 * ⚠️ 리포트는 대상 구단 경기에만 붙는다(`lib/soccerway/report-clubs.ts`). 없는 경기도
 *    목록엔 남긴다 — 없는 걸 숨기면 "왜 그 경기가 없지"가 되고, 남겨두면 매치센터로 간다.
 */

export interface MatchItem {
  key: string
  gameId: string
  home: string
  away: string
  homeScore: number | null
  awayScore: number | null
  matchTime: string
  league: string | null
  report: { title: string; paragraphs: string[] } | null
}

/** 행에 찍는 라벨과 **같은 기준**(로컬 월/일)으로 비교해야 한다 — 안 그러면 경계가 어긋난다 */
function sameDay(aIso: string, bIso: string): boolean {
  const a = new Date(aIso)
  const b = new Date(bIso)
  return a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function ScoreCell({ h, a }: { h: number | null; a: number | null }) {
  if (h == null || a == null) {
    return (
      <span className="text-[13px] font-bold" style={{ color: "var(--wc-mute-2)" }}>
        –
      </span>
    )
  }
  return (
    <span
      className="gn-num text-[16px] font-extrabold tabular-nums"
      style={{ color: "var(--wc-ink)" }}
    >
      {h}
      <span style={{ color: "var(--wc-mute-2)" }}>:</span>
      {a}
    </span>
  )
}

/**
 * `showDate` — 같은 날 경기가 연달아 오면 날짜를 한 번만 찍는다.
 * 27행이 8.21~8.28 뿐이라 왼쪽 칼럼에 "8.28 8.28 8.28 8.28" 이 쌓였다. 반복을 지우면
 * 날짜가 바뀌는 자리가 곧 그룹 경계로 읽힌다 — 구분선을 새로 그리지 않고 얻는 위계다.
 * 자리는 그대로 비워 둔다(폭 유지) — 안 그러면 행마다 제목 시작점이 달라진다.
 */
function MatchRow({ m, showDate }: { m: MatchItem; showDate: boolean }) {
  const [open, setOpen] = useState(false)
  const day = new Date(m.matchTime)
  const label = `${day.getMonth() + 1}.${day.getDate()}`

  return (
    <div
      className="rounded-xl"
      style={{ background: "var(--wc-card, #fff)", boxShadow: "var(--wc-shadow-1)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span
          className="w-10 shrink-0 text-[12px] font-bold tabular-nums"
          style={{ color: "var(--wc-mute)" }}
          suppressHydrationWarning
        >
          {showDate ? label : ""}
        </span>

        <span
          className="min-w-0 flex-1 truncate text-[14px] font-bold"
          style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
        >
          {m.home} <span style={{ color: "var(--wc-mute-2)" }}>vs</span> {m.away}
        </span>

        <ScoreCell h={m.homeScore} a={m.awayScore} />

        {/* 리포트 유무를 접기 전에 알려준다 — 열어보고 비어 있으면 그게 데드엔드다 */}
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[12px] font-extrabold"
          style={
            m.report
              ? { background: "rgba(150,30,55,.08)", color: "var(--wc-burgundy)" }
              : { background: "var(--wc-line)", color: "var(--wc-mute)" }
          }
        >
          {m.report ? "리포트" : "기록"}
        </span>

        <span
          aria-hidden
          className="shrink-0 text-[12px] transition-transform"
          style={{
            color: "var(--wc-mute)",
            transform: open ? "rotate(90deg)" : "none",
          }}
        >
          ▶
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4" style={{ borderTop: "1px solid var(--wc-line)" }}>
          {m.report ? (
            <>
              <h3
                className="mt-3 text-[16px] font-extrabold"
                style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
              >
                {m.report.title}
              </h3>
              <div className="mt-2 flex flex-col gap-2">
                {m.report.paragraphs.map((p, i) => (
                  <p
                    key={i}
                    className="text-[14px] leading-relaxed"
                    style={{ color: "var(--wc-ink-2, var(--wc-ink))", wordBreak: "keep-all" }}
                  >
                    {p}
                  </p>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-3 text-[13px]" style={{ color: "var(--wc-mute)" }}>
              이 경기는 아직 리포트가 없습니다 — 라인업·기록은 매치 센터에서 볼 수 있습니다.
            </p>
          )}
          <Link
            href={`/match/${m.gameId}`}
            className="mt-3 inline-block text-[13px] font-extrabold"
            style={{ color: "var(--wc-burgundy)" }}
          >
            매치 센터에서 보기 →
          </Link>
        </div>
      )}
    </div>
  )
}

export function SagaBrowser({
  matches,
  transfers,
}: {
  matches: MatchItem[]
  transfers: React.ReactNode
}) {
  // 기본은 경기 — 운영자 확정. 이적설은 눌러야 펼쳐진다.
  const [tab, setTab] = useState<"match" | "transfer">("match")

  const chip = (active: boolean) => ({
    background: active ? "var(--wc-burgundy)" : "var(--wc-card, #fff)",
    color: active ? "#fff" : "var(--wc-mute)",
    boxShadow: active ? "none" : "var(--wc-shadow-1)",
  })

  return (
    <>
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setTab("match")}
          aria-pressed={tab === "match"}
          className="rounded-full px-4 py-1.5 text-[13px] font-extrabold"
          style={chip(tab === "match")}
        >
          경기 {matches.length}
        </button>
        <button
          type="button"
          onClick={() => setTab("transfer")}
          aria-pressed={tab === "transfer"}
          className="rounded-full px-4 py-1.5 text-[13px] font-extrabold"
          style={chip(tab === "transfer")}
        >
          이적설
        </button>
      </div>

      {tab === "match" ? (
        matches.length === 0 ? (
          <p className="py-16 text-center text-[14px]" style={{ color: "var(--wc-mute)" }}>
            최근 끝난 경기가 없습니다.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {matches.map((m, i) => (
              <MatchRow
                key={m.key}
                m={m}
                showDate={i === 0 || !sameDay(matches[i - 1].matchTime, m.matchTime)}
              />
            ))}
          </div>
        )
      ) : (
        transfers
      )}
    </>
  )
}

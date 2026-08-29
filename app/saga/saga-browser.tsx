"use client"

import { useState } from "react"
import Link from "@/components/ui/app-link"
import { Chip } from "@/components/saga/tier-chip"
import { RAIL_BODY_BORDER, RAIL_GRID, RailDate, groupByDay } from "@/components/saga/rail"

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

/* sameDay·ScoreCell 은 카드 한 줄 배치에만 쓰이던 것이라 같이 뺐다.
   날짜 경계는 이제 공용 groupByDay(KST 기준)가 잡는다 — 종전 sameDay 는 로컬 시각으로
   비교해서 서버·클라이언트가 갈릴 여지가 있었고 그래서 suppressHydrationWarning 이
   붙어 있었다. KST 고정이라 그 회피책도 필요 없어졌다. */

/**
 * 경기 한 줄 — 사가 공용 헤어라인 문법 (2026-08-29 운영자 "안 B").
 *
 * 종전엔 흰 카드에 날짜·팀·점수·칩·꺾쇠를 전부 한 줄로 욱여넣었다. 이제 다른 사가
 * 지면과 같이 [칩] 제목 / 메타 한 줄이고, 날짜는 왼쪽 레일이 하루 한 번 맡는다.
 * 점수는 제목 안으로 들어간다 — "크리스털 팰리스 1–4 맨체스터 시티" 가 곧 그 경기다.
 */
function MatchRow({ m }: { m: MatchItem }) {
  const [open, setOpen] = useState(false)
  const played = m.homeScore != null && m.awayScore != null

  return (
    <div style={RAIL_BODY_BORDER}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 py-3 pl-4 text-left sm:pl-6"
      >
        <span className="min-w-0 flex-1">
          <span
            className="block text-[16px] leading-[1.4] font-bold"
            style={{ color: "var(--wc-ink)", wordBreak: "keep-all" }}
          >
            {/* 리포트 유무를 접기 전에 알려준다 — 열어보고 비어 있으면 그게 데드엔드다 */}
            <span className="mr-1.5">
              <Chip tone={m.report ? "wine" : "line"}>{m.report ? "리포트" : "기록"}</Chip>
            </span>
            {m.home}
            {played ? (
              <b className="gn-num mx-1.5">
                {m.homeScore}–{m.awayScore}
              </b>
            ) : (
              <span className="mx-1.5" style={{ color: "var(--wc-mute-2)" }}>
                vs
              </span>
            )}
            {m.away}
          </span>
          <span className="mt-1.5 block text-[12px]" style={{ color: "var(--wc-mute)" }}>
            {m.league ?? "경기"} · {open ? "접기" : m.report ? "리포트 펼치기" : "기록 보기"}
          </span>
        </span>

        <span
          aria-hidden
          className="mt-1 shrink-0 text-[12px] transition-transform"
          style={{
            color: "var(--wc-mute)",
            transform: open ? "rotate(90deg)" : "none",
          }}
        >
          ▶
        </span>
      </button>

      {open && (
        <div className="pb-4 pl-4 sm:pl-6">
          {m.report ? (
            <>
              <h3
                className="text-[16px] font-extrabold"
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
            <p className="text-[13px]" style={{ color: "var(--wc-mute)" }}>
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
          <div className="flex flex-col">
            {groupByDay(matches, (m) => m.matchTime).map((day, di) => (
              <div
                key={day.key}
                className={RAIL_GRID}
                style={di > 0 ? { marginTop: 20 } : undefined}
              >
                <RailDate iso={day.iso} />
                <div>
                  {day.items.map((m) => (
                    <MatchRow key={m.key} m={m} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        transfers
      )}
    </>
  )
}

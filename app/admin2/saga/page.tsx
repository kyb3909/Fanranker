"use client"

import { useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { toast } from "@/hooks/use-toast"

/**
 * /admin2/saga — 사가 검수 큐 (W3). 발행의 유일한 경로 (HITL 게이트).
 *
 * 한 항목 = 기사 하나. 추출기가 채운 선수/방향/단계/한글 헤드라인을 확인·수정 후
 * [발행]하면 사가 문서에 엔트리로 붙는다 (같은 이벤트가 이미 있으면 에코로 접힘).
 * 디자인은 추후 개편 예정 — 지금은 기능 검증용 최소 화면.
 */

const STAGE_OPTIONS = [
  { value: "", label: "신호 없음" },
  { value: "interest", label: "관심" },
  { value: "contact", label: "접촉" },
  { value: "bid", label: "제안" },
  { value: "negotiation", label: "협상" },
  { value: "medical", label: "메디컬" },
  { value: "done", label: "오피셜" },
]

interface QueueRow {
  id: string
  source_url: string
  source: { kind?: string; outlet?: string; feed?: string }
  title: string
  headline_kr: string | null
  extracted: {
    player: string | null
    player_kr: string | null
    direction: "in" | "out"
    clubs: string[]
    stage_signal: string | null
    headline_ko: string | null
    confidence: number
    tier?: "official" | "tier1" | "rumor"
  } | null
  saga_hint: string | null
  occurred_at: string
}

interface SagaInfo {
  identity_key: string
  slug: string
  title: string
  stage: string
  entry_count: number
  status: string
}

const TIER_LABEL = { official: "🟢오피셜", tier1: "🔵티어1", rumor: "⚪루머" } as const

function RowCard({
  row,
  saga,
  onDone,
}: {
  row: QueueRow
  saga: SagaInfo | undefined
  onDone: () => void
}) {
  const ex = row.extracted
  const [player, setPlayer] = useState(ex?.player ?? "")
  const [playerKr, setPlayerKr] = useState(ex?.player_kr ?? "")
  const [direction, setDirection] = useState<"in" | "out">(ex?.direction ?? "in")
  const [stage, setStage] = useState(ex?.stage_signal ?? "")
  const [headline, setHeadline] = useState(ex?.headline_ko ?? row.headline_kr ?? "")
  const [busy, setBusy] = useState(false)

  const act = async (action: "publish" | "reject") => {
    setBusy(true)
    try {
      const res = await fetch("/api/admin2/saga", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          action,
          edits:
            action === "publish"
              ? {
                  player,
                  player_kr: playerKr || null,
                  direction,
                  stage_signal: stage || null,
                  headline_ko: headline || undefined,
                }
              : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: data.error ?? "처리 실패", variant: "destructive" })
        return
      }
      if (action === "publish") {
        toast({
          title: data.folded ? "에코로 접힘" : "발행됨",
          description: `${data.saga.title} (/saga/${data.saga.slug})`,
        })
      } else {
        toast({ title: "반려됨" })
      }
      onDone()
    } finally {
      setBusy(false)
    }
  }

  const conf = ex?.confidence ?? 0
  return (
    <div className="rounded-lg border p-3 text-sm">
      <div className="flex items-start gap-2">
        <span className="shrink-0 text-xs">{TIER_LABEL[ex?.tier ?? "rumor"]}</span>
        <p className="min-w-0 flex-1 font-medium break-words">{row.title}</p>
        <span
          className={`shrink-0 rounded px-1 text-[11px] tabular-nums ${conf < 0.6 ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"}`}
        >
          {Math.round(conf * 100)}%
        </span>
      </div>
      <p className="text-muted-foreground mt-0.5 text-xs">
        {row.source?.kind === "rss" ? `RSS · ${row.source.outlet}` : "티커"} ·{" "}
        {new Date(row.occurred_at).toLocaleString("ko-KR")} ·{" "}
        <a
          href={row.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          원문
        </a>
      </p>

      {/* 신규 생성 마찰 (PM 토론 #3) — 오추출의 폭발 반경은 "잘못된 새 문서 생성"에
          집중되므로, 기존 사가에 쌓이는 건은 가볍게, 새 문서가 열리는 건만 경고 */}
      {!saga && (
        <p className="mt-1.5 rounded bg-blue-50 px-2 py-1 text-xs font-bold text-blue-800">
          ⚠️ 발행하면 <b>새 사가 문서가 생성</b>됩니다 — 선수명(오식별 주의)·방향을 확인하세요
        </p>
      )}
      {saga && (
        <p className="mt-1.5 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
          기존 사가에 쌓임:{" "}
          <a
            href={`/saga/${saga.slug}`}
            target="_blank"
            className="font-bold underline"
            rel="noreferrer"
          >
            {saga.title}
          </a>{" "}
          (엔트리 {saga.entry_count} · {saga.status})
        </p>
      )}

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="flex flex-col gap-0.5 text-xs">
          선수 (영문 키)
          <input
            value={player}
            onChange={(e) => setPlayer(e.target.value)}
            className="rounded border px-1.5 py-1"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs">
          한글 표기
          <input
            value={playerKr}
            onChange={(e) => setPlayerKr(e.target.value)}
            className="rounded border px-1.5 py-1"
            placeholder="(사전 미등재)"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs">
          방향
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as "in" | "out")}
            className="rounded border px-1.5 py-1"
          >
            <option value="in">IN (영입 드라마)</option>
            <option value="out">OUT (순수 이탈)</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-xs">
          단계 신호
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="rounded border px-1.5 py-1"
          >
            {STAGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-2 flex flex-col gap-0.5 text-xs">
        한국어 헤드라인 (타임라인에 이대로 실림)
        <input
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          className="rounded border px-1.5 py-1"
        />
      </label>

      <div className="mt-2 flex gap-2">
        <button
          onClick={() => act("publish")}
          disabled={busy || !player || !headline}
          className="bg-foreground text-background rounded px-3 py-1 text-xs font-bold disabled:opacity-40"
        >
          발행
        </button>
        <button
          onClick={() => act("reject")}
          disabled={busy}
          className="rounded border px-3 py-1 text-xs disabled:opacity-40"
        >
          반려
        </button>
      </div>
    </div>
  )
}

export default function SagaReviewPage() {
  const { data, mutate } = useSWR<{ queue: QueueRow[]; sagas: SagaInfo[] }>(
    "/api/admin2/saga",
    fetcher,
    { refreshInterval: 60_000 }
  )
  const sagaByKey = new Map((data?.sagas ?? []).map((s) => [s.identity_key, s]))
  const queue = data?.queue ?? []

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-bold">
          사가 검수 <span className="text-muted-foreground">{queue.length}</span>
        </h1>
        <a
          href="/saga"
          target="_blank"
          className="text-xs underline underline-offset-2"
          rel="noreferrer"
        >
          /saga 보기
        </a>
      </div>
      {queue.length === 0 && (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          대기 중인 항목이 없습니다 — 수집(30분)·추출(15분) cron 이 채웁니다.
        </p>
      )}
      <div className="flex flex-col gap-2">
        {queue.map((row) => (
          <RowCard
            key={row.id}
            row={row}
            saga={row.saga_hint ? sagaByKey.get(row.saga_hint) : undefined}
            onDone={() => mutate()}
          />
        ))}
      </div>
    </div>
  )
}

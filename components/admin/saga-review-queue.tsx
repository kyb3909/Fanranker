"use client"

import { useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"
import { toast } from "@/hooks/use-toast"

/**
 * 사가 검수 큐 — 뉴스 검수 화면에 통합된 섹션 (2026-08-04 운영자: "검수는 하나로").
 *
 * 사가는 이제 **자동 생성**이 기본이다: saga-extract 크론이 사전 등재 선수 +
 * 고확신 추출은 바로 발행한다. 이 큐에 남는 것은 자동 발행이 보류한 것들뿐 —
 * 사전 미등재 선수(새 사가 오식별 위험), 저확신 추출, 한국어 헤드라인 부재.
 * 그래서 여기 있는 건 대부분 "선수 이름이 맞는지"를 사람이 봐야 하는 건이다.
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

const TIER_STYLE = {
  official: { label: "오피셜", bg: "#0E7A3C", fg: "#fff" },
  tier1: { label: "유력", bg: "#7a1e3c", fg: "#fff" },
  rumor: { label: "루머", bg: "#f3ede2", fg: "#946A12" },
} as const

const inputCls =
  "w-full rounded-md border px-2.5 py-1.5 text-[13px] focus:ring-2 focus:ring-rose-200 focus:outline-none"

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
      const res = await fetch("/api/admin/saga-review", {
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
          title: data.folded ? "받아쓰기로 접힘 ✅" : "발행됨 ✅",
          description: `${data.saga.title}`,
        })
      } else {
        toast({ title: "반려됨" })
      }
      onDone()
    } finally {
      setBusy(false)
    }
  }

  const tier = TIER_STYLE[ex?.tier ?? "rumor"]
  const conf = Math.round((ex?.confidence ?? 0) * 100)

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      {/* 1줄: 신뢰도·출처 칩 */}
      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
        <span
          className="rounded-full px-2 py-0.5 font-bold"
          style={{ background: tier.bg, color: tier.fg }}
        >
          {tier.label}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 font-bold ${conf < 60 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}
        >
          확신 {conf}%
        </span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
          {row.source?.kind === "rss" ? (row.source.outlet ?? "RSS") : "티커"}
        </span>
        <span className="ml-auto text-gray-400">
          {new Date(row.occurred_at).toLocaleString("ko-KR", {
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      {/* 발행될 헤드라인 — 이 화면의 주인공. 이대로 타임라인에 실린다 */}
      <input
        value={headline}
        onChange={(e) => setHeadline(e.target.value)}
        placeholder="한국어 헤드라인을 입력하세요 (필수)"
        className="mt-2.5 w-full rounded-lg border-2 border-gray-200 px-3 py-2 text-[16px] font-bold focus:border-rose-300 focus:outline-none"
      />
      {/* 원문 — 대조용 */}
      <p className="mt-1.5 text-[12px] leading-snug break-words text-gray-500">
        원문: {row.title}{" "}
        <a
          href={row.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="whitespace-nowrap text-rose-700 underline underline-offset-2"
        >
          열기 ↗
        </a>
      </p>

      {/* 어느 문서로 가는가 */}
      {saga ? (
        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-[12px] text-emerald-800">
          ✅ 기존 문서에 쌓임 →{" "}
          <a
            href={`/saga/${saga.slug}`}
            target="_blank"
            rel="noreferrer"
            className="font-bold underline underline-offset-2"
          >
            {saga.title}
          </a>{" "}
          <span className="text-emerald-600">(기록 {saga.entry_count}건)</span>
        </p>
      ) : (
        <p className="mt-2 rounded-lg bg-blue-50 px-3 py-1.5 text-[12px] font-bold text-blue-800">
          🆕 발행하면 새 사가 문서가 생깁니다 — 아래 선수명·방향을 꼭 확인하세요
        </p>
      )}

      {/* 수정 필드 — 한 줄 그리드 */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-[12px] font-bold text-gray-500">
          선수 (영문)
          <input value={player} onChange={(e) => setPlayer(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-bold text-gray-500">
          선수 (한글)
          <input
            value={playerKr}
            onChange={(e) => setPlayerKr(e.target.value)}
            placeholder="사전 미등재"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-bold text-gray-500">
          방향
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as "in" | "out")}
            className={inputCls}
          >
            <option value="in">IN — 영입 드라마</option>
            <option value="out">OUT — 순수 이탈</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-bold text-gray-500">
          단계
          <select value={stage} onChange={(e) => setStage(e.target.value)} className={inputCls}>
            {STAGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* 액션 — 발행이 주 동작 */}
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => act("publish")}
          disabled={busy || !player || !headline}
          className="flex-1 rounded-lg py-2.5 text-[14px] font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-40 sm:flex-none sm:px-8"
          style={{ background: "#961e37" }}
        >
          발행
        </button>
        <button
          onClick={() => act("reject")}
          disabled={busy}
          className="rounded-lg border px-5 py-2.5 text-[13px] font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          반려
        </button>
      </div>
    </div>
  )
}

export function SagaReviewQueue() {
  const { data, mutate } = useSWR<{ queue: QueueRow[]; sagas: SagaInfo[] }>(
    "/api/admin/saga-review",
    fetcher,
    { refreshInterval: 60_000 }
  )
  const sagaByKey = new Map((data?.sagas ?? []).map((s) => [s.identity_key, s]))
  const queue = data?.queue ?? []
  const withSaga = queue.filter((r) => r.saga_hint && sagaByKey.has(r.saga_hint))
  const newSaga = queue.filter((r) => !(r.saga_hint && sagaByKey.has(r.saga_hint)))

  return (
    <div className="mt-10 space-y-5 border-t pt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold">
          사가 검수 <span className="font-bold text-gray-400">{queue.length}건 대기</span>
        </h2>
        <a
          href="/saga"
          target="_blank"
          className="text-[12px] font-bold text-rose-700 underline underline-offset-2"
          rel="noreferrer"
        >
          /saga 보기 ↗
        </a>
      </div>
      <p className="text-[12px] text-gray-500">
        사가는 자동 생성됩니다 — 사전에 등재된 선수의 고확신 소식은 크론이 바로 발행하고, 여기엔{" "}
        <b>자동 발행이 보류한 것</b>(사전 미등재 선수·저확신·헤드라인 부재)만 남습니다.
      </p>

      {queue.length === 0 && (
        <p className="rounded-xl border border-dashed p-10 text-center text-[14px] text-gray-400">
          대기 중인 항목이 없습니다 — 전부 자동 발행되고 있습니다.
        </p>
      )}

      {newSaga.length > 0 && (
        <section className="space-y-2.5">
          <h3 className="text-[13px] font-extrabold text-blue-800">
            🆕 새 사가가 생기는 건 <span className="text-blue-500">{newSaga.length}</span>
            <span className="ml-2 font-bold text-gray-400">— 선수 이름이 맞는지 확인</span>
          </h3>
          {newSaga.map((row) => (
            <RowCard key={row.id} row={row} saga={undefined} onDone={() => mutate()} />
          ))}
        </section>
      )}

      {withSaga.length > 0 && (
        <section className="space-y-2.5">
          <h3 className="text-[13px] font-extrabold text-emerald-800">
            기존 사가에 쌓이는 건 <span className="text-emerald-500">{withSaga.length}</span>
            <span className="ml-2 font-bold text-gray-400">— 헤드라인만 훑고 발행</span>
          </h3>
          {withSaga.map((row) => (
            <RowCard
              key={row.id}
              row={row}
              saga={row.saga_hint ? sagaByKey.get(row.saga_hint) : undefined}
              onDone={() => mutate()}
            />
          ))}
        </section>
      )}
    </div>
  )
}

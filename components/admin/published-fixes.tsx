"use client"

import { useState } from "react"
import useSWR from "swr"
import dynamic from "next/dynamic"
import { fetcher } from "@/lib/swr"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

const TipTapEditor = dynamic(
  () => import("@/components/editor/tiptap-editor").then((m) => m.TipTapEditor),
  { ssr: false }
)

/**
 * 발행된 것 고치기 — 뉴스 검수 화면의 사후 교정 섹션 (2026-08-04 운영자).
 * 봇 기사(제목·본문), 사가 연표(헤드라인·티어), 사가 이름(제목·한글명)을 발행 후에
 * 고친다. 고치는 즉시 표기 학습이 태워져 다음 기사부터 반영된다.
 */

interface ArticleRow {
  id: string
  title: string
  content: unknown
  image: string | null
  created_at: string
}

interface EntryRow {
  id: string
  headline: string
  tier: "official" | "tier1" | "rumor"
  occurred_at: string
  sagas: {
    id: string
    slug: string
    title: string
    saga_type: string
    subject: { player_key?: string; player_name_kr?: string | null } | null
  }
}

const TIER_LABEL = { official: "오피셜", tier1: "유력", rumor: "루머" } as const

function timeAgo(iso: string): string {
  const h = (Date.now() - new Date(iso).getTime()) / 3600_000
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}분 전`
  if (h < 24) return `${Math.round(h)}시간 전`
  return `${Math.round(h / 24)}일 전`
}

export function PublishedFixes() {
  return (
    <section className="mt-8 space-y-3">
      <div>
        <h2 className="text-base font-bold">발행된 것 고치기</h2>
        <p className="text-muted-foreground mt-0.5 text-xs">
          발행 후 발견한 오탈자·표기·티어를 여기서 고치세요. 고친 표기는 즉시 학습돼 다음 기사부터
          반영됩니다.
        </p>
      </div>
      <PublishedArticles />
      <PublishedSagaEntries />
    </section>
  )
}

function PublishedArticles() {
  const { data, mutate } = useSWR<{ items: ArticleRow[] }>(
    "/api/admin/published-fixes?kind=articles",
    fetcher
  )
  const items = data?.items ?? []
  const [editing, setEditing] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [content, setContent] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  const save = async (row: ArticleRow) => {
    if (busy || !title.trim()) return
    setBusy(true)
    try {
      const res = await fetch("/api/admin/published-fixes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "article",
          post_id: row.id,
          title: title.trim(),
          content: content ?? row.content,
        }),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast({ variant: "destructive", title: "실패", description: d.error ?? "수정 실패" })
        return
      }
      toast({ title: "기사 수정 완료", description: "고치신 표기를 학습합니다." })
      setEditing(null)
      void mutate()
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="bg-background rounded-xl border">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold select-none">
        최근 발행 기사{" "}
        <span className="text-muted-foreground font-normal">{items.length}건 · 3일</span>
      </summary>
      <ul className="space-y-1.5 border-t p-3">
        {items.length === 0 && (
          <li className="text-muted-foreground py-2 text-center text-xs">최근 발행이 없습니다.</li>
        )}
        {items.map((row) => {
          const isEditing = editing === row.id
          return (
            <li key={row.id} className="rounded-lg border p-2.5">
              <div className="flex items-center gap-2">
                {row.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.image} alt="" className="h-9 w-14 shrink-0 rounded object-cover" />
                )}
                {isEditing ? (
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="min-w-0 flex-1 rounded border px-2 py-1 text-sm font-medium"
                  />
                ) : (
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">{row.title}</p>
                )}
                <span className="text-muted-foreground shrink-0 text-[11px]">
                  {timeAgo(row.created_at)}
                </span>
                <a
                  href={`/post/${row.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground shrink-0 text-[11px] underline underline-offset-2"
                >
                  보기
                </a>
                {!isEditing && (
                  <button
                    onClick={() => {
                      setEditing(row.id)
                      setTitle(row.title)
                      setContent(row.content)
                    }}
                    className="shrink-0 rounded border px-2.5 py-1 text-[11px]"
                  >
                    수정
                  </button>
                )}
              </div>
              {isEditing && (
                <div className="mt-2">
                  <div className="bg-background max-h-[420px] overflow-auto rounded-lg border p-3">
                    <TipTapEditor content={row.content} onChange={setContent} />
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => void save(row)}
                      disabled={busy || !title.trim()}
                      className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    >
                      저장 (학습됨)
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      disabled={busy}
                      className="text-muted-foreground rounded border px-3 py-1.5 text-xs"
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </details>
  )
}

function PublishedSagaEntries() {
  const { data, mutate } = useSWR<{ items: EntryRow[] }>(
    "/api/admin/published-fixes?kind=sagas",
    fetcher
  )
  const items = data?.items ?? []
  const [editing, setEditing] = useState<string | null>(null)
  const [headline, setHeadline] = useState("")
  const [tier, setTier] = useState<EntryRow["tier"]>("rumor")
  /** 사가 이름 교정 폼이 열린 사가 id */
  const [renaming, setRenaming] = useState<string | null>(null)
  const [sagaTitle, setSagaTitle] = useState("")
  const [playerKr, setPlayerKr] = useState("")
  const [busy, setBusy] = useState(false)

  const patch = async (body: Record<string, unknown>, okMsg: string) => {
    if (busy) return false
    setBusy(true)
    try {
      const res = await fetch("/api/admin/published-fixes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string; learning?: boolean }
      if (!res.ok) {
        toast({ variant: "destructive", title: "실패", description: d.error ?? "수정 실패" })
        return false
      }
      toast({ title: okMsg, description: d.learning ? "표기를 학습했습니다." : undefined })
      void mutate()
      return true
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="bg-background rounded-xl border">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold select-none">
        사가 연표 <span className="text-muted-foreground font-normal">{items.length}건 · 3일</span>
      </summary>
      <ul className="space-y-1.5 border-t p-3">
        {items.length === 0 && (
          <li className="text-muted-foreground py-2 text-center text-xs">
            최근 엔트리가 없습니다.
          </li>
        )}
        {items.map((row) => {
          const isEditing = editing === row.id
          const isRenaming = renaming === row.sagas.id
          return (
            <li key={row.id} className="rounded-lg border p-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <a
                  href={`/saga/${row.sagas.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-[12px] font-semibold underline-offset-2 hover:underline"
                >
                  {row.sagas.title}
                </a>
                {row.sagas.saga_type === "transfer" && !isRenaming && (
                  <button
                    onClick={() => {
                      setRenaming(row.sagas.id)
                      setSagaTitle(row.sagas.title)
                      setPlayerKr(row.sagas.subject?.player_name_kr ?? "")
                    }}
                    title="사가 제목·선수 한글명 교정 (사전에 등재됨)"
                    className="text-muted-foreground shrink-0 text-[11px] underline underline-offset-2"
                  >
                    이름교정
                  </button>
                )}
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold",
                    row.tier === "official" && "bg-emerald-700 text-white",
                    row.tier === "tier1" && "bg-[#7a1e3c] text-white",
                    row.tier === "rumor" && "bg-muted text-muted-foreground"
                  )}
                >
                  {TIER_LABEL[row.tier]}
                </span>
                {isEditing ? (
                  <input
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    className="min-w-[240px] flex-1 rounded border px-2 py-1 text-[13px]"
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate text-[13px]">{row.headline}</span>
                )}
                <span className="text-muted-foreground shrink-0 text-[11px]">
                  {timeAgo(row.occurred_at)}
                </span>
                {isEditing ? (
                  <span className="flex shrink-0 gap-1.5">
                    <select
                      value={tier}
                      onChange={(e) => setTier(e.target.value as EntryRow["tier"])}
                      className="bg-background rounded border px-1.5 py-1 text-[11px]"
                    >
                      <option value="official">오피셜</option>
                      <option value="tier1">유력</option>
                      <option value="rumor">루머</option>
                    </select>
                    <button
                      onClick={async () => {
                        const ok = await patch(
                          { kind: "entry", entry_id: row.id, headline: headline.trim(), tier },
                          "엔트리 수정 완료"
                        )
                        if (ok) setEditing(null)
                      }}
                      disabled={busy || !headline.trim()}
                      className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                    >
                      저장
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      disabled={busy}
                      className="text-muted-foreground rounded border px-2 py-1 text-[11px]"
                    >
                      취소
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      setEditing(row.id)
                      setHeadline(row.headline)
                      setTier(row.tier)
                    }}
                    className="shrink-0 rounded border px-2.5 py-1 text-[11px]"
                  >
                    수정
                  </button>
                )}
              </div>

              {isRenaming && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <input
                    value={sagaTitle}
                    onChange={(e) => setSagaTitle(e.target.value)}
                    placeholder="사가 제목"
                    className="w-[220px] rounded border px-2 py-1"
                  />
                  <input
                    value={playerKr}
                    onChange={(e) => setPlayerKr(e.target.value)}
                    placeholder="선수 한글명 (사전 등재)"
                    className="w-[150px] rounded border px-2 py-1"
                  />
                  <button
                    onClick={async () => {
                      const ok = await patch(
                        {
                          kind: "saga",
                          saga_id: row.sagas.id,
                          ...(sagaTitle.trim() ? { title: sagaTitle.trim() } : {}),
                          ...(playerKr.trim() ? { player_kr: playerKr.trim() } : {}),
                        },
                        "사가 이름 교정 완료"
                      )
                      if (ok) setRenaming(null)
                    }}
                    disabled={busy || (!sagaTitle.trim() && !playerKr.trim())}
                    className="rounded bg-emerald-600 px-2.5 py-1 font-medium text-white disabled:opacity-50"
                  >
                    저장
                  </button>
                  <button
                    onClick={() => setRenaming(null)}
                    disabled={busy}
                    className="text-muted-foreground rounded border px-2 py-1"
                  >
                    취소
                  </button>
                  <span className="text-muted-foreground">
                    한글명은 표기 사전에 바로 등재 — 이후 기사·사가가 이 표기를 씁니다
                  </span>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </details>
  )
}

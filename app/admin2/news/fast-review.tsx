"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

/**
 * 빠른 검수 — 하루 ~47건 유입 vs 1인 검수라는 현실에 맞춘 화면.
 *
 * 기존 화면의 병목(실측 2026-07-29):
 *   - 143건 대기인데 50건만 표시 → 93건은 존재조차 안 보이고 48시간 뒤 만료
 *   - 일괄 처리 없음, 한 건씩 마우스 클릭
 *   - 최신순 정렬이라 **먼저 사라질 것이 맨 아래**에 있었다
 *
 * 그래서 여기서는:
 *   - 전량 표시 + **만료 임박 순** 정렬
 *   - 키보드만으로 처리: J/K 이동 · P 발행 · R 반려 · E 제목수정 · X 선택
 *   - 체크한 것 일괄 반려 (발행은 일괄로 열지 않는다 — 되돌리기 어려운 행동)
 */

export interface FlairChoice {
  id: string
  name: string
  color: string | null
  team_id: string | null
}

export interface DeskItem {
  id: string
  title: string
  body: string
  bodyLength: number
  image: string | null
  content: unknown
  sourceUrl: string | null
  createdAt: string
  /** 자동 만료까지 남은 시간 */
  hoursLeft: number
  credibility: number | null
  importance: number | null
  suggestedFlairIds: string[]
}

export function FastReview({ items, flairs }: { items: DeskItem[]; flairs: FlairChoice[] }) {
  const router = useRouter()
  const [queue, setQueue] = useState(items)
  const [cursor, setCursor] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [flairSel, setFlairSel] = useState<Record<string, string[]>>({})
  const rowRefs = useRef<Record<string, HTMLLIElement | null>>({})

  const current = queue[cursor]

  const flairsFor = useCallback(
    (item: DeskItem) => flairSel[item.id] ?? item.suggestedFlairIds,
    [flairSel]
  )

  /** 처리 끝난 항목을 큐에서 빼고 커서를 제자리에 유지 (다음 항목이 그 자리로 올라온다) */
  const removeFromQueue = useCallback((ids: string[]) => {
    const gone = new Set(ids)
    setQueue((prev) => {
      const next = prev.filter((i) => !gone.has(i.id))
      setCursor((c) => Math.min(c, Math.max(0, next.length - 1)))
      return next
    })
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) next.delete(id)
      return next
    })
  }, [])

  const act = useCallback(
    async (item: DeskItem, action: "publish" | "reject", overrideTitle?: string) => {
      if (busy) return
      setBusy(true)
      try {
        const res = await fetch("/api/admin/news-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: item.id,
            action,
            ...(action === "publish"
              ? {
                  title: overrideTitle ?? item.title,
                  content: item.content,
                  flair_ids: flairsFor(item),
                }
              : {}),
          }),
        })
        const d = (await res.json().catch(() => ({}))) as { error?: string; learning?: boolean }
        if (!res.ok) {
          toast({ variant: "destructive", title: "실패", description: d.error ?? "처리 실패" })
          return
        }
        removeFromQueue([item.id])
        if (action === "publish") {
          toast({
            title: "발행 완료",
            description: d.learning ? "고치신 표기를 학습해 다음 기사에 반영합니다." : undefined,
          })
        }
      } finally {
        setBusy(false)
      }
    },
    [busy, flairsFor, removeFromQueue]
  )

  const bulkReject = useCallback(async () => {
    if (busy || selected.size === 0) return
    if (!confirm(`선택한 ${selected.size}건을 반려합니다. 계속할까요?`)) return
    setBusy(true)
    try {
      const ids = [...selected]
      const res = await fetch("/api/admin2/news/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", ids }),
      })
      const d = (await res.json().catch(() => ({}))) as {
        error?: string
        rejected?: number
        skipped?: number
      }
      if (!res.ok) {
        toast({ variant: "destructive", title: "실패", description: d.error ?? "일괄 반려 실패" })
        return
      }
      removeFromQueue(ids)
      toast({
        title: `${d.rejected ?? 0}건 반려`,
        description: d.skipped ? `${d.skipped}건은 이미 처리되어 건너뜀` : undefined,
      })
    } finally {
      setBusy(false)
    }
  }, [busy, selected, removeFromQueue])

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // ── 키보드 ────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 입력 중일 땐 단축키를 먹지 않는다 (제목 편집 중 R 이 반려가 되면 참사)
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
        if (e.key === "Escape") setEditing(null)
        return
      }
      if (!current) return
      const k = e.key.toLowerCase()
      if (k === "j" || e.key === "ArrowDown") {
        e.preventDefault()
        setCursor((c) => Math.min(c + 1, queue.length - 1))
      } else if (k === "k" || e.key === "ArrowUp") {
        e.preventDefault()
        setCursor((c) => Math.max(c - 1, 0))
      } else if (k === "p") {
        e.preventDefault()
        void act(current, "publish")
      } else if (k === "r") {
        e.preventDefault()
        void act(current, "reject")
      } else if (k === "x") {
        e.preventDefault()
        toggleSelect(current.id)
      } else if (k === "e") {
        e.preventDefault()
        setEditing(current.id)
        setEditTitle(current.title)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [current, queue.length, act, toggleSelect])

  // 커서가 화면 밖으로 나가면 따라간다
  useEffect(() => {
    if (!current) return
    rowRefs.current[current.id]?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [cursor, current])

  const urgent = queue.filter((i) => i.hoursLeft < 6).length

  return (
    <div className="space-y-3">
      {/* ── 헤더 ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-bold">
            빠른 검수 <span className="text-muted-foreground font-normal">{queue.length}건</span>
          </h1>
          <p className="text-muted-foreground mt-0.5 text-xs">
            만료 임박 순 · 48시간 지나면 자동 반려됩니다
            {urgent > 0 && (
              <span className="ml-1 font-medium text-red-600">6시간 내 {urgent}건</span>
            )}
          </p>
        </div>
        <Link href="/admin2" className="text-muted-foreground text-xs hover:underline">
          ← 작업대
        </Link>
      </div>

      {/* ── 단축키 안내 + 일괄 작업 ──────────────────────────────────── */}
      <div className="bg-muted/60 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-[11px]">
        <Kbd>J</Kbd>
        <Kbd>K</Kbd>
        <span className="text-muted-foreground">이동</span>
        <Kbd>P</Kbd>
        <span className="text-muted-foreground">발행</span>
        <Kbd>R</Kbd>
        <span className="text-muted-foreground">반려</span>
        <Kbd>X</Kbd>
        <span className="text-muted-foreground">선택</span>
        <Kbd>E</Kbd>
        <span className="text-muted-foreground">제목 수정</span>
        {selected.size > 0 && (
          <button
            onClick={bulkReject}
            disabled={busy}
            className="ml-auto rounded bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
          >
            선택 {selected.size}건 반려
          </button>
        )}
      </div>

      {queue.length === 0 ? (
        <div className="bg-background rounded-xl border p-8 text-center">
          <p className="text-sm font-medium">검수 대기가 없습니다.</p>
          <Link
            href="/admin2"
            className="text-muted-foreground mt-2 inline-block text-xs hover:underline"
          >
            작업대로 돌아가기
          </Link>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {queue.map((item, idx) => {
            const active = idx === cursor
            const checked = selected.has(item.id)
            const isEditing = editing === item.id
            return (
              <li
                key={item.id}
                ref={(el) => {
                  rowRefs.current[item.id] = el
                }}
                onClick={() => setCursor(idx)}
                className={cn(
                  "bg-background cursor-pointer rounded-lg border p-3 transition",
                  active && "ring-primary/60 border-primary/40 ring-2",
                  checked && "bg-red-50/60"
                )}
              >
                <div className="flex gap-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSelect(item.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 h-4 w-4 shrink-0"
                    aria-label="선택"
                  />
                  {item.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image}
                      alt=""
                      className="h-14 w-20 shrink-0 rounded object-cover"
                      loading="lazy"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            void act(item, "publish", editTitle.trim() || item.title)
                            setEditing(null)
                          }
                        }}
                        className="w-full rounded border px-2 py-1 text-sm font-medium"
                        placeholder="제목 (Enter=수정본 발행, Esc=취소)"
                      />
                    ) : (
                      <p className="text-sm leading-snug font-medium">{item.title}</p>
                    )}

                    <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{item.body}</p>

                    <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                      <span
                        className={cn(
                          "font-medium",
                          item.hoursLeft < 6 ? "text-red-600" : "text-muted-foreground"
                        )}
                      >
                        {item.hoursLeft < 1
                          ? `${Math.round(item.hoursLeft * 60)}분 남음`
                          : `${item.hoursLeft.toFixed(0)}시간 남음`}
                      </span>
                      <span>· 본문 {item.bodyLength}자</span>
                      {!item.image && (
                        <span className="text-amber-600">· 사진 없음(떡밥 제외)</span>
                      )}
                      {item.credibility != null && <span>· 신뢰 {item.credibility}</span>}
                      {item.sourceUrl && (
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="underline underline-offset-2"
                        >
                          원문
                        </a>
                      )}
                    </div>

                    {/* 말머리 — 자동 추천이 기본 선택, 눌러서 토글 */}
                    {active && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {flairs.map((f) => {
                          const on = flairsFor(item).includes(f.id)
                          return (
                            <button
                              key={f.id}
                              onClick={(e) => {
                                e.stopPropagation()
                                const cur = flairsFor(item)
                                setFlairSel((prev) => ({
                                  ...prev,
                                  [item.id]: on ? cur.filter((x) => x !== f.id) : [...cur, f.id],
                                }))
                              }}
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[11px] transition",
                                on
                                  ? "border-foreground bg-foreground text-background"
                                  : "text-muted-foreground hover:bg-muted"
                              )}
                            >
                              {f.name}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {active && (
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          void act(item, "publish")
                        }}
                        disabled={busy}
                        className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      >
                        발행
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          void act(item, "reject")
                        }}
                        disabled={busy}
                        className="rounded border px-3 py-1.5 text-xs disabled:opacity-50"
                      >
                        반려
                      </button>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {queue.length > 0 && (
        <p className="text-muted-foreground pt-1 text-center text-[11px]">
          {cursor + 1} / {queue.length} · 처리하면 다음 항목이 자동으로 올라옵니다
        </p>
      )}
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="bg-background rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold shadow-sm">
      {children}
    </kbd>
  )
}

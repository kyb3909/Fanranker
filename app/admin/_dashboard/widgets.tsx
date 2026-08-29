"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import type { MiniNewsItem, SquadPreviewRow } from "./data"

/**
 * 관제실 위젯 — 시안(app/design-demo/admin-home)에서 2026-08-30 이식, **실배선판**.
 *
 * 시안과 다른 점 하나뿐: 버튼이 진짜로 쓴다.
 *  · 뉴스 발행/반려 → POST /api/admin/news-review (fast-review 와 같은 5초 유예 커밋
 *    + Z 되돌리기 + 떠날 때 keepalive flush — "눌렀는데 안 나감"이 최악이다)
 *  · 스쿼드 승인 → POST /api/admin/team-squads inline_save (형식 검사는 서버가 한다)
 *  · 티커 즉시 삭제 → DELETE /api/admin/content/ticker
 *  · 전황판 액션 → 해당 관리 페이지 링크
 */

const UNDO_MS = 5_000

function hoursLeftOf(item: MiniNewsItem, now: number): number {
  return (new Date(item.expiresAt).getTime() - now) / 3600_000
}

function expiryLabel(item: MiniNewsItem, now: number): string {
  const h = hoursLeftOf(item, now)
  if (h < 0) return "만료 지남"
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}분 남음`
  return `${Math.floor(h)}시간 남음`
}

function useTick(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  return now
}

/** 사이트 와인색 — admin 레이아웃엔 wc 토큰이 없어 상수로 (admin 은 디자인 시스템 예외 구역) */
export const WINE = "#961e37"

/** 서버 컴포넌트 페이지에서 쓰는 새로고침 버튼 (구 DashboardHeader 의 유일한 기능 승계) */
export function RefreshButton() {
  const router = useRouter()
  const [spinning, setSpinning] = useState(false)
  return (
    <button
      onClick={() => {
        setSpinning(true)
        router.refresh()
        setTimeout(() => setSpinning(false), 800)
      }}
      className="text-muted-foreground hover:bg-muted flex items-center gap-1 rounded border px-2 py-1 text-[11px]"
      aria-label="새로고침"
    >
      <RefreshCw className={cn("h-3 w-3", spinning && "animate-spin")} />
      새로고침
    </button>
  )
}

/**
 * 위젯 껍데기 — 라틴 키커 + 카운트 알약. 헤더에 사이트 와인색을 물려
 * admin 이 본편과 남남으로 보이던 것을 줄인다.
 */
export function Widget({
  title,
  kicker,
  count,
  tone = "default",
  children,
  className,
  headerRight,
}: {
  title: string
  /** 라틴 대문자 소제목 — 본편 밴드의 키커 문법 */
  kicker?: string
  count?: number
  tone?: "default" | "danger"
  children: React.ReactNode
  className?: string
  headerRight?: React.ReactNode
}) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-2xl border bg-white shadow-sm dark:bg-neutral-900",
        tone === "danger" && "border-red-200",
        className
      )}
    >
      <header className="flex items-center gap-2 border-b px-4 py-2.5">
        {kicker && (
          <span className="text-[10px] font-extrabold tracking-[0.18em]" style={{ color: WINE }}>
            {kicker}
          </span>
        )}
        <h2 className="text-sm font-bold">{title}</h2>
        {count != null && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-bold text-white tabular-nums",
              tone === "danger" ? "" : "opacity-90"
            )}
            style={{ background: tone === "danger" ? "#dc2626" : WINE }}
          >
            {count.toLocaleString()}
          </span>
        )}
        {headerRight && <span className="ml-auto">{headerRight}</span>}
      </header>
      <div className="flex min-h-0 flex-1 flex-col p-4">{children}</div>
    </section>
  )
}

/** 미리보기 행 목록 — 신고·표기 후보 공용. 액션은 해당 관리 페이지 링크 */
export function PreviewList({
  rows,
  empty,
  action,
  actionHref,
}: {
  rows: { primary: string; secondary?: string; actionLabel?: string; href?: string }[]
  empty: string
  action?: string
  actionHref?: string
}) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground py-4 text-center text-xs">{empty}</p>
  }
  return (
    <ul className="divide-y">
      {rows.map((r, i) => {
        const label = r.actionLabel ?? action
        const href = r.href ?? actionHref
        return (
          <li key={i} className="flex items-center gap-2 py-2 text-xs">
            <span className="min-w-0 flex-1 truncate">{r.primary}</span>
            {r.secondary && (
              <span className="text-muted-foreground shrink-0 text-[11px]">{r.secondary}</span>
            )}
            {label && href && (
              <Link
                href={href}
                className="shrink-0 rounded border px-2 py-0.5 text-[11px] font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800"
              >
                {label}
              </Link>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * 스쿼드 검수 행 — **입력칸이 곧 편집기다** (운영자: "내가 바꾸고 싶을 때는?").
 * 초안이 입력칸에 들어 있고, 틀렸으면 그 자리에서 고친 뒤 승인. Enter = 승인.
 * 저장은 /admin/team-squads 와 같은 inline_save — 형식 검사·confirmed 승격 규칙이 같다.
 */
export function SquadReviewList({ rows: initial }: { rows: SquadPreviewRow[] }) {
  const [rows, setRows] = useState(initial.map((r) => ({ ...r, value: r.nameKrDraft })))
  const [done, setDone] = useState(0)
  const busyRef = useRef<Set<string>>(new Set())

  const approve = async (i: number) => {
    const row = rows[i]
    if (!row || busyRef.current.has(row.playerSlug)) return
    busyRef.current.add(row.playerSlug)
    // 낙관적 제거 — 실패하면 제자리에 되살린다
    setRows((prev) => prev.filter((_, j) => j !== i))
    setDone((n) => n + 1)
    const restore = () => {
      setRows((prev) => {
        const next = [...prev]
        next.splice(Math.min(i, next.length), 0, row)
        return next
      })
      setDone((n) => Math.max(0, n - 1))
    }
    try {
      const res = await fetch("/api/admin/team-squads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "inline_save",
          rows: [
            {
              soccerway_team_id: row.teamId,
              player_slug: row.playerSlug,
              name_kr: row.value.trim(),
            },
          ],
        }),
      })
      const d = (await res.json().catch(() => ({}))) as {
        error?: string
        updated?: number
        failed?: string[]
        skipped?: string[]
      }
      // ⚠️ 200 이어도 skipped(형식 탈락)/failed 가 올 수 있다 — 조용히 사라지면 안 된다
      if (!res.ok || !d.updated) {
        toast({
          variant: "destructive",
          title: "승인 실패",
          description: d.error ?? d.skipped?.[0] ?? d.failed?.[0] ?? "다시 시도하세요",
        })
        restore()
        return
      }
      toast({ title: `${row.value.trim()} 확정`, description: `${row.teamKr} · ${row.nameEn}` })
    } catch {
      toast({ variant: "destructive", title: "네트워크 오류", description: "행을 되살렸습니다." })
      restore()
    } finally {
      busyRef.current.delete(row.playerSlug)
    }
  }

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-4 text-center text-xs">
        미리보기 소진 — 오늘 {done}명 확정. 전체는 선수단 사전에서.
      </p>
    )
  }
  return (
    <ul className="divide-y">
      {rows.map((r, i) => {
        const edited = r.value.trim() !== r.nameKrDraft
        return (
          <li
            key={`${r.teamId}-${r.playerSlug}`}
            className="flex items-center gap-2 py-1.5 text-xs"
          >
            <span className="text-muted-foreground w-[130px] shrink-0 truncate">
              {r.teamKr} · {r.nameEn}
            </span>
            <span className="text-muted-foreground shrink-0">→</span>
            {/* 초안이 입력칸 — 틀렸으면 여기서 바로 고친다 */}
            <input
              value={r.value}
              onChange={(e) =>
                setRows((prev) =>
                  prev.map((x, j) => (j === i ? { ...x, value: e.target.value } : x))
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && r.value.trim()) void approve(i)
              }}
              className={cn(
                "min-w-0 flex-1 rounded border px-2 py-1",
                edited && "border-amber-400 bg-amber-50 font-semibold dark:bg-amber-950/30"
              )}
              aria-label={`${r.nameEn} 한글 표기`}
            />
            <button
              onClick={() => void approve(i)}
              disabled={!r.value.trim()}
              className={cn(
                "shrink-0 rounded px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-40",
                edited ? "bg-amber-600" : "bg-emerald-600"
              )}
            >
              {edited ? "고쳐서 승인" : "승인"}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * 뉴스 미니 덱 — 대시보드의 심장. 원문·초안 2열 인라인.
 *
 * 발행/반려는 fast-review 와 같은 **5초 유예 커밋**: 화면에서 즉시 빼고 5초 뒤
 * POST. Z 로 회수, 떠날 때는 keepalive 로 즉시 커밋. 실패하면 큐에 되살린다.
 * 편집(TipTap)·말머리·사가 연결·VS 는 검수 페이지 몫 — 미니 덱은 오조작 지대라 뺐다.
 */
export function MiniNewsDeck({ items: initial }: { items: MiniNewsItem[] }) {
  const now = useTick()
  const [items, setItems] = useState(initial)
  const [cursor, setCursor] = useState(0)
  const [done, setDone] = useState(0)
  const [modal, setModal] = useState(false)
  const [undoBar, setUndoBar] = useState<{ id: string; kind: "publish" | "reject" } | null>(null)
  const pendingRef = useRef(
    new Map<
      string,
      { item: MiniNewsItem; index: number; kind: "publish" | "reject"; timer: number }
    >()
  )
  const mountedRef = useRef(true)
  const item = items[Math.min(cursor, Math.max(0, items.length - 1))]

  /** 좌우가 곧 스킵이다 (운영자: "스킵하는 건 좌우로 움직이면서 관리") — 순환 */
  const next = useCallback(
    () => setCursor((c) => (items.length === 0 ? 0 : (c + 1) % items.length)),
    [items.length]
  )
  const prev = useCallback(
    () => setCursor((c) => (items.length === 0 ? 0 : (c - 1 + items.length) % items.length)),
    [items.length]
  )

  /** 유예 커밋 실행 — 5초가 지났거나 화면을 떠날 때 */
  const commit = useCallback(async (id: string, keepalive = false) => {
    const p = pendingRef.current.get(id)
    if (!p) return
    pendingRef.current.delete(id)
    clearTimeout(p.timer)
    setUndoBar((bar) => (bar?.id === id ? null : bar))
    const restore = () => {
      if (!mountedRef.current) return
      setItems((prevQ) => {
        const nextQ = [...prevQ]
        nextQ.splice(Math.min(p.index, nextQ.length), 0, p.item)
        return nextQ
      })
      setDone((n) => Math.max(0, n - 1))
    }
    try {
      const res = await fetch("/api/admin/news-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: p.kind }),
        ...(keepalive ? { keepalive: true } : {}),
      })
      if (keepalive) return // 떠나는 길 — 응답을 기다리지 않는다
      const d = (await res.json().catch(() => ({}))) as {
        error?: string
        saga?: { slug: string; title: string } | null
        saga_error?: string
      }
      if (!res.ok) {
        toast({ variant: "destructive", title: "처리 실패", description: d.error ?? "다시 시도" })
        restore()
        return
      }
      if (p.kind === "publish") {
        toast({
          title: "발행 완료",
          description: d.saga ? `사가 연결: ${d.saga.title}` : undefined,
        })
        if (d.saga_error) {
          toast({
            variant: "destructive",
            title: "사가 연결 실패 (발행은 완료)",
            description: d.saga_error,
          })
        }
      }
    } catch {
      if (!keepalive) {
        toast({ variant: "destructive", title: "네트워크 오류", description: "큐에 되살림" })
        restore()
      }
    }
  }, [])

  /** 발행/반려 — 화면에서 즉시 빼고 5초 뒤 실제 커밋. Z 로 회수 */
  const decide = useCallback(
    (kind: "publish" | "reject") => {
      if (!item || pendingRef.current.has(item.id)) return
      const index = items.findIndex((i) => i.id === item.id)
      setItems((prevQ) => prevQ.filter((i) => i.id !== item.id))
      setCursor((c) => Math.min(c, Math.max(0, items.length - 2)))
      setDone((n) => n + 1)
      setModal(false)
      const timer = window.setTimeout(() => void commit(item.id), UNDO_MS)
      pendingRef.current.set(item.id, { item, index, kind, timer })
      setUndoBar({ id: item.id, kind })
    },
    [item, items, commit]
  )

  /** 되돌리기 — 마지막 유예 커밋을 회수해 제자리에 되살린다 */
  const undoLast = useCallback(() => {
    setUndoBar((bar) => {
      if (!bar) return null
      const p = pendingRef.current.get(bar.id)
      if (!p) return null
      clearTimeout(p.timer)
      pendingRef.current.delete(bar.id)
      setItems((prevQ) => {
        const nextQ = [...prevQ]
        const at = Math.min(p.index, nextQ.length)
        nextQ.splice(at, 0, p.item)
        setCursor(at)
        return nextQ
      })
      setDone((n) => Math.max(0, n - 1))
      return null
    })
  }, [])

  // 화면을 떠나면 유예분을 keepalive 로 즉시 커밋 — "눌렀는데 안 나감"이 최악이다
  useEffect(() => {
    mountedRef.current = true
    const flush = () => {
      for (const id of [...pendingRef.current.keys()]) void commit(id, true)
    }
    window.addEventListener("beforeunload", flush)
    return () => {
      mountedRef.current = false
      window.removeEventListener("beforeunload", flush)
      flush()
    }
  }, [commit])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable) return
      const k = e.key.toLowerCase()
      if (e.key === "ArrowRight" || k === "s" || k === "j") next()
      if (e.key === "ArrowLeft" || k === "k") prev()
      if (k === "p") decide("publish")
      if (k === "r") decide("reject")
      if (k === "z") undoLast()
      if (k === "e") setModal(true)
      if (e.key === "Escape") setModal(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [next, prev, decide, undoLast])

  const breaking = items.filter((i) => i.breaking).length
  const urgent = items.filter((i) => hoursLeftOf(i, now) < 6).length

  if (!item) {
    return (
      <div>
        <p className="text-muted-foreground py-6 text-center text-sm">
          검수 대기 0건 — 오늘 {done}건 처리 🎉
        </p>
        {undoBar && <UndoStrip kind={undoBar.kind} onUndo={undoLast} />}
      </div>
    )
  }

  const hl = hoursLeftOf(item, now)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 헤더 한 줄 — 남은 개수·속보·만료 + 좌우 이동(=스킵) */}
      <div className="text-muted-foreground mb-2 flex items-center gap-1.5 text-[11px]">
        <b className="text-foreground tabular-nums">
          {cursor + 1}/{items.length}
        </b>
        건 남음
        {breaking > 0 && <span className="font-bold text-red-600">🚨 오피셜급 {breaking}</span>}
        {urgent > 0 && <span className="text-red-600">⏰ 6시간 내 {urgent}</span>}
        <span className="ml-auto">오늘 처리 {done}건</span>
        <button
          onClick={prev}
          aria-label="이전 (←)"
          className="hover:bg-muted rounded border px-2 py-0.5 font-bold"
        >
          ◀
        </button>
        <button
          onClick={next}
          aria-label="다음 (→)"
          className="hover:bg-muted rounded border px-2 py-0.5 font-bold"
        >
          ▶
        </button>
      </div>

      {/* 카드 1장 */}
      <div className={cn("rounded-lg border p-3", item.breaking && "border-red-300 bg-red-50/40")}>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {item.breaking ? (
            <span className="rounded bg-red-600 px-1.5 py-0.5 font-bold text-white">오피셜급</span>
          ) : (
            <span className="text-muted-foreground rounded border px-1.5 py-0.5">일반</span>
          )}
          <span
            className={cn(
              "rounded px-1.5 py-0.5 font-medium tabular-nums",
              hl < 3
                ? "bg-red-600 text-white"
                : hl < 6
                  ? "bg-red-50 text-red-700"
                  : "text-muted-foreground"
            )}
          >
            {expiryLabel(item, now)}
          </span>
          {item.credibility != null && (
            <span
              className={cn(
                "tabular-nums",
                item.credibility <= 3
                  ? "rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800"
                  : "text-muted-foreground"
              )}
            >
              신뢰 {item.credibility}/5{item.credibility <= 3 ? " · 정독" : ""}
            </span>
          )}
          {!item.image && <span className="text-amber-600">사진 없음</span>}
        </div>

        <p className="mt-1.5 text-sm leading-snug font-semibold">{item.title}</p>

        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <div className="bg-muted/50 rounded border p-2">
            <p className="text-muted-foreground mb-1 text-[10px] font-bold">원문 재료</p>
            <p className="text-muted-foreground max-h-[220px] overflow-auto text-[11px] leading-relaxed whitespace-pre-wrap">
              {item.sourceText?.slice(0, 2000) ?? "(원문 없음)"}
            </p>
          </div>
          <div className="rounded border p-2">
            <p className="mb-1 text-[10px] font-bold text-red-800">우리 초안</p>
            <p className="max-h-[220px] overflow-auto text-xs leading-relaxed">
              {item.body || "(본문 없음)"}
            </p>
          </div>
        </div>

        {/* 액션 — 발행·반려·스킵 + 펼치기. 편집·사가·VS 는 검수 페이지 몫 */}
        <div className="mt-2.5 flex items-center gap-1.5">
          <button
            onClick={() => decide("publish")}
            className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
          >
            발행 (P)
          </button>
          <button onClick={() => decide("reject")} className="rounded border px-3 py-1.5 text-xs">
            반려 (R)
          </button>
          <button
            onClick={next}
            className="text-muted-foreground rounded border px-3 py-1.5 text-xs"
          >
            스킵 (←/→)
          </button>
          <button
            onClick={() => setModal(true)}
            className="text-muted-foreground ml-auto rounded border px-2.5 py-1.5 text-[11px]"
          >
            펼치기 (E)
          </button>
        </div>
      </div>

      {undoBar && <UndoStrip kind={undoBar.kind} onUndo={undoLast} />}

      {/* 다음 예고 한 줄 */}
      {items.length > 1 && (
        <button
          onClick={next}
          className="text-muted-foreground hover:bg-muted/50 mt-1.5 w-full truncate rounded border border-dashed px-2 py-1 text-left text-[11px]"
        >
          다음 → {items[(cursor + 1) % items.length].breaking ? "🚨 " : ""}
          {items[(cursor + 1) % items.length].title}
        </button>
      )}

      {/* 펼치기 모달 — 원문 전문 대조. 편집이 필요하면 검수 페이지로 */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          onClick={() => setModal(false)}
        >
          <div
            className="bg-background max-h-[85vh] w-full max-w-[1100px] overflow-auto rounded-xl border p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <p className="text-base font-bold">{item.title}</p>
              <button
                onClick={() => setModal(false)}
                className="text-muted-foreground ml-auto rounded border px-2 py-1 text-xs"
              >
                닫기 (Esc)
              </button>
            </div>
            {item.originalTitle && (
              <p className="text-muted-foreground mt-1 text-xs">원제 {item.originalTitle}</p>
            )}
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="bg-muted/50 rounded-lg border p-3">
                <p className="text-muted-foreground mb-1 text-[11px] font-bold">원문 재료</p>
                <p className="text-muted-foreground max-h-[50vh] overflow-auto text-xs leading-relaxed whitespace-pre-wrap">
                  {item.sourceText ?? "(원문 없음)"}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="mb-1 text-[11px] font-bold text-red-800">우리 초안</p>
                <p className="max-h-[50vh] overflow-auto text-sm leading-relaxed">{item.body}</p>
              </div>
            </div>
            <p className="text-muted-foreground mt-3 text-[11px]">
              본문 편집·말머리·사가 연결·VS 는{" "}
              <Link href="/admin/news-review" className="font-bold underline">
                뉴스 검수 페이지
              </Link>
              에서.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => decide("publish")}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
              >
                발행
              </button>
              <button onClick={() => decide("reject")} className="rounded border px-4 py-2 text-sm">
                반려
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** 유예 커밋 안내 줄 — 5초 안에 Z 나 클릭으로 회수 가능 */
function UndoStrip({ kind, onUndo }: { kind: "publish" | "reject"; onUndo: () => void }) {
  return (
    <div className="mt-1.5 flex items-center gap-2 rounded border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
      <span>{kind === "publish" ? "발행" : "반려"} 예약됨 — 5초 뒤 실행</span>
      <button
        onClick={onUndo}
        className="ml-auto rounded border border-amber-400 px-2 py-0.5 font-bold"
      >
        되돌리기 (Z)
      </button>
    </div>
  )
}

/**
 * 운영 전황판 — **전 항목 항상 표시** (2026-08-30 운영자 확정: "오류 있는지 없는지"
 * 자체가 정보). 정상 = 초록 체크 + 흐린 한 줄, 이상 = 빨간 굵은 줄 + 이동 링크.
 */
export interface StatusRow {
  label: string
  /** 표시값 — "0건"·"정상 (32분 전)"·"381건" */
  value: string
  ok: boolean
  /** 이상일 때만 노출되는 액션 라벨 */
  action?: string
  /** 액션이 데려가는 관리 페이지 */
  href?: string
  /** ok 여도 주의 표시 (앰버) — 예: 접수 경로 미배선 */
  note?: string
  /** 이상일 때 줄 아래 펼치는 실물 목록 — "숫자만으론 뭔지 모른다" (운영자) */
  detail?: string[]
}

export function StatusBoard({ rows }: { rows: StatusRow[] }) {
  return (
    <Widget title="운영 전황" tone={rows.some((r) => !r.ok) ? "danger" : "default"}>
      <ul className="divide-y">
        {rows.map((r) => (
          <li key={r.label} className="py-1.5 text-xs">
            <div className="flex items-center gap-2">
              <span aria-hidden>{r.ok ? "✅" : "🔴"}</span>
              <span className={cn(r.ok ? "text-muted-foreground" : "font-bold text-red-700")}>
                {r.label}
              </span>
              {r.note && <span className="text-[10px] text-amber-600">{r.note}</span>}
              <span
                className={cn(
                  "ml-auto tabular-nums",
                  r.ok ? "text-muted-foreground" : "font-bold text-red-700"
                )}
              >
                {r.value}
              </span>
              {!r.ok && r.action && r.href && (
                <Link
                  href={r.href}
                  className="rounded bg-neutral-900 px-2 py-0.5 text-[11px] font-medium text-white"
                >
                  {r.action}
                </Link>
              )}
            </div>
            {/* 이상 항목은 실물을 줄 밑에 펼친다 — 숫자만 던지지 않는다 */}
            {!r.ok && r.detail && r.detail.length > 0 && (
              <ul className="text-muted-foreground mt-1 space-y-0.5 pl-6 text-[11px]">
                {r.detail.map((line) => (
                  <li key={line} className="truncate">
                    · {line}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Widget>
  )
}

/**
 * 티커 즉시 삭제 — 담벼락 티커에 이상한 게 올라오면 여기서 바로 죽인다.
 * (구 대시보드 DashboardNewsCrawler 의 실용 기능 승계)
 */
export function TickerModPanel({ items: initial }: { items: { id: string; title: string }[] }) {
  const [items, setItems] = useState(initial)
  const busyRef = useRef<Set<string>>(new Set())

  const remove = async (t: { id: string; title: string }, index: number) => {
    if (busyRef.current.has(t.id)) return
    busyRef.current.add(t.id)
    setItems((prev) => prev.filter((x) => x.id !== t.id))
    try {
      const res = await fetch(`/api/admin/content/ticker?id=${encodeURIComponent(t.id)}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string }
        toast({ variant: "destructive", title: "삭제 실패", description: d.error ?? "다시 시도" })
        setItems((prev) => {
          const next = [...prev]
          next.splice(Math.min(index, next.length), 0, t)
          return next
        })
      }
    } catch {
      toast({ variant: "destructive", title: "네트워크 오류", description: "행을 되살렸습니다." })
      setItems((prev) => {
        const next = [...prev]
        next.splice(Math.min(index, next.length), 0, t)
        return next
      })
    } finally {
      busyRef.current.delete(t.id)
    }
  }

  return (
    <Widget kicker="TICKER" title="뉴스 티커 최근" count={items.length}>
      {items.length === 0 ? (
        <p className="text-muted-foreground py-3 text-center text-xs">최근 티커 없음</p>
      ) : (
        <ul className="divide-y">
          {items.map((t, i) => (
            <li key={t.id} className="flex items-center gap-2 py-1.5 text-xs">
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <button
                onClick={() => void remove(t, i)}
                className="shrink-0 rounded border border-red-200 px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                즉시 삭제
              </button>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  )
}

/**
 * 참여도 패널 — 오늘 vs 어제. 큰 숫자 + 어제 대비 증감.
 * 색은 숫자가 아니라 화살표에만 — 0이 많은 시기라 빨간 판이 되지 않게.
 */
export function ParticipationPanel({
  rows,
}: {
  rows: { label: string; today: number; yesterday: number }[]
}) {
  return (
    <Widget kicker="PARTICIPATION" title="오늘의 참여">
      <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
        {rows.map((r) => {
          const diff = r.today - r.yesterday
          return (
            <div key={r.label} className="rounded-lg bg-neutral-50 px-3 py-2.5 dark:bg-neutral-800">
              <p className="text-muted-foreground text-[11px]">{r.label}</p>
              <p className="text-xl font-extrabold tabular-nums">{r.today.toLocaleString()}</p>
              <p
                className={cn(
                  "text-[11px] tabular-nums",
                  diff > 0
                    ? "text-emerald-600"
                    : diff < 0
                      ? "text-red-500"
                      : "text-muted-foreground"
                )}
              >
                {diff > 0 ? `▲ ${diff}` : diff < 0 ? `▼ ${Math.abs(diff)}` : "—"} 어제{" "}
                {r.yesterday.toLocaleString()}
              </p>
            </div>
          )
        })}
      </div>
    </Widget>
  )
}

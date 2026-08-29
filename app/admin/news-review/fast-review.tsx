"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import dynamic from "next/dynamic"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { isContentFreeText } from "@/lib/news/content-quality"

const TipTapContent = dynamic(
  () => import("@/components/editor/tiptap-content").then((m) => m.TipTapContent),
  { ssr: false }
)
const TipTapEditor = dynamic(
  () => import("@/components/editor/tiptap-editor").then((m) => m.TipTapEditor),
  { ssr: false }
)

/**
 * 뉴스 검수 — 카드 덱. 한 번에 한 건, ←/→ 로 넘긴다.
 *
 * ── 2026-08-30 개편 (3인 감사 + design-demo/news-review 시안 → 운영자 판정) ──
 * 운영자: "쭉 스크롤 내리면서 너무 많은 글이 있으면 건너뛴다. 좌우 키로 넘기고,
 * 몇 개 남았는지 보이고, 발행·반려·스킵 정도만 있으면 좋겠다."
 *
 *  ① 만료 시계 — 서버가 크론과 같은 규칙(일반 24h/속보 48h)으로 계산한 expiresAt 을
 *     내려주고, 클라이언트가 실시간 감산한다. 종전엔 24h 단일 계산 + "48시간" 문구 +
 *     로드 시점 고정이라 시계가 세 겹으로 거짓말했다.
 *  ② 속보 최상단 — 정렬·뱃지는 서버(page.tsx)가 breaking 우선으로 내려준다.
 *  ③ 원키 사고 방지 — P/R 은 5초 유예 뒤 실제 커밋(그동안 Z 로 회수). SELECT 포커스
 *     중엔 단축키 무시(사가 셀렉트에 포커스 둔 채 R = 반려 실사고).
 *  ④ 판단 신호 — 신뢰·중요도를 분모(5점 만점)와 함께, 원문·초안은 나란히 2열.
 *  ⑤ 덱 — 목록이 아예 없다. 카드 하나 + "다음" 한 줄 + 남은 개수. 스킵은 결정을
 *     미루는 정식 동작이다 (종전엔 보류 = 방치 = 만료 사형선고였다).
 *
 * 본문을 고치면 그 교정이 표기 사전으로 학습되므로(lib/news/learn-corrections)
 * 편집은 품질 루프의 입력이다 — 수정 경로(E)는 그대로 유지한다.
 */

export interface FlairChoice {
  id: string
  name: string
  color: string | null
  team_id: string | null
}

export interface SagaOption {
  id: string
  title: string
  saga_type: string
  stage: string
}

/** 항목별 사가 연결 선택 — auto(기본)는 서버에 안 보내고 현행 LLM 추출에 맡긴다 */
interface SagaPick {
  mode: "auto" | "none" | "existing" | "new"
  sagaId?: string
  player?: string
  playerKr?: string
  direction: "in" | "out"
}

const SAGA_PICK_DEFAULT: SagaPick = { mode: "auto", direction: "in" }

export interface DeskItem {
  id: string
  title: string
  /** 봇이 참고한 영문 원제 — 초안 제목과 대조용 */
  originalTitle: string | null
  /** 카드에 보여줄 본문 앞부분 */
  body: string
  bodyLength: number
  image: string | null
  content: unknown
  /** 스캐너가 참고한 원문 재료 (기사 발췌/트윗 전문) — 검수자가 대조하며 고치라고 */
  sourceText: string | null
  sourceUrl: string | null
  createdAt: string
  /** 자동 만료 시각 — 크론과 같은 규칙(일반 24h/속보 48h)로 서버가 계산 */
  expiresAt: string
  /** 오피셜급(브레이킹) — 크론의 isBreakingNewsItem 과 같은 판정 */
  breaking: boolean
  /** 1~5 (DB 실측 스케일 — 분모 없이 표기하지 말 것) */
  credibility: number | null
  /** 1~5 */
  importance: number | null
  suggestedFlairIds: string[]
  /** 스캐너의 VS 쟁점 제안 — confidence >= 0.7 이면 기본 켜짐(fail-open) */
  vs: { question: string; option_a: string; option_b: string; confidence: number } | null
}

/** 검수자의 VS 결정 (항목별) — 미결정이면 confidence 기본값을 따른다 */
interface VsDecision {
  enabled?: boolean
  question?: string
  optionA?: string
  optionB?: string
}

/** P/R 유예 커밋 — 5초 안에 Z 를 누르면 회수된다 */
interface PendingCommit {
  item: DeskItem
  index: number
  kind: "publish" | "reject"
  body: string
  timer: ReturnType<typeof setTimeout>
}

const UNDO_MS = 5000

function hoursLeftOf(item: DeskItem, now: number): number {
  return (new Date(item.expiresAt).getTime() - now) / 3600_000
}

/** ① 살아 움직이는 만료 라벨 — 음수면 그대로 말한다 (0으로 뭉개면 브레이킹이 죽어 보인다) */
function expiryLabel(item: DeskItem, now: number): string {
  const h = hoursLeftOf(item, now)
  if (h < 0) return "만료 지남"
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}분 남음`
  return `${Math.floor(h)}시간 남음`
}

export function FastReview({
  items,
  flairs,
  sagas,
}: {
  items: DeskItem[]
  flairs: FlairChoice[]
  sagas: SagaOption[]
}) {
  const [queue, setQueue] = useState(items)
  const [cursor, setCursor] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  /** 편집 모드 — 제목·본문을 고칠 수 있다 */
  const [editing, setEditing] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [editContent, setEditContent] = useState<unknown>(null)
  const [flairSel, setFlairSel] = useState<Record<string, string[]>>({})
  const [sagaSel, setSagaSel] = useState<Record<string, SagaPick>>({})
  const [vsDecisions, setVsDecisions] = useState<Record<string, VsDecision>>({})
  const [vsEditing, setVsEditing] = useState<string | null>(null)
  /** ③ 유예 중인 커밋 (id → 예약) + 화면의 되돌리기 바 */
  const pendingRef = useRef(new Map<string, PendingCommit>())
  const [undoBar, setUndoBar] = useState<{
    id: string
    kind: "publish" | "reject"
    title: string
  } | null>(null)
  const [doneCount, setDoneCount] = useState(0)
  const mountedRef = useRef(true)

  // ① 시계 — 30초마다 실시간. 종전엔 페이지 로드 시점에 고정이었다
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const current = queue[Math.min(cursor, Math.max(0, queue.length - 1))]

  const flairsFor = useCallback(
    (item: DeskItem) => flairSel[item.id] ?? item.suggestedFlairIds,
    [flairSel]
  )

  const sagaPickFor = useCallback(
    (item: DeskItem) => sagaSel[item.id] ?? SAGA_PICK_DEFAULT,
    [sagaSel]
  )

  /** ⑤ 스킵 = 다음 카드로 (결정 없음). 끝에 닿으면 처음으로 돌아온다 — 남은 것을 순환 */
  const next = useCallback(() => {
    setEditing(null)
    setCursor((c) => (queue.length === 0 ? 0 : (c + 1) % queue.length))
  }, [queue.length])
  const prev = useCallback(() => {
    setEditing(null)
    setCursor((c) => (queue.length === 0 ? 0 : (c - 1 + queue.length) % queue.length))
  }, [queue.length])

  /** 처리 끝난 항목을 큐에서 빼고 커서 제자리 유지 (다음 카드가 그 자리로 들어온다) */
  const removeFromQueue = useCallback((ids: string[]) => {
    const gone = new Set(ids)
    setQueue((prev) => {
      const nextQ = prev.filter((i) => !gone.has(i.id))
      setCursor((c) => Math.min(c, Math.max(0, nextQ.length - 1)))
      return nextQ
    })
    setSelected((prev) => {
      const nextSel = new Set(prev)
      for (const id of ids) nextSel.delete(id)
      return nextSel
    })
    setEditing(null)
  }, [])

  /** publish/save 요청 몸통 — act(즉시)와 decide(유예 커밋)가 같은 것을 쓴다 */
  const buildBody = useCallback(
    (
      item: DeskItem,
      action: "publish" | "reject" | "save",
      override?: { title?: string; content?: unknown }
    ): string => {
      const sagaPick = sagaPickFor(item)
      return JSON.stringify({
        id: item.id,
        action,
        // reject 는 기본 몸통 없음 — 단, 편집본과 함께 오면 "고치고 반려"(학습만)
        ...(action !== "reject"
          ? {
              title: override?.title ?? item.title,
              content: override?.content ?? item.content,
              ...(action === "publish" ? { flair_ids: flairsFor(item) } : {}),
              ...(action === "publish" && sagaPick.mode !== "auto"
                ? {
                    saga: {
                      mode: sagaPick.mode,
                      ...(sagaPick.mode === "existing" ? { saga_id: sagaPick.sagaId } : {}),
                      ...(sagaPick.mode === "new"
                        ? {
                            player: sagaPick.player?.trim() || undefined,
                            player_kr: sagaPick.playerKr?.trim() || undefined,
                            direction: sagaPick.direction,
                          }
                        : {}),
                    },
                  }
                : {}),
              ...(action === "publish" && item.vs && vsDecisions[item.id]
                ? { vs: vsDecisions[item.id] }
                : {}),
            }
          : override
            ? { title: override.title, content: override.content }
            : {}),
      })
    },
    [flairsFor, sagaPickFor, vsDecisions]
  )

  /** 새 사가 모드인데 선수명이 없으면 발행 불가 — decide/act 공통 검증 */
  const publishBlocked = useCallback(
    (item: DeskItem): boolean => {
      const pick = sagaPickFor(item)
      if (pick.mode === "new" && !pick.player?.trim() && !pick.playerKr?.trim()) {
        toast({
          variant: "destructive",
          title: "사가 선수명 필요",
          description: "새 사가를 만들려면 선수명을 입력하세요.",
        })
        return true
      }
      return false
    },
    [sagaPickFor]
  )

  /** 서버 응답 공통 후처리 — 발행/반려 결과 토스트 */
  const reportResult = useCallback(
    (
      kind: "publish" | "reject",
      d: {
        learning?: boolean
        saga?: { slug: string; title: string } | null
        saga_error?: string
      }
    ) => {
      if (kind === "publish") {
        const parts = [
          d.saga ? `사가 연결: ${d.saga.title}` : null,
          d.learning ? "고치신 표기를 학습해 다음 기사에 반영합니다." : null,
        ].filter(Boolean)
        toast({ title: "발행 완료", description: parts.length ? parts.join(" · ") : undefined })
        if (d.saga_error) {
          toast({
            variant: "destructive",
            title: "사가 연결 실패 (발행은 완료)",
            description: d.saga_error,
          })
        }
      } else if (d.learning) {
        toast({
          title: "반려 + 학습",
          description: "기사는 버리고, 고치신 표기만 사전에 반영합니다.",
        })
      }
    },
    []
  )

  /** ③ 유예 커밋 실행 — 5초가 지났거나 화면을 떠날 때 */
  const commit = useCallback(
    async (id: string, keepalive = false) => {
      const p = pendingRef.current.get(id)
      if (!p) return
      pendingRef.current.delete(id)
      clearTimeout(p.timer)
      setUndoBar((bar) => (bar?.id === id ? null : bar))
      const restore = () => {
        if (!mountedRef.current) return
        setQueue((prevQ) => {
          const nextQ = [...prevQ]
          nextQ.splice(Math.min(p.index, nextQ.length), 0, p.item)
          return nextQ
        })
        setDoneCount((n) => Math.max(0, n - 1))
      }
      try {
        const res = await fetch("/api/admin/news-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: p.body,
          ...(keepalive ? { keepalive: true } : {}),
        })
        if (keepalive) return // 떠나는 길 — 응답을 기다리지 않는다
        const d = (await res.json().catch(() => ({}))) as {
          error?: string
          learning?: boolean
          saga?: { slug: string; title: string } | null
          saga_error?: string
        }
        if (!res.ok) {
          // 실패 — 항목을 큐로 되살린다 (조용히 사라지는 것이 최악이다)
          toast({
            variant: "destructive",
            title: "처리 실패",
            description: d.error ?? "다시 시도하세요",
          })
          restore()
          return
        }
        reportResult(p.kind, d)
      } catch {
        if (!keepalive) {
          toast({
            variant: "destructive",
            title: "네트워크 오류",
            description: "항목을 큐에 되살렸습니다.",
          })
          restore()
        }
      }
    },
    [reportResult]
  )

  /** ③ 발행/반려 — 화면에서 즉시 빼고 5초 뒤 실제 커밋. Z 로 회수 */
  const decide = useCallback(
    (item: DeskItem, kind: "publish" | "reject") => {
      if (pendingRef.current.has(item.id)) return
      if (kind === "publish" && publishBlocked(item)) return
      const index = queue.findIndex((i) => i.id === item.id)
      const body = buildBody(item, kind)
      removeFromQueue([item.id])
      setDoneCount((n) => n + 1)
      const timer = setTimeout(() => void commit(item.id), UNDO_MS)
      pendingRef.current.set(item.id, { item, index, kind, body, timer })
      setUndoBar({ id: item.id, kind, title: item.title })
    },
    [queue, buildBody, publishBlocked, removeFromQueue, commit]
  )

  /** ③ 되돌리기 — 마지막 유예 커밋을 회수해 제자리에 되살린다 */
  const undoLast = useCallback(() => {
    setUndoBar((bar) => {
      if (!bar) return null
      const p = pendingRef.current.get(bar.id)
      if (!p) return null
      clearTimeout(p.timer)
      pendingRef.current.delete(bar.id)
      setQueue((prevQ) => {
        const nextQ = [...prevQ]
        const at = Math.min(p.index, nextQ.length)
        nextQ.splice(at, 0, p.item)
        setCursor(at)
        return nextQ
      })
      setDoneCount((n) => Math.max(0, n - 1))
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

  /** 편집 모드의 저장/수정본 발행/고치고 반려 — 의도적 행동이라 유예 없이 즉시 */
  const act = useCallback(
    async (
      item: DeskItem,
      action: "publish" | "reject" | "save",
      override?: { title?: string; content?: unknown }
    ) => {
      if (busy) return
      if (action === "publish" && publishBlocked(item)) return
      setBusy(true)
      try {
        const res = await fetch("/api/admin/news-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: buildBody(item, action, override),
        })
        const d = (await res.json().catch(() => ({}))) as {
          error?: string
          learning?: boolean
          saga?: { slug: string; title: string } | null
          saga_error?: string
        }
        if (!res.ok) {
          toast({ variant: "destructive", title: "실패", description: d.error ?? "처리 실패" })
          return
        }

        if (action === "save") {
          // 발행 안 함 — 큐에 남기고 수정본만 반영
          setQueue((prevQ) =>
            prevQ.map((i) =>
              i.id === item.id
                ? {
                    ...i,
                    title: override?.title ?? i.title,
                    content: override?.content ?? i.content,
                  }
                : i
            )
          )
          setEditing(null)
          toast({ title: "수정 저장됨", description: "발행 전까지 보관됩니다." })
          return
        }

        removeFromQueue([item.id])
        setDoneCount((n) => n + 1)
        reportResult(action, d)
      } finally {
        setBusy(false)
      }
    },
    [busy, buildBody, publishBlocked, removeFromQueue, reportResult]
  )

  const bulkReject = useCallback(async () => {
    if (busy || selected.size === 0) return
    if (!confirm(`선택한 ${selected.size}건을 반려합니다. 계속할까요?`)) return
    setBusy(true)
    try {
      const ids = [...selected]
      const res = await fetch("/api/admin/news-review/bulk", {
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
      setDoneCount((n) => n + (d.rejected ?? ids.length))
      toast({
        title: `${d.rejected ?? 0}건 반려`,
        description: d.skipped ? `${d.skipped}건은 이미 처리되어 건너뜀` : undefined,
      })
    } finally {
      setBusy(false)
    }
  }, [busy, selected, removeFromQueue])

  const toggleSelect = useCallback((id: string) => {
    setSelected((prevSel) => {
      const nextSel = new Set(prevSel)
      if (nextSel.has(id)) nextSel.delete(id)
      else nextSel.add(id)
      return nextSel
    })
  }, [])

  const startEdit = useCallback((item: DeskItem) => {
    setEditing(item.id)
    setEditTitle(item.title)
    setEditContent(item.content)
  }, [])

  // ── 키보드 ────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 입력·에디터·셀렉트 안에서는 단축키를 먹지 않는다.
      // ③ SELECT 포함 — 사가 셀렉트에 포커스 둔 채 R 이 반려가 되던 실사고 구멍
      const el = e.target as HTMLElement | null
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      ) {
        if (e.key === "Escape") setEditing(null)
        return
      }
      const k = e.key.toLowerCase()
      if (k === "z") {
        e.preventDefault()
        undoLast()
        return
      }
      if (!current) return
      if (e.key === "ArrowRight" || k === "j" || k === "s") {
        e.preventDefault()
        next()
      } else if (e.key === "ArrowLeft" || k === "k") {
        e.preventDefault()
        prev()
      } else if (k === "p") {
        e.preventDefault()
        decide(current, "publish")
      } else if (k === "r") {
        e.preventDefault()
        decide(current, "reject")
      } else if (k === "x") {
        e.preventDefault()
        toggleSelect(current.id)
      } else if (k === "e") {
        e.preventDefault()
        startEdit(current)
      } else if (e.key === "Escape") {
        setEditing(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [current, next, prev, decide, undoLast, toggleSelect, startEdit])

  const breakingCount = queue.filter((i) => i.breaking).length
  const urgent = queue.filter((i) => hoursLeftOf(i, now) < 6).length
  const nextItem = queue.length > 1 ? queue[(cursor + 1) % queue.length] : null

  const item = current
  const isEditing = item ? editing === item.id : false
  const hl = item ? hoursLeftOf(item, now) : 0
  const checked = item ? selected.has(item.id) : false

  return (
    <div className="space-y-3">
      {/* ── 헤더: 남은 개수·속보·만료가 한 줄 ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-base font-bold">
          뉴스 검수{" "}
          <span className="text-muted-foreground font-normal">
            {queue.length > 0 ? `${cursor + 1} / ${queue.length}건 남음` : "0건"}
          </span>
        </h1>
        {breakingCount > 0 && (
          <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-[11px] font-bold text-white">
            🚨 오피셜급 {breakingCount}건 — 맨 앞
          </span>
        )}
        {urgent > 0 && (
          <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-bold text-red-700">
            ⏰ 6시간 내 만료 {urgent}건
          </span>
        )}
        <span className="text-muted-foreground ml-auto text-xs">
          오늘 처리 <b>{doneCount}</b>건 · 일반 24시간 / 오피셜급 48시간 뒤 자동 반려
        </span>
      </div>

      <div className="bg-muted/60 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-[11px]">
        <Kbd>←</Kbd>
        <Kbd>→</Kbd>
        <span className="text-muted-foreground">넘기기(스킵)</span>
        <Kbd>P</Kbd>
        <span className="text-muted-foreground">발행</span>
        <Kbd>R</Kbd>
        <span className="text-muted-foreground">반려</span>
        <Kbd>Z</Kbd>
        <span className="text-muted-foreground">되돌리기</span>
        <Kbd>E</Kbd>
        <span className="text-muted-foreground">수정</span>
        <Kbd>X</Kbd>
        <span className="text-muted-foreground">선택</span>
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

      {!item ? (
        <div className="bg-background rounded-xl border p-10 text-center">
          <p className="text-sm font-medium">
            검수 대기가 없습니다 — 오늘 {doneCount}건 처리했습니다.
          </p>
        </div>
      ) : (
        <div
          className={cn(
            "bg-background rounded-xl border p-4",
            item.breaking && "border-red-300 bg-red-50/30",
            checked && "ring-2 ring-red-400"
          )}
        >
          {/* ②④ 판단 신호 줄 */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {item.breaking ? (
              <span className="rounded bg-red-600 px-1.5 py-0.5 font-bold text-white">
                오피셜급
              </span>
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
                  "rounded px-1.5 py-0.5 tabular-nums",
                  item.credibility <= 3
                    ? "bg-amber-100 font-semibold text-amber-800"
                    : "text-muted-foreground"
                )}
              >
                신뢰 {item.credibility}/5{item.credibility <= 3 ? " · 정독" : ""}
              </span>
            )}
            {item.importance != null && (
              <span className="text-muted-foreground tabular-nums">가치 {item.importance}/5</span>
            )}
            <span className="text-muted-foreground">· 본문 {item.bodyLength}자</span>
            {isContentFreeText(item.body ?? "") && (
              <span className="font-semibold text-red-600">· 무내용 의심(원문 추출 실패)</span>
            )}
            {item.sourceText && item.sourceText.length > 800 && item.bodyLength < 300 && (
              <span className="font-semibold text-amber-600">
                · 원문 대비 부실 — 원문 {item.sourceText.length.toLocaleString()}자를{" "}
                {item.bodyLength}자로 퉁침
              </span>
            )}
            {!item.image && <span className="text-amber-600">· 사진 없음(떡밥 제외)</span>}
            {item.sourceUrl && (
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                원문 링크
              </a>
            )}
            <label className="text-muted-foreground ml-auto flex items-center gap-1">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleSelect(item.id)}
                className="h-3.5 w-3.5"
              />
              선택(X)
            </label>
          </div>

          {/* 제목 + 원제 대조 */}
          <div className="mt-2">
            {isEditing ? (
              <input
                autoFocus
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full rounded border px-2 py-1 text-base font-semibold"
                placeholder="제목"
              />
            ) : (
              <p className="text-base leading-snug font-semibold">{item.title}</p>
            )}
            {item.originalTitle && (
              <p className="text-muted-foreground mt-0.5 text-[12px]">
                원제 <span className="text-foreground/80">{item.originalTitle}</span>
              </p>
            )}
          </div>

          {/* 말머리 */}
          <div className="mt-2 flex flex-wrap gap-1">
            {flairs.map((f) => {
              const on = flairsFor(item).includes(f.id)
              return (
                <button
                  key={f.id}
                  onClick={() => {
                    const cur = flairsFor(item)
                    setFlairSel((prevSel) => ({
                      ...prevSel,
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

          {/* 사가 연결 — 기본 '자동'은 현행 LLM 추출 그대로 (2026-08-04 운영자) */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-muted-foreground font-medium">사가</span>
            {(() => {
              const pick = sagaPickFor(item)
              const setPick = (patch: Partial<SagaPick>) =>
                setSagaSel((prevSel) => ({
                  ...prevSel,
                  [item.id]: { ...sagaPickFor(item), ...patch },
                }))
              return (
                <>
                  <select
                    value={pick.mode === "existing" ? (pick.sagaId ?? "") : pick.mode}
                    onChange={(e) => {
                      const v = e.target.value
                      if (v === "auto" || v === "none" || v === "new") {
                        setPick({ mode: v, sagaId: undefined })
                      } else {
                        setPick({ mode: "existing", sagaId: v })
                      }
                    }}
                    className="bg-background max-w-[300px] rounded border px-1.5 py-1"
                  >
                    <option value="auto">자동 연결 (AI 추출)</option>
                    <option value="none">연결 안 함</option>
                    <option value="new">＋ 새 사가 만들기</option>
                    <optgroup label="이적 사가 (최근 활동순)">
                      {sagas
                        .filter((s) => s.saga_type === "transfer")
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title} · {s.stage}
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="팀 시즌 위키">
                      {sagas
                        .filter((s) => s.saga_type === "season")
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title}
                          </option>
                        ))}
                    </optgroup>
                  </select>
                  {pick.mode === "new" && (
                    <>
                      <input
                        value={pick.playerKr ?? ""}
                        onChange={(e) => setPick({ playerKr: e.target.value })}
                        placeholder="선수명 (한글)"
                        className="w-[110px] rounded border px-1.5 py-1"
                      />
                      <input
                        value={pick.player ?? ""}
                        onChange={(e) => setPick({ player: e.target.value })}
                        placeholder="영문/로마자"
                        className="w-[120px] rounded border px-1.5 py-1"
                      />
                      <button
                        onClick={() =>
                          setPick({ direction: pick.direction === "in" ? "out" : "in" })
                        }
                        className={cn(
                          "rounded border px-2 py-1 font-medium",
                          pick.direction === "in"
                            ? "border-emerald-300 text-emerald-700"
                            : "border-red-300 text-red-700"
                        )}
                        title="영입(IN) / 이탈(OUT) 드라마 — 클릭해서 전환"
                      >
                        {pick.direction === "in" ? "IN 영입" : "OUT 이탈"}
                      </button>
                      <span className="text-muted-foreground">
                        한글이 사전에 없으면 영문 필수 · 같은 선수 사가가 있으면 자동 합류
                      </span>
                    </>
                  )}
                </>
              )
            })()}
          </div>

          {/* VS 쟁점 — fail-open (기본 켜짐, 1클릭 끄기) */}
          {item.vs &&
            (() => {
              const dec = vsDecisions[item.id] ?? {}
              const defaultOn = item.vs.confidence >= 0.7
              const isOn = dec.enabled ?? defaultOn
              const q = dec.question ?? item.vs.question
              const oa = dec.optionA ?? item.vs.option_a
              const ob = dec.optionB ?? item.vs.option_b
              const isVsEditing = vsEditing === item.id
              const setDec = (patch: VsDecision) =>
                setVsDecisions((prevDec) => ({
                  ...prevDec,
                  [item.id]: { ...prevDec[item.id], ...patch },
                }))
              return (
                <div
                  className="mt-2 rounded-lg border px-3 py-2 text-xs"
                  style={{
                    background: isOn ? "rgba(150,30,55,0.05)" : "var(--wc-soft, #f5f2ec)",
                    opacity: isOn ? 1 : 0.75,
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-extrabold"
                      style={{
                        background: isOn ? "rgba(150,30,55,0.15)" : "rgba(0,0,0,0.08)",
                        color: isOn ? "var(--wc-burgundy, #961e37)" : "#777",
                      }}
                    >
                      VS 쟁점 {isOn ? "켜짐" : defaultOn ? "꺼짐(수동)" : "제안"}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      신뢰도 {item.vs.confidence.toFixed(2)}
                    </span>
                    {!isVsEditing ? (
                      <>
                        <span className="font-semibold">{q}</span>
                        <span className="text-muted-foreground">
                          「{oa}」 vs 「{ob}」
                        </span>
                        <span className="ml-auto flex gap-1.5">
                          <button
                            onClick={() => setDec({ enabled: !isOn })}
                            disabled={busy}
                            className="rounded border px-2 py-1 text-[11px] disabled:opacity-50"
                          >
                            {isOn ? "끄기" : "켜기"}
                          </button>
                          <button
                            onClick={() => setVsEditing(item.id)}
                            disabled={busy}
                            className="rounded border px-2 py-1 text-[11px] disabled:opacity-50"
                          >
                            문구수정
                          </button>
                        </span>
                      </>
                    ) : (
                      <span className="flex flex-1 flex-wrap items-center gap-1.5">
                        <input
                          defaultValue={q}
                          onChange={(e) => setDec({ question: e.target.value })}
                          maxLength={80}
                          className="min-w-[220px] flex-1 rounded border px-2 py-1 text-[12px]"
                          placeholder="쟁점 질문 (의문형)"
                        />
                        <input
                          defaultValue={oa}
                          onChange={(e) => setDec({ optionA: e.target.value })}
                          maxLength={24}
                          className="w-[110px] rounded border px-2 py-1 text-[12px]"
                        />
                        <input
                          defaultValue={ob}
                          onChange={(e) => setDec({ optionB: e.target.value })}
                          maxLength={24}
                          className="w-[110px] rounded border px-2 py-1 text-[12px]"
                        />
                        <button
                          onClick={() => setVsEditing(null)}
                          className="rounded border px-2 py-1 text-[11px]"
                        >
                          완료
                        </button>
                      </span>
                    )}
                  </div>
                </div>
              )
            })()}

          {/* ④ 본문 — 원문과 초안을 나란히. 덱이라 항상 펼쳐져 있다 */}
          <div className={cn("mt-3 gap-2", item.sourceText && "md:grid md:grid-cols-2")}>
            {item.sourceText && (
              <div className="bg-muted/50 mb-2 rounded-lg border md:mb-0">
                <p className="text-muted-foreground px-3 pt-2 text-[11px] font-medium">
                  원문 재료 — 대조하며 고치세요
                </p>
                <p className="text-muted-foreground max-h-[440px] overflow-auto px-3 pb-3 text-xs leading-relaxed whitespace-pre-wrap">
                  {item.sourceText}
                </p>
              </div>
            )}
            <div className="bg-background max-h-[440px] overflow-auto rounded-lg border p-3">
              {isEditing ? (
                <TipTapEditor content={item.content} onChange={setEditContent} />
              ) : item.content ? (
                <TipTapContent content={item.content} />
              ) : (
                <span className="text-muted-foreground text-sm">(본문 없음)</span>
              )}
            </div>
          </div>

          {/* ── 행동 줄: 발행 · 반려 · 스킵 (운영자 주문 그대로) ── */}
          {isEditing ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() =>
                  void act(item, "save", { title: editTitle, content: editContent ?? item.content })
                }
                disabled={busy || !editTitle.trim()}
                className="rounded border px-3 py-1.5 text-xs disabled:opacity-50"
              >
                수정 저장
              </button>
              <button
                onClick={() =>
                  void act(item, "publish", {
                    title: editTitle,
                    content: editContent ?? item.content,
                  })
                }
                disabled={busy || !editTitle.trim()}
                className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                수정본 발행
              </button>
              <button
                onClick={() =>
                  void act(item, "reject", {
                    title: editTitle,
                    content: editContent ?? item.content,
                  })
                }
                disabled={busy || !editTitle.trim()}
                title="기사는 발행하지 않고, 고친 표기만 사전에 학습시킵니다"
                className="rounded border border-red-300 px-3 py-1.5 text-xs text-red-700 disabled:opacity-50"
              >
                고치고 반려 (학습만)
              </button>
              <button
                onClick={() => setEditing(null)}
                disabled={busy}
                className="text-muted-foreground rounded border px-3 py-1.5 text-xs"
              >
                취소
              </button>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => decide(item, "publish")}
                disabled={busy}
                className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                발행 (P)
              </button>
              <button
                onClick={() => decide(item, "reject")}
                disabled={busy}
                className="rounded-lg border px-5 py-2 text-sm font-medium disabled:opacity-50"
              >
                반려 (R)
              </button>
              <button
                onClick={next}
                className="text-muted-foreground rounded-lg border px-5 py-2 text-sm font-medium"
              >
                스킵 (→)
              </button>
              <button
                onClick={() => startEdit(item)}
                disabled={busy}
                className="text-muted-foreground ml-auto rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
              >
                수정 (E)
              </button>
            </div>
          )}
        </div>
      )}

      {/* 다음 카드 예고 — 넘기기 전에 뭐가 오는지 한 줄 */}
      {nextItem && (
        <button
          onClick={next}
          className="text-muted-foreground hover:bg-muted/50 block w-full truncate rounded-lg border border-dashed px-4 py-2 text-left text-xs"
        >
          다음 → {nextItem.breaking ? "🚨 " : ""}
          {nextItem.title}
        </button>
      )}

      {/* ③ 되돌리기 바 — P/R 후 5초. Z 또는 클릭으로 회수 */}
      {undoBar && (
        <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-neutral-900 px-4 py-2.5 text-xs font-medium text-white shadow-lg">
          <span className="max-w-[300px] truncate">
            {undoBar.kind === "publish" ? "발행" : "반려"} 예약 — {undoBar.title}
          </span>
          <button
            onClick={undoLast}
            className="rounded-full bg-red-700 px-2.5 py-1 text-[11px] font-bold"
          >
            되돌리기 (Z)
          </button>
        </div>
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

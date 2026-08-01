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
 * 뉴스 검수 — 훑기(목록)와 파고들기(본문)를 한 화면에서.
 *
 * 두 화면을 합친 결과다:
 *  · 빠른 목록(구 /admin2/news) — 하루 ~47건 유입 vs 1인 검수라는 현실에 맞춘 부분.
 *    옛 화면은 50건만 보여줘 나머지가 존재조차 모른 채 48시간 뒤 만료됐고,
 *    최신순이라 **먼저 사라질 것이 맨 아래**에 있었다.
 *  · 본문 열람·편집(구 review-client) — 제목만 보고 발행할 수는 없다. 특히 본문을
 *    고치면 그 교정이 표기 사전으로 학습되므로(lib/news/learn-corrections) 편집은
 *    품질 루프의 입력이다.
 *
 * 그래서: 목록은 빠르게 훑고, 선택한 한 건만 본문을 펼쳐 읽거나 고친다.
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
  /** 카드에 보여줄 본문 앞부분 */
  body: string
  bodyLength: number
  image: string | null
  content: unknown
  /** 스캐너가 참고한 원문 재료 (기사 발췌/트윗 전문) — 검수자가 대조하며 고치라고 */
  sourceText: string | null
  sourceUrl: string | null
  createdAt: string
  /** 자동 만료까지 남은 시간 */
  hoursLeft: number
  credibility: number | null
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

export function FastReview({ items, flairs }: { items: DeskItem[]; flairs: FlairChoice[] }) {
  const [queue, setQueue] = useState(items)
  const [cursor, setCursor] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  /** 본문까지 펼쳐 보는 항목 (한 번에 하나) */
  const [expanded, setExpanded] = useState<string | null>(null)
  /** 편집 모드 — 제목·본문을 고칠 수 있다 */
  const [editing, setEditing] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [editContent, setEditContent] = useState<unknown>(null)
  const [flairSel, setFlairSel] = useState<Record<string, string[]>>({})
  const [vsDecisions, setVsDecisions] = useState<Record<string, VsDecision>>({})
  /** VS 문구 인라인 수정 중인 항목 id */
  const [vsEditing, setVsEditing] = useState<string | null>(null)
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
    setExpanded(null)
    setEditing(null)
  }, [])

  const act = useCallback(
    async (
      item: DeskItem,
      action: "publish" | "reject" | "save",
      override?: { title?: string; content?: unknown }
    ) => {
      if (busy) return
      setBusy(true)
      try {
        const res = await fetch("/api/admin/news-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: item.id,
            action,
            // reject 는 기본 몸통 없음 — 단, 편집본과 함께 오면 "고치고 반려"(학습만)
            ...(action !== "reject"
              ? {
                  title: override?.title ?? item.title,
                  content: override?.content ?? item.content,
                  ...(action === "publish" ? { flair_ids: flairsFor(item) } : {}),
                  ...(action === "publish" && item.vs && vsDecisions[item.id]
                    ? { vs: vsDecisions[item.id] }
                    : {}),
                }
              : override
                ? { title: override.title, content: override.content }
                : {}),
          }),
        })
        const d = (await res.json().catch(() => ({}))) as { error?: string; learning?: boolean }
        if (!res.ok) {
          toast({ variant: "destructive", title: "실패", description: d.error ?? "처리 실패" })
          return
        }

        if (action === "save") {
          // 발행 안 함 — 큐에 남기고 수정본만 반영
          setQueue((prev) =>
            prev.map((i) =>
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
        if (action === "publish") {
          toast({
            title: "발행 완료",
            description: d.learning ? "고치신 표기를 학습해 다음 기사에 반영합니다." : undefined,
          })
        } else if (action === "reject" && d.learning) {
          toast({
            title: "반려 + 학습",
            description: "기사는 버리고, 고치신 표기만 사전에 반영합니다.",
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

  const startEdit = useCallback((item: DeskItem) => {
    setExpanded(item.id)
    setEditing(item.id)
    setEditTitle(item.title)
    setEditContent(item.content)
  }, [])

  // ── 키보드 ────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 입력·에디터 안에서는 단축키를 먹지 않는다 (편집 중 R 이 반려가 되면 참사)
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
        startEdit(current)
      } else if (e.key === "Enter") {
        e.preventDefault()
        setExpanded((prev) => (prev === current.id ? null : current.id))
      } else if (e.key === "Escape") {
        setEditing(null)
        setExpanded(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [current, queue.length, act, toggleSelect, startEdit])

  // 커서가 화면 밖으로 나가면 따라간다
  useEffect(() => {
    if (!current) return
    rowRefs.current[current.id]?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [cursor, current])

  const urgent = queue.filter((i) => i.hoursLeft < 6).length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-bold">
            뉴스 검수 <span className="text-muted-foreground font-normal">{queue.length}건</span>
          </h1>
          <p className="text-muted-foreground mt-0.5 text-xs">
            만료 임박 순 · 48시간 지나면 자동 반려됩니다
            {urgent > 0 && (
              <span className="ml-1 font-medium text-red-600">6시간 내 {urgent}건</span>
            )}
          </p>
        </div>
      </div>

      <div className="bg-muted/60 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-[11px]">
        <Kbd>J</Kbd>
        <Kbd>K</Kbd>
        <span className="text-muted-foreground">이동</span>
        <Kbd>Enter</Kbd>
        <span className="text-muted-foreground">본문 펼치기</span>
        <Kbd>P</Kbd>
        <span className="text-muted-foreground">발행</span>
        <Kbd>R</Kbd>
        <span className="text-muted-foreground">반려</span>
        <Kbd>X</Kbd>
        <span className="text-muted-foreground">선택</span>
        <Kbd>E</Kbd>
        <span className="text-muted-foreground">수정</span>
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
        </div>
      ) : (
        <ul className="space-y-1.5">
          {queue.map((item, idx) => {
            const active = idx === cursor
            const checked = selected.has(item.id)
            const isOpen = expanded === item.id
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
                  {item.image && !isOpen && (
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
                        className="w-full rounded border px-2 py-1 text-sm font-medium"
                        placeholder="제목"
                      />
                    ) : (
                      <p className="text-sm leading-snug font-medium">{item.title}</p>
                    )}

                    {!isOpen && (
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{item.body}</p>
                    )}

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
                      {isContentFreeText(item.body ?? "") && (
                        <span className="font-semibold text-red-600">
                          · 무내용 의심(원문 추출 실패)
                        </span>
                      )}
                      {item.sourceText && item.sourceText.length > 800 && item.bodyLength < 300 && (
                        <span className="font-semibold text-amber-600">
                          · 원문 대비 부실 — 원문 {item.sourceText.length.toLocaleString()}자를{" "}
                          {item.bodyLength}자로 퉁침
                        </span>
                      )}
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
                      {!isOpen && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setCursor(idx)
                            setExpanded(item.id)
                          }}
                          className="underline underline-offset-2"
                        >
                          본문 펼치기
                        </button>
                      )}
                    </div>

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

                  {active && !isEditing && (
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
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          startEdit(item)
                        }}
                        disabled={busy}
                        className="rounded border px-3 py-1.5 text-xs disabled:opacity-50"
                      >
                        수정
                      </button>
                    </div>
                  )}
                </div>

                {/* ── VS 쟁점 인라인 카드 — fail-open (기본 켜짐, 1클릭 끄기) ──
                    3인 회의 결정: 아무것도 안 하면 confidence 0.7↑은 켜진 채 발행.
                    바쁘면 무시해도 좋은 방향(발행)으로 떨어진다. */}
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
                      setVsDecisions((prev) => ({
                        ...prev,
                        [item.id]: { ...prev[item.id], ...patch },
                      }))
                    return (
                      <div
                        onClick={(e) => e.stopPropagation()}
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

                {/* ── 본문 — 펼친 항목만. 제목만 보고 발행할 수는 없다 ────────── */}
                {isOpen && (
                  <div onClick={(e) => e.stopPropagation()} className="mt-3">
                    {item.sourceText && (
                      <details className="bg-muted/50 mb-2 rounded-lg border" open={isEditing}>
                        <summary className="text-muted-foreground cursor-pointer px-3 py-2 text-xs font-medium select-none">
                          원문 재료 — 스캐너가 참고한 소스 (대조하며 고치세요)
                        </summary>
                        <p className="text-muted-foreground max-h-[300px] overflow-auto px-3 pb-3 text-xs leading-relaxed whitespace-pre-wrap">
                          {item.sourceText}
                        </p>
                      </details>
                    )}
                    <div className="bg-background max-h-[460px] overflow-auto rounded-lg border p-3">
                      {isEditing ? (
                        <TipTapEditor content={item.content} onChange={setEditContent} />
                      ) : item.content ? (
                        <TipTapContent content={item.content} />
                      ) : (
                        <span className="text-muted-foreground text-sm">(본문 없음)</span>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() =>
                              void act(item, "save", {
                                title: editTitle,
                                content: editContent ?? item.content,
                              })
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
                        </>
                      ) : (
                        <button
                          onClick={() => setExpanded(null)}
                          className="text-muted-foreground rounded border px-3 py-1.5 text-xs"
                        >
                          본문 접기
                        </button>
                      )}
                    </div>
                  </div>
                )}
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

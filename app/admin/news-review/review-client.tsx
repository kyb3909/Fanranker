"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { Loader2, ExternalLink, Check, X, Pencil, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/hooks/use-toast"

const TipTapContent = dynamic(
  () => import("@/components/editor/tiptap-content").then((m) => m.TipTapContent),
  { ssr: false }
)
const TipTapEditor = dynamic(
  () => import("@/components/editor/tiptap-editor").then((m) => m.TipTapEditor),
  { ssr: false }
)

export interface ReviewItem {
  id: string
  title: string
  content: unknown
  tags: string[]
  sourceUrl: string | null
  originUrl: string | null
  scores: Record<string, unknown>
  createdAt: string
  /** 제목 기반 자동 추천 말머리 id 목록 (검수자가 수정 가능) */
  suggestedFlairIds: string[]
}

export interface FlairChoice {
  id: string
  name: string
  color: string | null
  team_id: string | null
}

export function NewsReviewClient({
  items: initial,
  flairs,
}: {
  items: ReviewItem[]
  flairs: FlairChoice[]
}) {
  const [items, setItems] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [editContent, setEditContent] = useState<unknown>(null)
  // 아이템별 선택된 말머리 (초기값 = 자동 추천). 발행 시 이 값이 전송됨.
  const [flairSel, setFlairSel] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(initial.map((it) => [it.id, it.suggestedFlairIds]))
  )

  function toggleFlair(itemId: string, flairId: string) {
    setFlairSel((s) => {
      const cur = s[itemId] ?? []
      return {
        ...s,
        [itemId]: cur.includes(flairId) ? cur.filter((x) => x !== flairId) : [...cur, flairId],
      }
    })
  }

  function startEdit(it: ReviewItem) {
    setEditingId(it.id)
    setEditTitle(it.title)
    setEditContent(it.content)
  }

  async function act(
    id: string,
    action: "publish" | "reject" | "save",
    payload?: { title: string; content: unknown }
  ) {
    if (busy) return
    setBusy(id)
    try {
      const res = await fetch("/api/admin/news-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          action,
          ...payload,
          // 발행 시에만 선택된 말머리 전송 (미선택이면 빈 배열 = 말머리 없음)
          ...(action === "publish" ? { flair_ids: flairSel[id] ?? [] } : {}),
        }),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast({ variant: "destructive", title: "오류", description: d.error || "처리 실패" })
        return
      }
      if (action === "save" && payload) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === id ? { ...it, title: payload.title, content: payload.content } : it
          )
        )
        setEditingId(null)
        toast({ title: "수정 저장됨", description: "발행 전까지 보관됩니다." })
      } else {
        setItems((prev) => prev.filter((it) => it.id !== id))
        if (editingId === id) setEditingId(null)
        toast({
          title: action === "publish" ? "발행 완료" : "반려 완료",
          description: action === "publish" ? "공놀이봇 이름으로 게시됐습니다." : undefined,
        })
      }
    } finally {
      setBusy(null)
    }
  }

  if (items.length === 0) {
    return (
      <div className="text-muted-foreground mt-10 rounded-lg border border-dashed p-10 text-center text-sm">
        검수할 초안이 없습니다.
      </div>
    )
  }

  return (
    <div className="mt-6 space-y-5">
      {items.map((it) => {
        const editing = editingId === it.id
        return (
          <div key={it.id} className="bg-card rounded-xl border p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              {editing ? (
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="제목"
                  className="text-base font-bold"
                />
              ) : (
                <h2 className="text-base font-bold">{it.title}</h2>
              )}
              <span className="text-muted-foreground shrink-0 text-xs">
                {new Date(it.createdAt).toLocaleString("ko-KR")}
              </span>
            </div>

            <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {typeof it.scores.credibility !== "undefined" && (
                <span>신뢰도 {String(it.scores.credibility)}</span>
              )}
              {typeof it.scores.importance !== "undefined" && (
                <span>중요도 {String(it.scores.importance)}</span>
              )}
              {it.tags.length > 0 && <span>#{it.tags.join(" #")}</span>}
              {it.sourceUrl && (
                <a
                  href={it.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline"
                >
                  원문 <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {it.originUrl && (
                <a
                  href={it.originUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline"
                >
                  r/soccer <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            {/* 말머리 선택 (다중) — 자동 추천이 기본 선택, 눌러서 토글 */}
            {flairs.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground mr-0.5 text-[11px]">말머리</span>
                {flairs.map((f) => {
                  const on = (flairSel[it.id] ?? []).includes(f.id)
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => toggleFlair(it.id, f.id)}
                      className="inline-flex h-6 items-center rounded px-2 text-[11.5px] font-bold transition-opacity hover:opacity-80"
                      style={
                        on
                          ? { background: f.color ?? "#334155", color: "#fff" }
                          : { background: "#eef0f3", color: "#64748b" }
                      }
                    >
                      {f.name}
                    </button>
                  )
                })}
              </div>
            )}

            <div className="bg-background mt-3 max-h-[460px] overflow-auto rounded-lg border p-3">
              {editing ? (
                <TipTapEditor content={it.content} onChange={setEditContent} />
              ) : it.content ? (
                <TipTapContent content={it.content} />
              ) : (
                <span className="text-muted-foreground text-sm">(본문 없음)</span>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {editing ? (
                <>
                  <Button
                    onClick={() =>
                      act(it.id, "save", { title: editTitle, content: editContent ?? it.content })
                    }
                    disabled={busy !== null || !editTitle.trim()}
                    size="sm"
                    variant="secondary"
                  >
                    {busy === it.id ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-1.5 h-4 w-4" />
                    )}
                    수정 저장
                  </Button>
                  <Button
                    onClick={() =>
                      act(it.id, "publish", {
                        title: editTitle,
                        content: editContent ?? it.content,
                      })
                    }
                    disabled={busy !== null || !editTitle.trim()}
                    size="sm"
                  >
                    <Check className="mr-1.5 h-4 w-4" />
                    수정본 발행
                  </Button>
                  <Button
                    onClick={() => setEditingId(null)}
                    disabled={busy !== null}
                    size="sm"
                    variant="ghost"
                  >
                    취소
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={() => act(it.id, "publish")} disabled={busy !== null} size="sm">
                    {busy === it.id ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-1.5 h-4 w-4" />
                    )}
                    발행
                  </Button>
                  <Button
                    onClick={() => startEdit(it)}
                    disabled={busy !== null}
                    size="sm"
                    variant="outline"
                  >
                    <Pencil className="mr-1.5 h-4 w-4" />
                    수정
                  </Button>
                  <Button
                    onClick={() => act(it.id, "reject")}
                    disabled={busy !== null}
                    size="sm"
                    variant="outline"
                  >
                    <X className="mr-1.5 h-4 w-4" />
                    반려
                  </Button>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

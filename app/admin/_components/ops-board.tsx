"use client"

import { useCallback, useEffect, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  SquareKanban,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  BOARD_STATUSES,
  BOARD_STATUS_LABEL,
  columnOf,
  moveCard,
  stepStatus,
  type BoardCard,
  type BoardStatus,
} from "@/lib/admin/board"

/**
 * 운영 할 일 보드 (2026-09-08) — 카드를 드래그하거나 ← → 로 열 사이를 옮긴다.
 * 옮긴 결과는 낙관적으로 먼저 그리고 /api/admin/board 에 저장한다. 저장에 실패하면 다시 읽는다.
 */

interface Draft {
  id?: string
  title: string
  detail: string
  tag: string
  effort: string
}

const EMPTY: Draft = { title: "", detail: "", tag: "", effort: "" }

export function OpsBoard() {
  const [cards, setCards] = useState<BoardCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/board")
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "불러오기 실패")
      setCards(data.cards)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오기 실패")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const move = useCallback(
    async (id: string, toStatus: BoardStatus, toIndex?: number) => {
      const result = moveCard(cards, id, toStatus, toIndex)
      if (result.moves.length === 0) return
      setCards(result.cards)
      try {
        const res = await fetch("/api/admin/board", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ moves: result.moves }),
        })
        if (!res.ok) throw new Error()
      } catch {
        setError("옮긴 위치를 저장하지 못했습니다. 다시 불러옵니다.")
        load()
      }
    },
    [cards, load]
  )

  const submitDraft = async () => {
    if (!draft || !draft.title.trim()) return
    setSaving(true)
    try {
      const isEdit = !!draft.id
      const res = await fetch("/api/admin/board", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draft.id,
          title: draft.title,
          detail: draft.detail,
          tag: draft.tag || null,
          effort: draft.effort || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? "저장 실패")
      if (isEdit) {
        setCards((prev) =>
          prev.map((c) =>
            c.id === draft.id
              ? {
                  ...c,
                  title: draft.title.trim(),
                  detail: draft.detail.trim(),
                  tag: draft.tag.trim() || null,
                  effort: draft.effort.trim() || null,
                }
              : c
          )
        )
      } else {
        setCards((prev) => [...prev, data.card])
      }
      setDraft(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패")
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!draft?.id || !confirm("이 카드를 지울까요?")) return
    setSaving(true)
    try {
      const res = await fetch("/api/admin/board", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: draft.id }),
      })
      if (!res.ok) throw new Error("삭제 실패")
      setCards((prev) => prev.filter((c) => c.id !== draft.id))
      setDraft(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제 실패")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <SquareKanban className="text-primary h-5 w-5" />
          <h1 className="text-lg font-bold">할 일 보드</h1>
          <span className="text-muted-foreground text-sm">({cards.length})</span>
        </div>
        <Button size="sm" onClick={() => setDraft({ ...EMPTY })}>
          <Plus className="mr-1 h-4 w-4" />새 카드
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-destructive border-b px-6 py-2 text-sm">
          {error}
        </p>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto p-6 md:grid-cols-2 xl:grid-cols-4">
        {BOARD_STATUSES.map((status) => {
          const column = columnOf(cards, status)
          return (
            <section
              key={status}
              aria-label={BOARD_STATUS_LABEL[status]}
              className={`bg-muted/40 flex min-h-[12rem] flex-col rounded-lg border ${
                dragId ? "border-dashed" : ""
              }`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                if (dragId) move(dragId, status)
                setDragId(null)
              }}
            >
              <header className="flex items-center justify-between px-3 py-2">
                <h2 className="text-sm font-semibold">{BOARD_STATUS_LABEL[status]}</h2>
                <span className="text-muted-foreground text-xs">{column.length}</span>
              </header>
              <ul className="flex flex-1 flex-col gap-2 px-3 pb-3">
                {column.map((card, index) => (
                  <li
                    key={card.id}
                    draggable
                    onDragStart={() => setDragId(card.id)}
                    onDragEnd={() => setDragId(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (dragId && dragId !== card.id) move(dragId, status, index)
                      setDragId(null)
                    }}
                    className={`bg-background rounded-md border p-3 shadow-sm ${
                      status === "done" ? "opacity-70" : ""
                    } ${dragId === card.id ? "opacity-40" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0 cursor-grab" />
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-1">
                          {card.tag && <Badge variant="secondary">{card.tag}</Badge>}
                          {card.effort && (
                            <span className="text-muted-foreground text-xs">{card.effort}</span>
                          )}
                        </div>
                        <p className="text-sm font-medium">{card.title}</p>
                        {card.detail && (
                          <p className="text-muted-foreground mt-1 line-clamp-3 text-xs whitespace-pre-line">
                            {card.detail}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="왼쪽 열로"
                        disabled={!stepStatus(status, -1)}
                        onClick={() => {
                          const to = stepStatus(status, -1)
                          if (to) move(card.id, to)
                        }}
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="수정"
                        onClick={() =>
                          setDraft({
                            id: card.id,
                            title: card.title,
                            detail: card.detail,
                            tag: card.tag ?? "",
                            effort: card.effort ?? "",
                          })
                        }
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="오른쪽 열로"
                        disabled={!stepStatus(status, 1)}
                        onClick={() => {
                          const to = stepStatus(status, 1)
                          if (to) move(card.id, to)
                        }}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      <Dialog open={!!draft} onOpenChange={(open) => !open && !saving && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "카드 수정" : "새 카드"}</DialogTitle>
            <DialogDescription>
              무엇을 할지 한 줄, 왜·어떻게 할지는 내용에 적어 두면 나중에 다시 봐도 압니다.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="flex flex-col gap-3">
              <Input
                aria-label="제목"
                placeholder="제목"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
              <Textarea
                aria-label="내용"
                placeholder="내용"
                rows={5}
                value={draft.detail}
                onChange={(e) => setDraft({ ...draft, detail: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  aria-label="분류"
                  placeholder="분류 (점검·사전·외부·리포트·공사)"
                  value={draft.tag}
                  onChange={(e) => setDraft({ ...draft, tag: e.target.value })}
                />
                <Input
                  aria-label="예상 기간"
                  placeholder="예상 기간 (2~3일)"
                  value={draft.effort}
                  onChange={(e) => setDraft({ ...draft, effort: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex items-center justify-between sm:justify-between">
            {draft?.id ? (
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={remove}
                disabled={saving}
              >
                삭제
              </Button>
            ) : (
              <span />
            )}
            <Button onClick={submitDraft} disabled={saving || !draft?.title.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

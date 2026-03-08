"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Trash2, Loader2, Save, StickyNote } from "lucide-react"

interface Note {
  id: string
  title: string
  content: string
  updated_at: string
}

export default function AdminNotesPage() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const selected = notes.find((n) => n.id === selectedId) || null

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/notes")
      const data = await res.json()
      if (res.ok) setNotes(data.notes)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  const handleCreate = async () => {
    try {
      const res = await fetch("/api/admin/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "새 메모", content: "" }),
      })
      const data = await res.json()
      if (res.ok) {
        setNotes((prev) => [data.note, ...prev])
        setSelectedId(data.note.id)
      }
    } catch {
      // silent
    }
  }

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    try {
      await fetch("/api/admin/notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selected.id,
          title: selected.title,
          content: selected.content,
        }),
      })
    } catch {
      // silent
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selected || !confirm("이 메모를 삭제하시겠습니까?")) return
    setDeleting(true)
    try {
      await fetch("/api/admin/notes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id }),
      })
      setNotes((prev) => prev.filter((n) => n.id !== selected.id))
      setSelectedId(null)
    } catch {
      // silent
    } finally {
      setDeleting(false)
    }
  }

  const updateSelected = (field: "title" | "content", value: string) => {
    setNotes((prev) => prev.map((n) => (n.id === selectedId ? { ...n, [field]: value } : n)))
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
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <StickyNote className="text-primary h-5 w-5" />
          <h1 className="text-lg font-bold">메모장</h1>
          <span className="text-muted-foreground text-sm">({notes.length})</span>
        </div>
        <Button size="sm" onClick={handleCreate}>
          <Plus className="mr-1 h-4 w-4" />새 메모
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* 왼쪽: 메모 목록 */}
        <div className="w-64 shrink-0 overflow-y-auto border-r">
          {notes.length === 0 ? (
            <p className="text-muted-foreground p-4 text-center text-sm">메모가 없습니다</p>
          ) : (
            notes.map((note) => (
              <button
                key={note.id}
                onClick={() => setSelectedId(note.id)}
                className={`hover:bg-muted/50 w-full border-b px-4 py-3 text-left transition-colors ${
                  selectedId === note.id ? "bg-muted" : ""
                }`}
              >
                <p className="truncate text-sm font-medium">{note.title || "제목 없음"}</p>
                <p className="text-muted-foreground mt-0.5 truncate text-xs">
                  {new Date(note.updated_at).toLocaleDateString("ko-KR")}
                </p>
              </button>
            ))
          )}
        </div>

        {/* 오른쪽: 편집 영역 */}
        <div className="flex min-w-0 flex-1 flex-col">
          {selected ? (
            <>
              <div className="flex items-center gap-2 border-b px-4 py-2">
                <Input
                  className="h-8 flex-1 border-none text-sm font-semibold shadow-none focus-visible:ring-0"
                  value={selected.title}
                  onChange={(e) => updateSelected("title", e.target.value)}
                  placeholder="제목"
                />
                <Button size="sm" variant="ghost" onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <textarea
                className="flex-1 resize-none bg-transparent p-4 text-sm leading-relaxed focus:outline-none"
                value={selected.content}
                onChange={(e) => updateSelected("content", e.target.value)}
                placeholder="메모를 작성하세요..."
              />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-muted-foreground text-sm">메모를 선택하거나 새로 만드세요</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

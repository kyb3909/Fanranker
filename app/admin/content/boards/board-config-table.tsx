"use client"

import { useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Save, Loader2, Plus } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface Board {
  id: string
  slug: string
  name: string
  icon: string | null
  sort_order: number
  is_active: boolean
  description: string | null
  parent_slug: string | null
  created_at: string
}

export function BoardConfigTable({ initialBoards }: { initialBoards: Board[] }) {
  const [boards, setBoards] = useState<Board[]>(initialBoards)
  const [editing, setEditing] = useState<Record<string, Partial<Board>>>({})
  const [loading, setLoading] = useState<string | null>(null)
  const [showAddChannel, setShowAddChannel] = useState(false)
  const [newChannel, setNewChannel] = useState({
    slug: "",
    name: "",
    icon: "",
    description: "",
    parent_slug: "",
  })
  const [addingChannel, setAddingChannel] = useState(false)

  const parentBoards = boards.filter((b) => !b.parent_slug)

  const handleAddChannel = async () => {
    if (!newChannel.slug || !newChannel.name || !newChannel.parent_slug) {
      toast({
        variant: "destructive",
        title: "오류",
        description: "slug, 이름, 상위 게시판은 필수입니다.",
      })
      return
    }
    setAddingChannel(true)
    try {
      const res = await fetch("/api/admin/content/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newChannel),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setBoards((prev) => [...prev, data.board])
      setNewChannel({ slug: "", name: "", icon: "", description: "", parent_slug: "" })
      setShowAddChannel(false)
      toast({ title: "채널 추가 완료", description: `${newChannel.name} 채널이 생성되었습니다.` })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "오류",
        description: error instanceof Error ? error.message : "생성 실패",
      })
    } finally {
      setAddingChannel(false)
    }
  }

  const startEdit = (board: Board, field: string, value: unknown) => {
    setEditing((prev) => ({
      ...prev,
      [board.id]: { ...prev[board.id], [field]: value },
    }))
  }

  const handleSave = async (boardId: string) => {
    const changes = editing[boardId]
    if (!changes || Object.keys(changes).length === 0) return

    setLoading(boardId)
    try {
      const res = await fetch("/api/admin/content/boards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId, ...changes }),
      })
      if (!res.ok) throw new Error((await res.json()).error)

      setBoards((prev) => prev.map((b) => (b.id === boardId ? ({ ...b, ...changes } as Board) : b)))
      setEditing((prev) => {
        const next = { ...prev }
        delete next[boardId]
        return next
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "오류",
        description: error instanceof Error ? error.message : "오류 발생",
      })
    } finally {
      setLoading(null)
    }
  }

  const handleToggleActive = async (board: Board) => {
    setLoading(board.id)
    try {
      const res = await fetch("/api/admin/content/boards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId: board.id, is_active: !board.is_active }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setBoards((prev) =>
        prev.map((b) => (b.id === board.id ? { ...b, is_active: !b.is_active } : b))
      )
    } catch (error) {
      toast({
        variant: "destructive",
        title: "오류",
        description: error instanceof Error ? error.message : "오류 발생",
      })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>순서</TableHead>
              <TableHead>아이콘</TableHead>
              <TableHead>이름</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>상위</TableHead>
              <TableHead>설명</TableHead>
              <TableHead>활성</TableHead>
              <TableHead className="text-right">저장</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {boards.map((board) => {
              const changes = editing[board.id] || {}
              const hasChanges = Object.keys(changes).length > 0
              return (
                <TableRow key={board.id} className={board.parent_slug ? "bg-muted/30" : ""}>
                  <TableCell className="w-20">
                    <Input
                      type="number"
                      className="h-8 w-16 text-sm"
                      defaultValue={board.sort_order}
                      onChange={(e) => startEdit(board, "sort_order", parseInt(e.target.value))}
                    />
                  </TableCell>
                  <TableCell className="w-20">
                    <Input
                      className="h-8 w-16 text-center text-sm"
                      defaultValue={board.icon || ""}
                      onChange={(e) => startEdit(board, "icon", e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-8 text-sm"
                      defaultValue={board.name}
                      onChange={(e) => startEdit(board, "name", e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {board.slug}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {board.parent_slug ? (
                      <Badge variant="secondary" className="text-xs">
                        {board.parent_slug}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-8 text-sm"
                      defaultValue={board.description || ""}
                      placeholder="설명 없음"
                      onChange={(e) => startEdit(board, "description", e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => handleToggleActive(board)}
                      disabled={loading === board.id}
                      className={`relative h-5 w-10 rounded-full transition-colors ${
                        board.is_active ? "bg-primary" : "bg-muted"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                          board.is_active ? "left-5" : "left-0.5"
                        }`}
                      />
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    {hasChanges && (
                      <Button
                        size="sm"
                        onClick={() => handleSave(board.id)}
                        disabled={loading === board.id}
                      >
                        {loading === board.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* 채널 추가 */}
      {showAddChannel ? (
        <div className="space-y-3 rounded-lg border p-4">
          <h3 className="text-sm font-semibold">새 채널 추가</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium">상위 게시판 *</label>
              <select
                value={newChannel.parent_slug}
                onChange={(e) =>
                  setNewChannel((prev) => ({ ...prev, parent_slug: e.target.value }))
                }
                className="bg-background h-8 w-full rounded border px-2 text-sm"
              >
                <option value="">선택</option>
                {parentBoards.map((b) => (
                  <option key={b.slug} value={b.slug}>
                    {b.icon} {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Slug *</label>
              <Input
                className="h-8 text-sm"
                placeholder="gamst"
                value={newChannel.slug}
                onChange={(e) =>
                  setNewChannel((prev) => ({
                    ...prev,
                    slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                  }))
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">이름 *</label>
              <Input
                className="h-8 text-sm"
                placeholder="감스트"
                value={newChannel.name}
                onChange={(e) => setNewChannel((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">아이콘</label>
              <Input
                className="h-8 text-sm"
                placeholder="📺"
                value={newChannel.icon}
                onChange={(e) => setNewChannel((prev) => ({ ...prev, icon: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">설명</label>
            <Input
              className="h-8 text-sm"
              placeholder="채널 설명"
              value={newChannel.description}
              onChange={(e) => setNewChannel((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAddChannel} disabled={addingChannel}>
              {addingChannel ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="mr-1 h-3.5 w-3.5" />
              )}
              추가
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAddChannel(false)}>
              취소
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setShowAddChannel(true)} className="w-full">
          <Plus className="mr-2 h-4 w-4" />새 채널 추가
        </Button>
      )}
    </div>
  )
}

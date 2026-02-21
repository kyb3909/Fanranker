'use client'

import { useState } from 'react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Save, Loader2 } from 'lucide-react'

interface Board {
  id: string
  slug: string
  name: string
  icon: string | null
  sort_order: number
  is_active: boolean
  description: string | null
  created_at: string
}

export function BoardConfigTable({ initialBoards }: { initialBoards: Board[] }) {
  const [boards, setBoards] = useState<Board[]>(initialBoards)
  const [editing, setEditing] = useState<Record<string, Partial<Board>>>({})
  const [loading, setLoading] = useState<string | null>(null)

  const startEdit = (board: Board, field: string, value: unknown) => {
    setEditing(prev => ({
      ...prev,
      [board.id]: { ...prev[board.id], [field]: value },
    }))
  }

  const handleSave = async (boardId: string) => {
    const changes = editing[boardId]
    if (!changes || Object.keys(changes).length === 0) return

    setLoading(boardId)
    try {
      const res = await fetch('/api/admin/content/boards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId, ...changes }),
      })
      if (!res.ok) throw new Error((await res.json()).error)

      setBoards(prev => prev.map(b =>
        b.id === boardId ? { ...b, ...changes } as Board : b
      ))
      setEditing(prev => {
        const next = { ...prev }
        delete next[boardId]
        return next
      })
    } catch (error) {
      alert(error instanceof Error ? error.message : '오류 발생')
    } finally {
      setLoading(null)
    }
  }

  const handleToggleActive = async (board: Board) => {
    setLoading(board.id)
    try {
      const res = await fetch('/api/admin/content/boards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId: board.id, is_active: !board.is_active }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setBoards(prev => prev.map(b =>
        b.id === board.id ? { ...b, is_active: !b.is_active } : b
      ))
    } catch (error) {
      alert(error instanceof Error ? error.message : '오류 발생')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>순서</TableHead>
            <TableHead>아이콘</TableHead>
            <TableHead>이름</TableHead>
            <TableHead>Slug</TableHead>
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
              <TableRow key={board.id}>
                <TableCell className="w-20">
                  <Input
                    type="number"
                    className="w-16 h-8 text-sm"
                    defaultValue={board.sort_order}
                    onChange={(e) => startEdit(board, 'sort_order', parseInt(e.target.value))}
                  />
                </TableCell>
                <TableCell className="w-20">
                  <Input
                    className="w-16 h-8 text-sm text-center"
                    defaultValue={board.icon || ''}
                    onChange={(e) => startEdit(board, 'icon', e.target.value)}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8 text-sm"
                    defaultValue={board.name}
                    onChange={(e) => startEdit(board, 'name', e.target.value)}
                  />
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-xs">{board.slug}</Badge>
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8 text-sm"
                    defaultValue={board.description || ''}
                    placeholder="설명 없음"
                    onChange={(e) => startEdit(board, 'description', e.target.value)}
                  />
                </TableCell>
                <TableCell>
                  <button
                    onClick={() => handleToggleActive(board)}
                    disabled={loading === board.id}
                    className={`w-10 h-5 rounded-full transition-colors relative ${
                      board.is_active ? 'bg-primary' : 'bg-muted'
                    }`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      board.is_active ? 'left-5' : 'left-0.5'
                    }`} />
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
  )
}

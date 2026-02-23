'use client'

import { useState } from 'react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Trash2, Loader2, ArrowUpDown } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface TickerItem {
  id: number
  source_id: string
  community_slug: string
  headline_kr: string | null
  original_title: string
  importance: number
  category: string | null
  ticker_tag: string | null
  posted_at: string
  created_at: string
}

export function TickerManagement({ initialItems, total: initialTotal }: { initialItems: TickerItem[]; total: number }) {
  const [items, setItems] = useState<TickerItem[]>(initialItems)
  const [total, setTotal] = useState(initialTotal)
  const [loading, setLoading] = useState<number | null>(null)

  const fetchItems = async () => {
    const res = await fetch('/api/admin/content/ticker')
    const data = await res.json()
    setItems(data.items ?? [])
    setTotal(data.total ?? 0)
  }

  const handleImportance = async (itemId: number, importance: number) => {
    setLoading(itemId)
    try {
      const res = await fetch('/api/admin/content/ticker', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, importance }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, importance } : i))
    } catch (error) {
      toast({ variant: 'destructive', title: '오류', description: error instanceof Error ? error.message : '오류 발생' })
    } finally {
      setLoading(null)
    }
  }

  const handleDelete = async (itemId: number) => {
    if (!confirm('이 아이템을 삭제하시겠습니까?')) return
    setLoading(itemId)
    try {
      const res = await fetch(`/api/admin/content/ticker?id=${itemId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error)
      await fetchItems()
    } catch (error) {
      toast({ variant: 'destructive', title: '오류', description: error instanceof Error ? error.message : '오류 발생' })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">총 {total}건</span>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>헤드라인</TableHead>
              <TableHead>소스</TableHead>
              <TableHead>커뮤니티</TableHead>
              <TableHead>태그</TableHead>
              <TableHead>중요도</TableHead>
              <TableHead>게시일</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground h-24">
                  아이템이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="max-w-[250px] truncate text-sm">
                    {item.headline_kr || item.original_title}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{item.source_id}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{item.community_slug ?? '-'}</TableCell>
                  <TableCell>
                    {item.ticker_tag && <Badge variant="secondary" className="text-xs">{item.ticker_tag}</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((v) => (
                        <button
                          key={v}
                          onClick={() => handleImportance(item.id, v)}
                          disabled={loading === item.id}
                          className={`w-6 h-6 rounded text-xs font-medium transition-colors ${
                            v <= item.importance
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80'
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(item.posted_at).toLocaleDateString('ko-KR')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => handleDelete(item.id)}
                      disabled={loading === item.id}
                      title="삭제"
                    >
                      {loading === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

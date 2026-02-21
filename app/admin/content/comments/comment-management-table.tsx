'use client'

import { useState } from 'react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Trash2, RotateCcw, Search, Loader2 } from 'lucide-react'

interface Comment {
  id: string
  post_id: string
  user_id: string
  content: string
  vote_count: number
  depth: number
  created_at: string
  deleted_at: string | null
  profiles: { nickname: string } | { nickname: string }[]
  posts: { title: string } | { title: string }[]
}

function getNickname(profiles: unknown): string {
  if (Array.isArray(profiles)) return profiles[0]?.nickname ?? '-'
  if (profiles && typeof profiles === 'object' && 'nickname' in profiles) return (profiles as { nickname: string }).nickname
  return '-'
}

function getPostTitle(posts: unknown): string {
  if (Array.isArray(posts)) return posts[0]?.title ?? '-'
  if (posts && typeof posts === 'object' && 'title' in posts) return (posts as { title: string }).title
  return '-'
}

export function CommentManagementTable({ initialComments, total: initialTotal }: { initialComments: Comment[]; total: number }) {
  const [comments, setComments] = useState<Comment[]>(initialComments)
  const [total, setTotal] = useState(initialTotal)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [showDeleted, setShowDeleted] = useState(false)

  const fetchComments = async (searchTerm?: string, deleted?: boolean) => {
    setSearching(true)
    try {
      const params = new URLSearchParams()
      if (searchTerm) params.set('search', searchTerm)
      if (deleted) params.set('showDeleted', 'true')
      const res = await fetch(`/api/admin/content/comments?${params}`)
      const data = await res.json()
      setComments(data.comments ?? [])
      setTotal(data.total ?? 0)
    } finally {
      setSearching(false)
    }
  }

  const handleAction = async (commentId: string, action: string) => {
    setLoading(commentId)
    try {
      const res = await fetch('/api/admin/content/comments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId, action }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      await fetchComments(search, showDeleted)
    } catch (error) {
      alert(error instanceof Error ? error.message : '오류 발생')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="댓글 내용 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchComments(search, showDeleted)}
            className="pl-8"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchComments(search, showDeleted)} disabled={searching}>
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : '검색'}
        </Button>
        <Button
          variant={showDeleted ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            const next = !showDeleted
            setShowDeleted(next)
            fetchComments(search, next)
          }}
        >
          삭제 포함
        </Button>
        <span className="text-sm text-muted-foreground ml-auto">총 {total}건</span>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>내용</TableHead>
              <TableHead>작성자</TableHead>
              <TableHead>게시글</TableHead>
              <TableHead className="text-right">투표</TableHead>
              <TableHead>작성일</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {comments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground h-24">
                  댓글이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              comments.map((comment) => (
                <TableRow key={comment.id} className={comment.deleted_at ? 'opacity-50' : ''}>
                  <TableCell className="max-w-[250px] truncate text-sm">
                    {comment.depth > 0 && <span className="text-muted-foreground mr-1">↳</span>}
                    {comment.content}
                    {comment.deleted_at && <Badge variant="destructive" className="ml-1 text-xs">삭제됨</Badge>}
                  </TableCell>
                  <TableCell className="text-sm">{getNickname(comment.profiles)}</TableCell>
                  <TableCell className="max-w-[150px] truncate text-xs text-muted-foreground">
                    {getPostTitle(comment.posts)}
                  </TableCell>
                  <TableCell className="text-right text-sm">{comment.vote_count}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(comment.created_at).toLocaleDateString('ko-KR')}
                  </TableCell>
                  <TableCell className="text-right">
                    {comment.deleted_at ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleAction(comment.id, 'restore')}
                        disabled={loading === comment.id}
                        title="복원"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleAction(comment.id, 'delete')}
                        disabled={loading === comment.id}
                        title="삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
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

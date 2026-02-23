'use client'

import { useState } from 'react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Trash2, RotateCcw, Pin, Search, Loader2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface Post {
  id: string
  user_id: string
  title: string
  community_slug: string
  view_count: number
  vote_count: number
  comment_count: number
  is_notice: boolean
  created_at: string
  deleted_at: string | null
  profiles: { nickname: string } | { nickname: string }[]
}

function getNickname(profiles: unknown): string {
  if (Array.isArray(profiles)) return profiles[0]?.nickname ?? '-'
  if (profiles && typeof profiles === 'object' && 'nickname' in profiles) return (profiles as { nickname: string }).nickname
  return '-'
}

export function PostManagementTable({ initialPosts, total: initialTotal }: { initialPosts: Post[]; total: number }) {
  const [posts, setPosts] = useState<Post[]>(initialPosts)
  const [total, setTotal] = useState(initialTotal)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [showDeleted, setShowDeleted] = useState(false)

  const fetchPosts = async (searchTerm?: string, deleted?: boolean) => {
    setSearching(true)
    try {
      const params = new URLSearchParams()
      if (searchTerm) params.set('search', searchTerm)
      if (deleted) params.set('showDeleted', 'true')
      const res = await fetch(`/api/admin/content/posts?${params}`)
      const data = await res.json()
      setPosts(data.posts ?? [])
      setTotal(data.total ?? 0)
    } finally {
      setSearching(false)
    }
  }

  const handleAction = async (postId: string, action: string) => {
    setLoading(postId)
    try {
      const res = await fetch('/api/admin/content/posts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, action }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      await fetchPosts(search, showDeleted)
    } catch (error) {
      toast({ variant: 'destructive', title: '오류', description: error instanceof Error ? error.message : '오류 발생' })
    } finally {
      setLoading(null)
    }
  }

  const handleSearch = () => fetchPosts(search, showDeleted)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="제목 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-8"
          />
        </div>
        <Button variant="outline" size="sm" onClick={handleSearch} disabled={searching}>
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : '검색'}
        </Button>
        <Button
          variant={showDeleted ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            const next = !showDeleted
            setShowDeleted(next)
            fetchPosts(search, next)
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
              <TableHead>제목</TableHead>
              <TableHead>작성자</TableHead>
              <TableHead>커뮤니티</TableHead>
              <TableHead className="text-right">조회</TableHead>
              <TableHead className="text-right">투표</TableHead>
              <TableHead className="text-right">댓글</TableHead>
              <TableHead>작성일</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {posts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground h-24">
                  게시글이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              posts.map((post) => (
                <TableRow key={post.id} className={post.deleted_at ? 'opacity-50' : ''}>
                  <TableCell className="max-w-[200px] truncate">
                    {post.is_notice && <Badge variant="secondary" className="mr-1 text-xs">공지</Badge>}
                    {post.title}
                    {post.deleted_at && <Badge variant="destructive" className="ml-1 text-xs">삭제됨</Badge>}
                  </TableCell>
                  <TableCell className="text-sm">{getNickname(post.profiles)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{post.community_slug ?? '-'}</Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm">{post.view_count}</TableCell>
                  <TableCell className="text-right text-sm">{post.vote_count}</TableCell>
                  <TableCell className="text-right text-sm">{post.comment_count}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(post.created_at).toLocaleDateString('ko-KR')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleAction(post.id, 'toggle_notice')}
                        disabled={loading === post.id}
                        title="공지 토글"
                      >
                        <Pin className="h-3.5 w-3.5" />
                      </Button>
                      {post.deleted_at ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleAction(post.id, 'restore')}
                          disabled={loading === post.id}
                          title="복원"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleAction(post.id, 'delete')}
                          disabled={loading === post.id}
                          title="삭제"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
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

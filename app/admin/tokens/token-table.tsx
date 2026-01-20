'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Loader2, XCircle, RefreshCw, Search, Coins } from 'lucide-react'
import { format } from 'date-fns'

interface TokenBalance {
  user_id: string
  token_balance: number
  last_reset_at: string
  total_tokens_earned: number
  profiles?: {
    nickname: string
    avatar_url: string | null
  }
}

export function TokenMonitoringTable() {
  const [tokens, setTokens] = useState<TokenBalance[]>([])
  const [filteredTokens, setFilteredTokens] = useState<TokenBalance[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const fetchTokenBalances = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      // Note: This requires an admin-only API endpoint
      // For now, we'll show a message that this feature needs backend implementation
      // In production, create /api/admin/tokens/balances route
      const response = await fetch('/api/admin/tokens/balances')
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('토큰 조회 API가 아직 구현되지 않았습니다.')
        }
        const errorData = await response.json()
        throw new Error(errorData.error || '토큰 목록을 불러오는데 실패했습니다.')
      }
      const data = await response.json()
      setTokens(data.tokens || [])
      setFilteredTokens(data.tokens || [])
    } catch (err: any) {
      console.error('Failed to fetch token balances:', err)
      setError(err.message || '토큰 목록을 불러오는데 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTokenBalances()
  }, [fetchTokenBalances])

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredTokens(tokens)
      return
    }

    const query = searchQuery.toLowerCase()
    const filtered = tokens.filter(
      (token) =>
        token.user_id.toLowerCase().includes(query) ||
        token.profiles?.nickname?.toLowerCase().includes(query)
    )
    setFilteredTokens(filtered)
  }, [searchQuery, tokens])

  if (isLoading) {
    return (
      <Card>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center h-64 text-center p-6">
          <XCircle className="h-10 w-10 mb-2 text-red-500" />
          <p className="text-lg font-medium">데이터를 불러오는데 실패했습니다.</p>
          <p className="text-sm text-muted-foreground mt-2">{error}</p>
          <p className="text-xs text-muted-foreground mt-4 max-w-md">
            토큰 모니터링 기능을 사용하려면 <code className="bg-muted px-2 py-1 rounded">/api/admin/tokens/balances</code> API
            엔드포인트가 필요합니다.
          </p>
          <button onClick={fetchTokenBalances} className="mt-4 px-4 py-2 text-sm border rounded hover:bg-muted">
            <RefreshCw className="h-4 w-4 inline mr-2" /> 다시 시도
          </button>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <div className="p-4 border-b flex items-center justify-between gap-4">
        <div className="flex-1 relative max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="사용자 ID 또는 닉네임으로 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <button
          onClick={fetchTokenBalances}
          className="px-4 py-2 text-sm border rounded hover:bg-muted flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" /> 새로고침
        </button>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>사용자</TableHead>
              <TableHead>닉네임</TableHead>
              <TableHead className="text-right">현재 잔액</TableHead>
              <TableHead className="text-right">누적 획득</TableHead>
              <TableHead>마지막 리셋</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTokens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  {searchQuery ? '검색 결과가 없습니다.' : '토큰 데이터가 없습니다.'}
                </TableCell>
              </TableRow>
            ) : (
              filteredTokens.map((token) => (
                <TableRow key={token.user_id}>
                  <TableCell className="font-mono text-sm">{token.user_id.slice(0, 8)}...</TableCell>
                  <TableCell>{token.profiles?.nickname || '-'}</TableCell>
                  <TableCell className="text-right font-semibold">
                    <span className="inline-flex items-center gap-1">
                      <Coins className="h-4 w-4 text-primary" />
                      {token.token_balance.toLocaleString()}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {token.total_tokens_earned.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {token.last_reset_at
                      ? format(new Date(token.last_reset_at), 'yyyy-MM-dd HH:mm')
                      : '-'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="p-4 border-t text-sm text-muted-foreground">
        총 {filteredTokens.length}명의 사용자
      </div>
    </Card>
  )
}

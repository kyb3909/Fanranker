'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { Coins } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export function GoldBalance() {
  const { isSignedIn } = useAuth()
  const [balance, setBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchBalance = useCallback(async () => {
    if (!isSignedIn) return
    try {
      const response = await fetch('/api/gold/balance')
      if (response.ok) {
        const data = await response.json()
        setBalance(data.balance)
      }
    } catch {
      // Silent fail - balance display is non-critical
    } finally {
      setLoading(false)
    }
  }, [isSignedIn])

  useEffect(() => {
    if (!isSignedIn) {
      setLoading(false)
      return
    }
    fetchBalance()
  }, [isSignedIn, fetchBalance])

  useEffect(() => {
    const handleUpdate = () => { fetchBalance() }
    window.addEventListener('goldBalanceUpdate', handleUpdate)
    return () => { window.removeEventListener('goldBalanceUpdate', handleUpdate) }
  }, [fetchBalance])

  if (!isSignedIn || loading) {
    return null
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-amber-500/15 hover:bg-amber-500/25 transition-colors cursor-default"
            role="status"
            aria-label={`보유 골드: ${balance ?? 0}G`}
          >
            <Coins className="h-4 w-4 text-amber-500" aria-hidden="true" />
            <span className="text-sm font-semibold text-foreground">{balance ?? 0}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-center">
          <p className="font-medium">보유 골드</p>
          <p className="text-xs text-muted-foreground">예측 콘텐츠 열람에 사용</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

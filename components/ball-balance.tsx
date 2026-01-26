'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { Circle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface TokenData {
  balance: number
  lastResetAt: string
  totalEarned: number
}

export function BallBalance() {
  const { isSignedIn } = useAuth()
  const [tokenData, setTokenData] = useState<TokenData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isSignedIn) {
      setLoading(false)
      return
    }

    const fetchBalance = async () => {
      try {
        const response = await fetch('/api/tokens/balance')
        if (response.ok) {
          const data = await response.json()
          setTokenData(data)
        }
      } catch (error) {
        console.error('Failed to fetch ball balance:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchBalance()
  }, [isSignedIn])

  if (!isSignedIn || loading) {
    return null
  }

  const balance = tokenData?.balance ?? 0

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-primary/15 hover:bg-primary/25 transition-colors cursor-default"
            role="status"
            aria-label={`보유 볼: ${balance}개`}
          >
            <Circle className="h-4 w-4 fill-primary text-primary" aria-hidden="true" />
            <span className="text-sm font-semibold text-foreground">{balance}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-center">
          <p className="font-medium">오늘 사용 가능한 볼</p>
          <p className="text-xs text-muted-foreground">매일 자정 10볼 충전</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

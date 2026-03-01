"use client"

import { useEffect } from "react"
import { useAuth } from "@clerk/nextjs"
import { Coins } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"

export function GoldBalance() {
  const { isSignedIn } = useAuth()
  const { data, mutate } = useSWR(isSignedIn ? "/api/gold/balance" : null, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  })

  useEffect(() => {
    const handleUpdate = () => {
      mutate()
    }
    window.addEventListener("goldBalanceUpdate", handleUpdate)
    return () => {
      window.removeEventListener("goldBalanceUpdate", handleUpdate)
    }
  }, [mutate])

  if (!isSignedIn || !data) {
    return null
  }

  const balance = data?.balance ?? 0

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="flex cursor-default items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1.5 transition-colors hover:bg-amber-500/25"
            role="status"
            aria-label={`보유 골드: ${balance ?? 0}G`}
          >
            <Coins className="h-4 w-4 text-amber-500" aria-hidden="true" />
            <span className="text-foreground text-sm font-semibold">{balance ?? 0}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-center">
          <p className="font-medium">보유 골드</p>
          <p className="text-muted-foreground text-xs">예측 콘텐츠 열람에 사용</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

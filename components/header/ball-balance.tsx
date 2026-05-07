"use client"

import { useEffect } from "react"
import { useAuth } from "@clerk/nextjs"
import { usePathname } from "next/navigation"
import { Circle } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"

export function BallBalance() {
  const { isSignedIn } = useAuth()
  const pathname = usePathname()
  const isOnboarding = pathname.startsWith("/sign-up")
  const { data: tokenData, mutate } = useSWR(
    isSignedIn && !isOnboarding ? "/api/tokens/balance" : null,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30000,
    }
  )

  // Listen for ball balance update events (dispatched after predictions)
  useEffect(() => {
    const handleBalanceUpdate = () => {
      mutate()
    }
    window.addEventListener("ballBalanceUpdate", handleBalanceUpdate)
    window.addEventListener("dailyRoundReset", handleBalanceUpdate)
    return () => {
      window.removeEventListener("ballBalanceUpdate", handleBalanceUpdate)
      window.removeEventListener("dailyRoundReset", handleBalanceUpdate)
    }
  }, [mutate])

  if (!isSignedIn || !tokenData) {
    return null
  }

  const balance = tokenData?.balance ?? 0

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="flex cursor-default items-center gap-1.5 rounded-full px-2.5 py-1.5 transition-colors"
            role="status"
            aria-label={`보유 볼: ${balance}개`}
            style={{
              background: "rgba(160, 32, 59, 0.12)",
            }}
          >
            <Circle
              className="h-4 w-4"
              aria-hidden="true"
              style={{ fill: "var(--wc-burgundy, #a0203b)", color: "var(--wc-burgundy, #a0203b)" }}
            />
            <span
              className="text-sm font-bold tabular-nums"
              style={{ color: "var(--wc-ink, #1a1416)" }}
            >
              {balance}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-center">
          <p className="font-medium">오늘 사용 가능한 볼</p>
          <p className="text-background mt-0.5 text-xs">매일 23:00 10볼로 리셋</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

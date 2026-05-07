"use client"

import { useEffect } from "react"
import { useAuth } from "@clerk/nextjs"
import { usePathname } from "next/navigation"
import { Coins } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import useSWR from "swr"
import { fetcher } from "@/lib/swr"

export function GoldBalance() {
  const { isSignedIn } = useAuth()
  const pathname = usePathname()
  const isOnboarding = pathname.startsWith("/sign-up")
  const { data, mutate } = useSWR(
    isSignedIn && !isOnboarding ? "/api/gold/balance" : null,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30000,
    }
  )

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
            className="flex cursor-default items-center gap-1.5 rounded-full px-2.5 py-1.5 transition-colors"
            role="status"
            aria-label={`보유 골드: ${balance ?? 0}G`}
            style={{
              background: "rgba(184, 148, 26, 0.15)",
            }}
          >
            <Coins
              className="h-4 w-4"
              aria-hidden="true"
              style={{ color: "var(--wc-gold-deep, #b8941a)" }}
            />
            <span
              className="text-sm font-bold tabular-nums"
              style={{ color: "var(--wc-ink, #1a1416)" }}
            >
              {balance ?? 0}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-center">
          <p className="font-medium">보유 골드</p>
          <p className="text-background mt-0.5 text-xs">예측 콘텐츠 열람에 사용</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
